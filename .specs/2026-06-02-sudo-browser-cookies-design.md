# Privileged browser-cookie access (sudo escalation)

**Date:** 2026-06-02
**Status:** Approved design — pending implementation plan

## Problem

When a real browser is selected as the cookie source (`cookies.source` ∈
`chrome | edge | safari | firefox | brave`), the packaged macOS app fails:
yt-dlp cannot read the browser's cookie store and aborts with a **permission
error** ("could not copy / read cookie database", permission denied). The same
yt-dlp command run with `sudo` in a terminal succeeds.

We need the app to **escalate to root on demand** — only when the permission
error actually occurs — using a flow that integrates properly with Electron
(app-branded native admin prompt, status surfaced through the renderer, works on
unsigned builds).

## Constraints & decisions

- **macOS-only.** The app ships macOS DMGs (arm64 + x64); gate all escalation on
  `process.platform === 'darwin'`. Non-darwin keeps today's direct
  `--cookies-from-browser` behavior.
- **Unsigned builds.** `SMJobBless` / `SMAppService` privileged helpers require a
  Developer-ID-signed app and are therefore **out of scope**. We use
  `@vscode/sudo-prompt` (the maintained fork used by VS Code), which shows the
  native macOS admin dialog (Touch ID supported) without signing.
- **Escalate lazily** — only after an actual cookie permission error, never
  pre-emptively. Systems where `--cookies-from-browser` already works get no
  prompt.
- **Escalate once per job, never per track.** The pipeline fans a playlist out
  into one concurrent yt-dlp process per track (`pipeline.ts`), so detection and
  escalation must happen at a single chokepoint (`resolvePlaylist`), before the
  per-track pool starts.
- **Downloads stay owned by the user.** We do not run the actual downloads as
  root (that would create root-owned `.mp3`s that break the pipeline's
  hashing/transform/cleanup). Instead the one privileged step exports the cookies
  to a temp file, then everything runs unprivileged against that file.

## Architecture (Approach A — export cookies once, then run unprivileged)

### New module: `src/main/sudo.ts`

Thin wrapper around `@vscode/sudo-prompt`.

- `execElevated(command: string, args: string[], opts?: { name?: string }): Promise<{ stdout: string; stderr: string }>`
  - Builds a single shell command string by POSIX-quoting `command` + each arg
    via an internal `shellQuote(s: string)` helper (single-quote wrapping with
    `'\''` escaping). **Never** string-interpolates URLs/paths unquoted → no
    command injection.
  - Calls `sudoPrompt.exec(cmdString, { name: opts?.name ?? 'Plucker' }, cb)`.
    (`name` must be alphanumeric + spaces, ≤70 chars — "Plucker" is valid.)
  - Resolves with `{ stdout, stderr }`; rejects with `SudoCancelledError` when
    the user dismisses the prompt (sudo-prompt error message
    "User did not grant permission."), or a plain `Error` otherwise.
- `class SudoCancelledError extends Error` — typed so callers distinguish a
  user cancel from a real failure.
- `shellQuote` is exported for unit testing.

### New module: `src/main/cookies.ts`

- `cookieSource(settings: Settings): CookieSource` — convenience accessor.
- `needsCookieEscalation(settings: Settings): boolean` — `true` iff
  `cookies.source` is a real browser (not `none` / `auto`).
- `isCookiePermissionError(text: string): boolean` — matches the yt-dlp
  permission failure in stderr. **Exact patterns confirmed against the bundled
  binary in plan step 1** (candidates: `/could not (copy|read).*cookie/i`,
  `/permission denied/i` near "cookie", `/unable to (open|read).*cookie/i`).
- `exportBrowserCookies(ytdlpPath: string, source: CookieSource, probeUrl: string, signal?: AbortSignal): Promise<string>`
  - Computes a temp path via `os.tmpdir()` + a non-random unique name (no
    `Math.random`/`Date.now` in main is fine here, but prefer
    `app.getPath('temp')` + pid + counter).
  - Runs **one** elevated command (via `execElevated`):
    `yt-dlp --cookies-from-browser <source> --cookies <tmp> --flat-playlist --skip-download --ignore-config <probeUrl>`
    chained with `&& chown <uid>:<gid> <tmp> && chmod 600 <tmp>`
    (uid/gid from `process.getuid()` / `process.getgid()`), so the resulting
    file is owned + readable by the invoking user.
  - Returns the temp file path. Throws (propagating `SudoCancelledError`) on
    failure.
- `cleanupCookieFile(path: string): void` — best-effort `rmSync(path, { force: true })`.

### Changed: `src/main/ytdlp.ts` — `buildDownloadArgs`

Add `cookieFile?: string` to `DownloadArgsInput`. Cookie-arg logic becomes:

- If `cookieFile` is set → push `--cookies <cookieFile>`; **do not** push
  `--cookies-from-browser` (mutually exclusive).
