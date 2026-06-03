# Last-resort recovery (auto-rollback) + reliable post-update relaunch

**Date:** 2026-06-03
**Status:** Approved (design) — pending implementation plan
**Platforms:** macOS only (the self-install/rollback path; other platforms stay notify-only, as the updater already is)

## Problem

Two related failure modes can leave a user with no working app:

1. **A self-update installs but the app never reopens** ("nothing reopens"). The
   bundle swap succeeds, but the relaunch step fails silently, so the user is left
   with no app until they manually relaunch from `/Applications`.
2. **The app keeps failing to start** — it crashes during startup, or the user
   force-closes it repeatedly because it hangs with no window — with no automatic
   way out. A bad release can strand the user.

We want a last-resort safety guard that, when the app repeatedly fails to become
usable, **rolls itself back to the previous release** and relaunches, so the user
is never left without a working app.

## Scope

Two **independent commits**:

- **Commit A — `fix(updater):`** make the post-update relaunch reliable (the
  "nothing reopens" bug).
- **Commit B — `feat(recovery):`** the last-resort safety guard that rolls back to
  the previous release when the app keeps failing to start.

Out of scope: changing the normal (user-initiated / background) update flow;
non-macOS auto-install; signing/notarization.

---

## Commit A — reliable relaunch after self-update

### Root cause (to confirm against `plucker.log` during implementation)

`src/main/app/updater/mac-installer.ts` builds a detached bash script
(`buildSwapScript`) that waits for the app to quit, swaps the `.app` bundle, then
relaunches with a bare:

```bash
open '<bundle>'
```

under `set -e`. Two known macOS failure modes fit the "nothing reopens" symptom:

- After `app.quit()`, LaunchServices can still hold the just-terminated instance,
  so `open` (without `-n`) reactivates the dead record and launches nothing.
- `open` returns non-zero transiently and `set -e` aborts the script before any
  retry. The script never logged whether `open` succeeded, so the failure was
  invisible.

### Fix

In `buildSwapScript` (and `installMacUpdate`):

- Refresh the LaunchServices registration of the freshly-swapped bundle
  (`lsregister -f '<bundle>'`) before launching.
- Relaunch with `open -n '<bundle>'`, with the `open` call **outside** `set -e`,
  retried a few times with a short backoff, **logging each attempt's exit code** to
  `plucker.log` (this both fixes and instruments the bug).
- If `open` still fails after retries, **direct-launch the executable** as a
  fallback: `"<bundle>/Contents/MacOS/<exeName>" &`. This bypasses LaunchServices
  entirely.
  - Requires threading `exeName` into `buildSwapScript` / `installMacUpdate`,
    derived by the caller from `app.getPath('exe')` (basename).
- The `relaunch: false` (install-on-quit) path is unchanged — it must still skip
  the relaunch entirely.

### Tests (`mac-installer.test.ts`, extended)

- Relaunch uses `open -n`.
- Relaunch is retried and logs exit codes.
- `lsregister -f` runs before relaunch.
- Direct-binary fallback is present and references `<bundle>/Contents/MacOS/<exeName>`.
- `relaunch: false` still produces no relaunch (existing test preserved).
- Path quoting still survives spaces (existing test preserved).

---

## Commit B — the safety guard

### New module: `src/main/app/recovery/`

- **`recovery-state.ts`** — JSON persistence at `~/.plucker/recovery-state.json`,
  loaded/saved like `settings.ts`. Kept **separate from `config.json`** so a factory
  reset never wipes recovery bookkeeping, and so the two concerns stay isolated.
  Tolerant of a missing/corrupt file (falls back to a default state).
- **`launch-health.ts`** — a **pure, clock-injected state machine** (no `electron`
  import, unit-tested under plain Node) that owns all the decision logic: is this a
  bad launch? should we recover? what is the next rollback target?
- **`safety-guard.ts`** — thin Electron wiring: the no-window watchdog timer, the
  window-visibility hook, the `before-quit` hook, and the recovery trigger. Calls
  into the two modules above; holds no decision logic itself.

### Persisted state shape

```jsonc
{
  "launchInProgress": boolean,        // true while a launch hasn't become healthy or cleanly quit
  "badStreak": number,                // consecutive bad launches
  "lastRollbackVersion": string | null,
  "rollbackAttempts": number,         // rollbacks within the current recovery episode
  "pendingRecoveryNotice": { "rolledBackTo": string, "from": string } | null
}
```

### Health state machine

The crux is distinguishing a **force-close/crash before the app was usable** (which
should count) from a **clean quit or a force-quit of a working app** (which should
not). This is achieved with a single persisted `launchInProgress` flag, not by
trying to observe the kill itself:

- **Startup** (early in `app.whenReady`, after `bootstrapFileLogging`): if
  `launchInProgress` is still `true` from last time, the previous session started
  but never became healthy **and** never cleanly exited → it crashed or was
  force-killed before becoming usable → `badStreak += 1`. Then set
  `launchInProgress = true` and persist.
- **Healthy** = the main window becomes **visible** (`win.on('show')`) **and**
  stays alive for `HEALTHY_SETTLE_MS`. On healthy:
  `launchInProgress = false`, `badStreak = 0`, clear the rollback episode
  (`rollbackAttempts = 0`, `lastRollbackVersion = null`), and cancel the watchdog.
- **Clean quit** (`before-quit`, e.g. ⌘Q): set `launchInProgress = false`. A clean
  quit is never a bad launch.

Net effect:

