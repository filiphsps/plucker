# Sudo Escalation for Browser Cookies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When yt-dlp hits a browser-cookie permission error, escalate to root **once** via a native macOS admin prompt, export the cookies to a temp file, and run all resolve/download steps unprivileged against that file.

**Architecture:** Lazy escalation. `resolvePlaylist` is the single chokepoint where the cookie permission error surfaces (before the per-track pool fans out). On that specific error we run one elevated `yt-dlp … --cookies-from-browser <src> --cookies <tmp>` to write a Netscape cookie file (chowned back to the user), then retry resolve and feed the temp file to every download. Downloads never run as root, so output files stay user-owned.

**Tech Stack:** Electron main process (Node), `@vscode/sudo-prompt`, yt-dlp, Vitest, pnpm.

**Deviation from spec (intentional):** The spec proposed extending `JobStatus.phase`/`key` + i18n. During planning we found the resolve panel renders the `log.*` stream, not status `key`s (the `resolve.launching/resolving/resolved` keys are unused for display). So the user-visible "requesting permission" message is a `log.info('cookies', …)` line, and cancel/failure messages flow through the existing `job:start` catch. No `JobStatus`/i18n changes needed.

---

## File Structure

- **Create** `src/main/sudo.ts` — `shellQuote`, `SudoCancelledError`, `execElevated` (wraps `@vscode/sudo-prompt`).
- **Create** `src/main/sudo.test.ts` — unit tests for `shellQuote` + cancel mapping.
- **Create** `src/main/cookies.ts` — `needsCookieEscalation`, `isCookiePermissionError`, `buildExportCommand` (pure), `exportBrowserCookies` (effectful), `cleanupCookieFile`.
- **Create** `src/main/cookies.test.ts` — unit tests for the pure functions.
- **Modify** `src/main/ytdlp.ts` — `DownloadArgsInput.cookieFile?` + cookie-arg branch.
- **Modify** `src/main/ytdlp.test.ts` — `cookieFile` cases.
- **Modify** `src/main/pipeline.ts` — `resolvePlaylist` gains `cookieArgs?`; `runJob` orchestrates lazy escalation + cleanup; `processEntry`/`buildDownloadArgs` call gets `cookieFile`.
- **Modify** `package.json` — add `@vscode/sudo-prompt` dependency.

---

## Task 0: Verify the export mechanism (HARD GATE — no app code yet)

**Files:** none (investigation).

This confirms the two assumptions the whole approach rests on. Do it first; if either fails, switch to the Approach-C fallback noted at the end of this task before writing any code.

- [ ] **Step 1: Capture the exact permission-error string**

Run the **bundled** yt-dlp directly (no sudo) against a URL with the Safari source:

```bash
ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && D=arm64 || D=x64
resources/bin/$D/yt-dlp/yt-dlp_macos \
  --cookies-from-browser safari --skip-download --flat-playlist \
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 | tail -20
```

Expected: an `ERROR:` line about cookies (permission denied / could not read/copy cookie database). **Record the exact wording** — it drives `isCookiePermissionError` in Task 3. If no error appears here (e.g. the dev terminal has Full Disk Access), note that and rely on the regex candidates in Task 3.

- [ ] **Step 2: Confirm `--cookies … ` writes a Netscape file**

In a context where cookie read succeeds (the dev terminal likely has access; otherwise prefix with `sudo`):

```bash
ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && D=arm64 || D=x64
TMP=$(mktemp /tmp/plucker-cookies.XXXX.txt)
resources/bin/$D/yt-dlp/yt-dlp_macos \
  --cookies-from-browser safari --cookies "$TMP" --skip-download --flat-playlist \
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ" >/dev/null 2>&1
head -1 "$TMP"; wc -l "$TMP"; rm -f "$TMP"
```

Expected: `$TMP` starts with `# Netscape HTTP Cookie File` (or `# HTTP Cookie File`) and has >1 line. That proves the export trick works.

- [ ] **Step 3: Decide**

If both pass → proceed to Task 1. If Step 2 produces an empty/missing file → **Approach-C fallback:** instead of `--cookies <tmp>` export, the elevated step copies the Safari cookie store to a user-owned temp dir and downloads point `--cookies-from-browser safari:<dir>` at it. Update Task 3 (`buildExportCommand`) and Task 5 accordingly before continuing. Document the decision in a one-line note at the top of `cookies.ts`.