- Else keep current behavior: push `--cookies-from-browser <source>` when
  `source` is a real browser.

### Changed: `src/main/pipeline.ts` — `resolvePlaylist`

Add optional `cookieArgs?: string[]` appended to the yt-dlp argv (between the
fixed flags and `url`). Default `[]` preserves today's no-cookie resolve.

> Note: resolve currently passes **no** cookies, so private/age-restricted
> playlists can't resolve today. Threading cookie args here fixes that as a
> side benefit.

### Changed: `src/main/pipeline.ts` — `runJob` orchestration

```
cookieArgs = needsCookieEscalation(settings)
  ? ['--cookies-from-browser', settings.cookies.source]
  : []
cookieFile = undefined
try {
  try {
    job = await resolvePlaylist(bin.ytdlp, url, onLine, signal, cookieArgs)
  } catch (err) {
    if (needsCookieEscalation(settings) && !cookieFile
        && isCookiePermissionError(String(err.message))) {
      onStatus?.({ phase: 'authorizing', key: 'cookies' })
      cookieFile = await exportBrowserCookies(bin.ytdlp, settings.cookies.source, url, signal)
      cookieArgs = ['--cookies', cookieFile]
      job = await resolvePlaylist(bin.ytdlp, url, onLine, signal, cookieArgs)
    } else {
      throw err
    }
  }
  // ...existing pipeline; buildDownloadArgs called with cookieFile...
} finally {
  if (cookieFile) cleanupCookieFile(cookieFile)
}
```

`processEntry` passes `cookieFile` into `buildDownloadArgs`. Because the same
user that exported the file runs the downloads, no per-track escalation can be
needed.

### Changed: IPC / types / i18n

- `src/shared/types.ts` — `JobStatus.phase` gains `'authorizing'`; `key` gains
  `'cookies'`.
- Renderer status panel maps `authorizing`/`cookies` → translated string, e.g.
  **"Requesting permission to read browser cookies…"** (en + de).
- User cancel (`SudoCancelledError`) propagates out of `runJob`; the existing
  `job:start` catch in `index.ts` records a failed/cancelled history entry. Add a
  translated reason — **"Cookie access was not granted."**

## Error handling

| Case                                                     | Behavior                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `--cookies-from-browser` works (no perm error)           | No prompt; proceed as today.                                                                                   |
| Cookie permission error, user grants                     | Export → retry → downloads use temp file.                                                                      |
| Cookie permission error, user cancels                    | `SudoCancelledError` → job fails cleanly, history entry, no crash.                                             |
| Export runs as root but still can't read/decrypt cookies | yt-dlp stderr surfaced via the retry's thrown error (no infinite loop — escalation is attempted at most once). |
| Abort during/after prompt                                | sudo-prompt cannot be aborted mid-dialog; we let it settle, then `finally` cleans the temp file.               |
| Non-darwin                                               | No escalation path; direct `--cookies-from-browser`.                                                           |
| Temp file always removed                                 | `finally` → `cleanupCookieFile`.                                                                               |

## Testing

- `ytdlp.test.ts` (extend): `cookieFile` set → contains `--cookies <file>`,
  **not** `--cookies-from-browser`; mutual exclusion; absent → current behavior.
- `cookies.test.ts` (new):
  - `needsCookieEscalation` — each browser → true; `none`/`auto` → false.
  - `isCookiePermissionError` — matches the confirmed permission strings; does
    **not** match unrelated yt-dlp errors (bad URL, format-not-available).
- `sudo.test.ts` (new): `shellQuote` quotes spaces/quotes/`$` safely; command
  construction yields the expected single string for representative args (inject
  the exec fn — never spawn a real prompt).
- Manual verification (cannot unit-test a password dialog): on a real packaged
  build with Safari source, confirm the prompt appears once, cookies export,
  downloads succeed and files are user-owned, temp file is gone afterward.

## Dependency

- Add `@vscode/sudo-prompt` to `dependencies` via **pnpm**. Pure-JS (spawns
  `osascript`), safe in the Electron main process and inside asar. Verify
  electron-builder packaging keeps it available at runtime.

## Plan step 1 (must run before building)

Reproduce the user's permission error with the **bundled** yt-dlp + Safari to
capture the **exact** stderr text (drives `isCookiePermissionError`), and
confirm `--cookies-from-browser safari --cookies <file>` actually **writes** the
Netscape cookie file. If yt-dlp does not write the file via that flag
combination, fall back to: elevated `cp` of the cookie store to a user-owned
temp dir + point `--cookies-from-browser safari:<dir>` at it (Approach C
variant). Resolve this before implementing the rest.

## Non-goals

- Signed `SMJobBless`/`SMAppService` privileged helper (requires code signing).
- Running downloads as root.
- Windows/Linux escalation.
- Persisting/caching the granted privilege across jobs.