| Last session ended by…                    | Counts as bad launch? |
| ----------------------------------------- | --------------------- |
| Crash/force-kill **before** healthy        | **Yes**               |
| ⌘Q (clean quit) before healthy             | No                    |
| Force-kill/crash **after** healthy         | No (already cleared)  |
| ⌘Q after healthy                           | No                    |

This is exactly the agreed "only early / never-healthy" rule.

> **Visibility hook note:** `win.on('show')` fires when the window actually becomes
> visible, which is distinct from (and later than) the recently-added Dock-icon
> reveal in `createWindow()` (which fires when the window's process *starts*). The
> health signal keys off real visibility, so the two do not conflict. In
> dev/screenshot mode the window is shown via `showInactive()`, which still emits
> `show`.

### Two triggers → one `triggerRecovery()`

1. **No-window watchdog (this session):** a timer set at `WATCHDOG_MS` after
   `app.whenReady`. When it fires, if no window is visible, call
   `triggerRecovery()`. This is the "no window visible within X time" trigger.
2. **Force-close / crash loop (across launches):** at startup, if
   `badStreak >= BAD_LAUNCH_THRESHOLD`, call `triggerRecovery()` immediately instead
   of attempting a normal startup that has already failed several times. This is the
   "force closed several times" trigger.

### Rollback path (extends the updater)

`src/main/app/updater/github-download.ts`:

- Add `fetchReleases()` to read the GitHub release **list** (not just
  `/releases/latest`), skipping drafts/prereleases.
- Generalize the downloader so it can install a **specific** release's per-arch zip
  (today it hardcodes `LATEST_RELEASE_API`). Integrity for a specific release:
  fetch that release's `latest-mac.yml` asset to read the expected SHA-512; if
  absent, fall back to a full download without verification and log it (recovery is
  best-effort).

Target selection (`launch-health.ts`, pure + unit-tested):

- Pick the **newest release strictly older than the running version** that is not
  `lastRollbackVersion`. From the latest version this is the **2nd-newest release**
  ("second to latest", as requested); on a repeat episode it steps further back.
- Never roll back to a version `>=` the currently running version.

Install + relaunch:

- Use the hardened `installMacUpdate` from Commit A (swap + reliable relaunch).
- Before relaunching: set `pendingRecoveryNotice = { rolledBackTo, from }` and
  `rollbackAttempts += 1`, then persist.

Loop guard:

- If `rollbackAttempts >= MAX_ROLLBACKS`, **stop** auto-rollback and show a native
  dialog pointing at the Releases page for a manual download. Never spiral.

Recovery UX — **silent, then notify after**:

- The rollback runs with **no up-front prompt** (the broken app may not be able to
  render UI; the Dock icon stays hidden during a windowless startup rollback, which
  fits the silent UX).
- After the older build relaunches and reaches **healthy**, it consumes
  `pendingRecoveryNotice` and shows a one-time native dialog:
  *"Plucker had trouble starting and was rolled back to X.Y.Z."* — then clears the
  notice and the episode.

Offline / failure handling:

- Rollback is best-effort. On any download/install failure: log it,
  `rollbackAttempts += 1`, and **fall through to a normal startup attempt** (this
  launch might work) rather than getting stuck. The loop guard still bounds retries.

### Tunable constants (stated; trivially changed)

| Constant               | Default | Meaning                                                  |
| ---------------------- | ------- | -------------------------------------------------------- |
| `WATCHDOG_MS`          | 20 s    | No window visible within this → recover.                 |
| `BAD_LAUNCH_THRESHOLD` | 3       | Consecutive bad launches before recovering at startup.   |
| `HEALTHY_SETTLE_MS`    | 10 s    | Window must stay visible this long to count as healthy.  |
| `MAX_ROLLBACKS`        | 2       | Rollback attempts per episode before giving up to manual.|

### Wiring in `src/main/index.ts`

- Initialize the safety guard early inside `app.whenReady` (after
  `bootstrapFileLogging`, around `migrateLegacyConfig`): read state, run the
  startup bad-launch accounting, and — if `badStreak >= BAD_LAUNCH_THRESHOLD` —
  trigger recovery before normal startup; otherwise continue and arm the watchdog.
- Hook the main window's `show` event (in `createWindow`) into the guard's
  "window visible" path so the healthy-settle timer can start.
- Hook `before-quit` into the guard's clean-quit path (alongside the existing
  shutdown work).
- After reaching healthy, consume any `pendingRecoveryNotice` and show the
  post-recovery dialog.

### Testing

- **`launch-health.test.ts`** (pure, clock-injected): bad-launch counting,
  healthy reset, clean-quit handling, watchdog and streak triggers,
  rollback-target selection (2nd-newest, step-back, never-upgrade), loop-guard cap.
- **`recovery-state.test.ts`**: load/save round-trip, missing-file default,
  corrupt-file tolerance.
- **`mac-installer.test.ts`** (extended): the hardened relaunch (see Commit A).
- **`github-download` tests**: release-list parse, arch + version pick,
  `latest-mac.yml` SHA-512 lookup, best-effort fallback when absent.

## Conventions

- Specs live in `.specs/` (per `CLAUDE.md`); work proceeds on `master` (no new
  branch). Commit messages follow Conventional Commits — `fix(updater): …` for
  Commit A, `feat(recovery): …` for Commit B.
- Shared/UI-agnostic helpers belong in `src/shared/`; main-only helpers in
  `src/main/`. Each new module gets a colocated `*.test.ts`.