---

## Task 1: Add the `@vscode/sudo-prompt` dependency

**Files:** Modify `package.json` (+ lockfile).

- [ ] **Step 1: Install**

Run:

```bash
pnpm add @vscode/sudo-prompt
```

Expected: `@vscode/sudo-prompt` appears under `dependencies` in `package.json`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Sanity-check it resolves**

Run:

```bash
node -e "const s=require('@vscode/sudo-prompt'); console.log(typeof s.exec)"
```

Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add @vscode/sudo-prompt for privileged cookie access"
```

---

## Task 2: `src/main/sudo.ts` — elevated exec wrapper

**Files:**
- Create: `src/main/sudo.ts`
- Test: `src/main/sudo.test.ts`

- [ ] **Step 1: Write the failing test**

`src/main/sudo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shellQuote } from './sudo'

describe('shellQuote', () => {
  it('wraps plain tokens in single quotes', () => {
    expect(shellQuote('chrome')).toBe("'chrome'")
  })

  it('quotes spaces and shell metacharacters safely', () => {
    expect(shellQuote('/tmp/a b/$x.txt')).toBe("'/tmp/a b/$x.txt'")
  })

  it('escapes embedded single quotes', () => {
    // foo'bar -> 'foo'\''bar'
    expect(shellQuote("foo'bar")).toBe("'foo'\\''bar'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/sudo.test.ts`
Expected: FAIL — `shellQuote` is not exported / module missing.

- [ ] **Step 3: Write minimal implementation**

`src/main/sudo.ts`:

```ts
import sudoPrompt from '@vscode/sudo-prompt'

/** Thrown when the user dismisses the macOS admin prompt (vs. a real failure). */
export class SudoCancelledError extends Error {
  constructor() {
    super('Cookie access was not granted.')
    this.name = 'SudoCancelledError'
  }
}

/**
 * POSIX-quote a single argument: wrap in single quotes and escape any embedded
 * single quote as `'\''`. Used to build the elevated command string so URLs and
 * paths can never break out into shell injection.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Run a fully-formed shell command as root via the native macOS admin dialog
 * (Touch ID supported), branded with the app name. Callers MUST pre-quote every
 * interpolated value with {@link shellQuote}. Rejects with {@link SudoCancelledError}
 * when the user cancels, or a plain Error otherwise.
 */
export function execElevated(
  command: string,
  opts: { name?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    sudoPrompt.exec(command, { name: opts.name ?? 'Plucker' }, (error, stdout, stderr) => {
      if (error) {
        if (/did not grant permission/i.test(error.message)) reject(new SudoCancelledError())
        else reject(error)
        return
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/sudo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/sudo.ts src/main/sudo.test.ts
git commit -m "feat(sudo): add elevated exec wrapper with safe arg quoting"
```

---

## Task 3: `src/main/cookies.ts` — escalation policy + export command

**Files:**
- Create: `src/main/cookies.ts`
- Test: `src/main/cookies.test.ts`

> If Task 0 chose the Approach-C fallback, adjust `buildExportCommand` to copy the cookie store instead of using `--cookies <tmp>`, and update the regex if Step 1 of Task 0 revealed different wording.

- [ ] **Step 1: Write the failing test**

`src/main/cookies.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { needsCookieEscalation, isCookiePermissionError, buildExportCommand } from './cookies'
import { DEFAULT_SETTINGS } from '../shared/defaults'

describe('needsCookieEscalation', () => {
  for (const source of ['chrome', 'edge', 'safari', 'firefox', 'brave'] as const) {
    it(`is true for ${source}`, () => {
      expect(needsCookieEscalation({ ...DEFAULT_SETTINGS, cookies: { source } })).toBe(true)
    })
  }
  for (const source of ['none', 'auto'] as const) {
    it(`is false for ${source}`, () => {
      expect(needsCookieEscalation({ ...DEFAULT_SETTINGS, cookies: { source } })).toBe(false)
    })
  }
})

describe('isCookiePermissionError', () => {
  it('matches "could not copy ... cookie database"', () => {
    expect(isCookiePermissionError('ERROR: Could not copy Safari cookie database')).toBe(true)
  })
  it('matches a permission-denied cookie line', () => {
    expect(isCookiePermissionError('ERROR: unable to open cookie database: Permission denied')).toBe(
      true
    )
  })
  it('does not match unrelated errors', () => {
    expect(isCookiePermissionError('ERROR: Video unavailable')).toBe(false)
    expect(isCookiePermissionError('ERROR: Requested format is not available')).toBe(false)
  })
})

describe('buildExportCommand', () => {
  it('builds a quoted, chowned export command', () => {
    const cmd = buildExportCommand({
      ytdlpPath: '/bin/yt dlp',
      source: 'safari',
      tmpFile: '/tmp/c.txt',
      probeUrl: 'https://yt/x?a=1&b=2',
      uid: 501,
      gid: 20
    })
    expect(cmd).toContain("'/bin/yt dlp'")
    expect(cmd).toContain("--cookies-from-browser 'safari'")
    expect(cmd).toContain("--cookies '/tmp/c.txt'")
    expect(cmd).toContain("'https://yt/x?a=1&b=2'")
    expect(cmd).toContain('--skip-download')
    expect(cmd).toContain("chown 501:20 '/tmp/c.txt'")
    expect(cmd).toContain("chmod 600 '/tmp/c.txt'")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/cookies.test.ts`
Expected: FAIL — module/functions missing.

- [ ] **Step 3: Write minimal implementation**

`src/main/cookies.ts`:

```ts
import { rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Settings } from '../shared/types'
import { shellQuote, execElevated } from './sudo'
import { log } from './log'

/** True when the cookie source is a real browser (so escalation could be needed). */
export function needsCookieEscalation(settings: Settings): boolean {
  const s = settings.cookies.source
  return s !== 'none' && s !== 'auto'
}

/** Detect the yt-dlp browser-cookie permission failure in combined std streams. */
export function isCookiePermissionError(text: string): boolean {
  if (!/cookie/i.test(text)) return false
  return (
    /could not (copy|read|find).*cookie/i.test(text) ||
    /unable to (open|read).*cookie/i.test(text) ||
    /permission denied/i.test(text) ||
    /operation not permitted/i.test(text)
  )
}

/** Pure: the single elevated shell command that exports cookies + hands the file back. */
export function buildExportCommand(input: {
  ytdlpPath: string
  source: string
  tmpFile: string
  probeUrl: string
  uid: number
  gid: number
}): string {
  const { ytdlpPath, source, tmpFile, probeUrl, uid, gid } = input
  const q = shellQuote
  const ytdlp = [
    q(ytdlpPath),
    '--cookies-from-browser',
    q(source),
    '--cookies',
    q(tmpFile),
    '--flat-playlist',
    '--skip-download',
    '--ignore-config',
    '--no-warnings',
    q(probeUrl)
  ].join(' ')
  return `${ytdlp} && chown ${uid}:${gid} ${q(tmpFile)} && chmod 600 ${q(tmpFile)}`
}

/**
 * Run ONE elevated yt-dlp to export the browser cookies into a user-owned temp
 * file, returning its path. Throws (propagating SudoCancelledError) on failure.
 */
export async function exportBrowserCookies(
  ytdlpPath: string,
  source: string,
  probeUrl: string
): Promise<string> {
  const tmpFile = join(tmpdir(), `plucker-cookies-${process.pid}-${cookieCounter++}.txt`)
  const command = buildExportCommand({
    ytdlpPath,
    source,
    tmpFile,
    probeUrl,
    uid: process.getuid?.() ?? 0,
    gid: process.getgid?.() ?? 0
  })
  log.info('cookies', 'Requesting permission to read browser cookies…')
  await execElevated(command, { name: 'Plucker' })
  let size = 0
  try {
    size = statSync(tmpFile).size
  } catch {
    size = 0
  }
  if (size === 0) {
    cleanupCookieFile(tmpFile)
    throw new Error('Cookie export produced no cookies — the browser store could not be read.')
  }
  log.info('cookies', 'Browser cookies exported; continuing unprivileged.')
  return tmpFile
}

/** Best-effort removal of the temp cookie file. */
export function cleanupCookieFile(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    /* already gone */
  }
}

let cookieCounter = 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/cookies.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/cookies.ts src/main/cookies.test.ts
git commit -m "feat(cookies): add escalation policy and privileged export command"
```

---

## Task 4: `buildDownloadArgs` — use the exported cookie file when present

**Files:**
- Modify: `src/main/ytdlp.ts` (`DownloadArgsInput`, cookie branch ~lines 5-17, 70-72)
- Modify: `src/main/ytdlp.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/main/ytdlp.test.ts` inside `describe('buildDownloadArgs', …)`:

```ts
  it('uses --cookies with the exported file and omits --cookies-from-browser', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'safari' as const } }
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: s,
      ffmpegPath: '/f',
      cookieFile: '/tmp/c.txt'
    })
    expect(args).toContain('--cookies')
    expect(args[args.indexOf('--cookies') + 1]).toBe('/tmp/c.txt')
    expect(args).not.toContain('--cookies-from-browser')
  })

  it('falls back to --cookies-from-browser when no cookieFile is given', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'safari' as const } }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    expect(args).toContain('--cookies-from-browser')
    expect(args).not.toContain('--cookies')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/ytdlp.test.ts`
Expected: FAIL — `cookieFile` not accepted / `--cookies` not added.

- [ ] **Step 3: Implement**

In `src/main/ytdlp.ts`, add the field to `DownloadArgsInput` (after `singleVideo?`):

```ts
  /**
   * Path to a Netscape cookie file exported via a privileged step. When set, the
   * download reads cookies from this file (`--cookies`) instead of the live
   * browser store (`--cookies-from-browser`), so the download runs unprivileged.
   */
  cookieFile?: string
```

Destructure it (line 27):

```ts
  const { url, destFolder, settings, ffmpegPath, singleVideo, cookieFile } = input
```

Replace the cookie branch (current lines 70-72):

```ts
  if (cookieFile) {
    args.push('--cookies', cookieFile)
  } else if (settings.cookies.source !== 'none' && settings.cookies.source !== 'auto') {
    args.push('--cookies-from-browser', settings.cookies.source)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/ytdlp.test.ts`
Expected: PASS (including the pre-existing cookie tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/ytdlp.ts src/main/ytdlp.test.ts
git commit -m "feat(ytdlp): support exported cookie file in download args"
```

---

## Task 5: `resolvePlaylist` — accept extra cookie args

**Files:** Modify `src/main/pipeline.ts` (`resolvePlaylist`, lines 98-140).

No new unit test (covered by `runJob` behavior + existing resolve tests). This is a mechanical signature change.

- [ ] **Step 1: Add the parameter**

Change the signature (line 98-103) to add a trailing `cookieArgs`:

```ts
export async function resolvePlaylist(
  ytdlpPath: string,
  url: string,
  onLine?: (line: string) => void,
  signal?: AbortSignal,
  cookieArgs: string[] = []
): Promise<ResolvedJob> {
```

- [ ] **Step 2: Thread args into the spawn**

In the `spawnManaged` call inside `resolvePlaylist`, insert `cookieArgs` before `url`:

```ts
    const child = spawnManaged(
      ytdlpPath,
      ['--verbose', '--flat-playlist', '--dump-single-json', ...cookieArgs, url],
      {},
      signal
    )
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck:node`
Expected: PASS (no callers broke — the param is optional).

- [ ] **Step 4: Commit**

```bash
git add src/main/pipeline.ts
git commit -m "feat(pipeline): let resolvePlaylist take extra cookie args"
```

---

## Task 6: `runJob` — orchestrate lazy escalation + cleanup

**Files:** Modify `src/main/pipeline.ts` (`runJob` start ~lines 300-318; `processEntry` `buildDownloadArgs` call ~lines 489-495).

- [ ] **Step 1: Import the cookie helpers**

At the top of `src/main/pipeline.ts`, add:

```ts
import {
  needsCookieEscalation,
  isCookiePermissionError,
  exportBrowserCookies,
  cleanupCookieFile
} from './cookies'
```

- [ ] **Step 2: Add escalation state + resolve-with-retry**

Replace the resolve block at the start of `runJob` (the `onStatus?.({ phase: 'resolving', key: 'launching' })` + `const job = await timed('resolve-playlist', …)` section, lines 304-318) with:

```ts
  onStatus?.({ phase: 'resolving', key: 'launching' })

  let cookieFile: string | undefined
  let cookieArgs: string[] = needsCookieEscalation(settings)
    ? ['--cookies-from-browser', settings.cookies.source]
    : []

  const resolveOnce = (): Promise<ResolvedJob> =>
    timed('resolve-playlist', 'pipeline', () =>
      resolvePlaylist(
        bin.ytdlp,
        url,
        (line) => {
          onStatus?.({ phase: 'resolving', line })
          log.debug('yt-dlp', line)
        },
        signal,
        cookieArgs
      )
    )

  let job: ResolvedJob
  try {
    job = await resolveOnce()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const aborted = signal?.aborted ?? false
    if (!aborted && needsCookieEscalation(settings) && !cookieFile && isCookiePermissionError(msg)) {
      cookieFile = await exportBrowserCookies(bin.ytdlp, settings.cookies.source, url)
      cookieArgs = ['--cookies', cookieFile]
      job = await resolveOnce()
    } else {
      throw err
    }
  }
```

> `ResolvedJob` is already imported/defined in this file (see its `export interface ResolvedJob`). `job` is now `let` and assigned in both branches.

- [ ] **Step 3: Wrap the rest of `runJob` so the temp file is always cleaned up**

The remainder of `runJob` (from `onStatus?.({ phase: 'resolving', key: 'resolved', … })` through the final `return`) must run inside a `try { … } finally { if (cookieFile) cleanupCookieFile(cookieFile) }`. Concretely: immediately after the Step-2 block, open `try {`, and just before the function's closing brace add:

```ts
  } finally {
    if (cookieFile) cleanupCookieFile(cookieFile)
  }
```

Indentation of the wrapped body can stay as-is (JS doesn't care); keep the diff minimal by adding only the `try {` line and the `finally` block. Verify with typecheck in Step 5.

- [ ] **Step 4: Pass `cookieFile` into each download**

In `processEntry`, update the `buildDownloadArgs` call (lines 489-495):

```ts
    const args = buildDownloadArgs({
      url: entryUrl(entry),
      destFolder: dest,
      settings,
      ffmpegPath: bin.ffmpeg,
      singleVideo: true,
      cookieFile
    })
```

`cookieFile` is in scope because `processEntry` is a nested closure inside `runJob`.

- [ ] **Step 5: Typecheck + full test run**

Run: `pnpm run typecheck && pnpm test`
Expected: PASS. If typecheck flags the `try/finally` brace balance, fix the wrapping so the existing body sits between `try {` and `finally`.

- [ ] **Step 6: Commit**

```bash
git add src/main/pipeline.ts
git commit -m "feat(pipeline): escalate to root once on cookie permission error"
```

---

## Task 7: Full verification

**Files:** none (verification).

- [ ] **Step 1: Lint, typecheck, test**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: all PASS.

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: build succeeds (confirms `@vscode/sudo-prompt` imports cleanly in the main bundle).

- [ ] **Step 3: Manual smoke test (requires a packaged/dev run with Safari cookies)**

1. Set cookie source to **Safari** in Settings.
2. Start a download that previously failed with the permission error.
3. Confirm: exactly **one** native "Plucker wants to make changes" admin prompt appears; after granting, resolve + downloads proceed; resulting `.mp3`s are owned by your user (`ls -l`); no `plucker-cookies-*.txt` left in `$TMPDIR` afterward.
4. Re-run and **cancel** the prompt: the job fails cleanly with "Cookie access was not granted." (red resolve panel), no crash, no orphaned temp file.

- [ ] **Step 4: Final commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "test: verify sudo cookie escalation end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** sudo wrapper (Task 2) ✓; export-once + cleanup (Task 3) ✓; `buildDownloadArgs` cookie file (Task 4) ✓; resolve threading + private-playlist fix (Task 5) ✓; lazy detect→escalate→retry orchestration (Task 6) ✓; macOS-only behavior (escalation only triggers on the cookie error; non-darwin yt-dlp won't emit it, and `--cookies-from-browser` path is unchanged) ✓; verification incl. user-owned files + cancel path (Task 7) ✓.
- **Spec deviations:** `JobStatus`/i18n changes dropped in favor of a `log.info('cookies', …)` line (justified at top). The "authorizing" phase is not added.
- **Type consistency:** `cookieFile?: string` (ytdlp) ↔ `cookieFile` var (pipeline); `cookieArgs: string[]` (resolvePlaylist ↔ runJob); `exportBrowserCookies(ytdlpPath, source, url)` matches its definition; `buildExportCommand` object arg matches test.
- **Risk:** Task 0 gates the two yt-dlp assumptions before any code, with a documented Approach-C fallback.
