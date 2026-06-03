# Last-resort Recovery + Reliable Post-update Relaunch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the macOS self-update relaunch reliable, and add a last-resort safety guard that rolls Plucker back to the previous release when it repeatedly fails to become usable — so the user is never stranded without a working app.

**Architecture:** Commit A hardens the detached swap script (`mac-installer.ts`) so the post-update relaunch survives LaunchServices reactivating the dying instance (`open -n` + retry + `lsregister` + direct-binary fallback + logging). Commit B adds a pure, unit-tested launch-health state machine + JSON persistence under `~/.plucker/`, a no-window watchdog, and a rollback path that fetches the GitHub release list, picks the newest release older than the running version, downloads it (verified against that release's `latest-mac.yml`), and installs it via the hardened installer. All decision logic is pure and tested; the Electron wiring is thin glue.

**Tech Stack:** TypeScript (no semicolons, single quotes, 2-space indent), Electron 42, electron-updater (check only), Vitest, pnpm. Native macOS tools (`ditto`, `open`, `lsregister`) via a detached bash script.

**Conventions for every task:**
- Run scripts via **pnpm** only (`pnpm test`, `pnpm typecheck`, `pnpm lint`).
- Tests are colocated `*.test.ts`. Files that import `electron` at load time must `vi.mock('electron', …)` (see `github-download.test.ts`).
- Source design doc: `.specs/2026-06-03-safety-guard-rollback-design.md`.
- Work on `master` (no new branch). Conventional Commits.
- After each code change, check LSP diagnostics and fix before committing.

---

## File Structure

**Commit A (bugfix):**
- Modify `src/main/app/updater/mac-installer.ts` — hardened relaunch in `buildSwapScript`; thread `exeName` through `installMacUpdate`.
- Modify `src/main/app/updater/updater.ts` — pass `exeName` at the 3 `installMacUpdate` call sites.
- Modify `src/main/app/updater/mac-installer.test.ts` — extend.

**Commit B (feature):**
- Create `src/shared/compare-semver.ts` (+ test) — `compareSemver`, `extractVersion`.
- Create `src/main/app/updater/latest-mac-yml.ts` (+ test) — `parseLatestMacYml`.
- Modify `src/main/app/updater/github-download.ts` (+ test) — `GithubRelease`, `fetchReleases`, `downloadReleaseZip`, generic `fetchJson<T>`, internal `fetchText`.
- Create `src/main/app/recovery/recovery-state.ts` (+ test) — `RecoveryState`, load/save at `~/.plucker/recovery-state.json`.
- Create `src/main/app/recovery/launch-health.ts` (+ test) — pure decision state machine.
- Create `src/main/app/recovery/rollback.ts` — rollback orchestration (Electron glue; not unit-tested, mirrors `updater.ts`).
- Create `src/main/app/recovery/safety-guard.ts` — watchdog + lifecycle wiring (Electron glue; not unit-tested).
- Modify `src/main/index.ts` — wire the guard into startup, window-visible, and `before-quit`.

**Testing boundary (deliberate):** `rollback.ts` and `safety-guard.ts` are thin Electron/network glue and are not unit-tested directly, exactly like the existing `updater.ts`. Their substance lives in the pure modules (`launch-health`, `recovery-state`, `compare-semver`, `latest-mac-yml`, and `github-download`'s pure pickers), which are fully tested.

---

# COMMIT A — `fix(updater): reliably relaunch after a self-update`

### Task 1: Harden the post-update relaunch

**Files:**
- Modify: `src/main/app/updater/mac-installer.ts`
- Modify: `src/main/app/updater/updater.ts`
- Test: `src/main/app/updater/mac-installer.test.ts`

**Background:** Today the swap script ends with bare `open '<bundle>'` under `set -e`. After `app.quit()`, LaunchServices can reactivate the just-killed instance (so `open` launches nothing), or `open` returns non-zero and `set -e` aborts — and nothing was ever logged. Symptom: "nothing reopens." Fix: `lsregister -f`, `open -n` retried outside `set -e` with per-attempt exit-code logging, and a direct-binary fallback. This needs the executable name, so thread `exeName` through.

- [ ] **Step 1: Update the existing tests to pass `exeName`, and add new assertions**

Replace the entire `describe('buildSwapScript', …)` block in `src/main/app/updater/mac-installer.test.ts` (keep the `appBundlePath` block above it untouched) with:

```ts
describe('buildSwapScript', () => {
  const script = buildSwapScript({
    zipPath: '/tmp/cache/update.zip',
    bundlePath: '/Applications/Plucker.app',
    pid: 4321,
    logPath: '/Users/me/.plucker/plucker.log',
    exeName: 'Plucker'
  })

  it('waits for the running pid before swapping', () => {
    expect(script).toContain('while kill -0 4321 2>/dev/null; do sleep 0.2; done')
  })

  it('stages on the same volume, then removes the old bundle and swaps in the new one', () => {
    expect(script).toContain(`mktemp -d '/Applications'/.plucker-update.XXXXXX`)
    expect(script).toContain(`ditto -x -k '/tmp/cache/update.zip' "$STAGE"`)
    expect(script).toContain(`rm -rf '/Applications/Plucker.app'`)
    expect(script).toContain(`mv "$STAGE"/'Plucker.app' '/Applications/Plucker.app'`)
  })

  it('relaunches with a fresh instance (open -n), retrying', () => {
    expect(script).toContain(`open -n '/Applications/Plucker.app'`)
    expect(script).toContain('for i in 1 2 3 4 5; do')
  })

  it('refreshes the LaunchServices registration before relaunching', () => {
    expect(script).toContain('lsregister')
    expect(script).toContain(`-f '/Applications/Plucker.app'`)
  })

  it('logs each relaunch attempt outcome', () => {
    expect(script).toContain('[plucker-update] relaunched')
    expect(script).toContain('[plucker-update] open attempt')
  })

  it('falls back to launching the executable directly when open keeps failing', () => {
    expect(script).toContain(`'/Applications/Plucker.app/Contents/MacOS/Plucker'`)
  })

  it('skips the relaunch when relaunch is false (install-on-quit)', () => {
    const s = buildSwapScript({
      zipPath: '/tmp/cache/update.zip',
      bundlePath: '/Applications/Plucker.app',
      pid: 4321,
      logPath: '/Users/me/.plucker/plucker.log',
      exeName: 'Plucker',
      relaunch: false
    })
    expect(s).not.toContain('open -n')
    expect(s).toContain('not relaunching')
    expect(s).toContain(`mv "$STAGE"/'Plucker.app' '/Applications/Plucker.app'`)
  })

  it('quotes paths so spaces survive the shell', () => {
    const s = buildSwapScript({
      zipPath: '/tmp/u.zip',
      bundlePath: '/Applications/My App.app',
      pid: 1,
      logPath: '/tmp/l.log',
      exeName: 'My App'
    })
    expect(s).toContain(`rm -rf '/Applications/My App.app'`)
    expect(s).toContain(`mv "$STAGE"/'My App.app' '/Applications/My App.app'`)
    expect(s).toContain(`'/Applications/My App.app/Contents/MacOS/My App'`)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- src/main/app/updater/mac-installer.test.ts`
Expected: FAIL — `buildSwapScript` doesn't accept `exeName`, and assertions for `open -n` / `lsregister` / retry / direct-binary fallback are missing.

- [ ] **Step 3: Rewrite `buildSwapScript` and `installMacUpdate` to harden the relaunch**

In `src/main/app/updater/mac-installer.ts`, replace the `buildSwapScript` function and the `installMacUpdate` function with:

```ts
export function buildSwapScript(opts: {
  zipPath: string
  bundlePath: string
  pid: number
  logPath: string
  /** Bundle executable name (basename of `app.getPath('exe')`) for the direct-launch fallback. */
  exeName: string
  relaunch?: boolean
}): string {
  const { zipPath, bundlePath, pid, logPath, exeName } = opts
  const relaunch = opts.relaunch ?? true
  const slash = bundlePath.lastIndexOf('/')
  const parent = bundlePath.slice(0, slash) || '/'
  const basename = bundlePath.slice(slash + 1)
  // Single-quote every interpolated path and escape embedded single quotes so paths
  // with spaces (e.g. "/Applications/Plucker.app") survive the shell unharmed.
  const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
  const exePath = `${bundlePath}/Contents/MacOS/${exeName}`
  // Relaunch is deliberately OUTSIDE `set -e`: a bare `open` can reactivate the just-killed
  // instance (launching nothing) or fail transiently. We force a fresh instance (`open -n`),
  // retry, log each attempt, and finally launch the binary directly — bypassing LaunchServices.
  const relaunchBlock = `echo "[plucker-update] refreshing LaunchServices registration"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"
[ -x "$LSREGISTER" ] && "$LSREGISTER" -f ${q(bundlePath)} || echo "[plucker-update] lsregister unavailable; continuing"
launched=0
for i in 1 2 3 4 5; do
  if /usr/bin/open -n ${q(bundlePath)}; then
    echo "[plucker-update] relaunched (attempt $i)"
    launched=1
    break
  fi
  echo "[plucker-update] open attempt $i failed (exit $?)"
  sleep 0.5
done
if [ "$launched" -ne 1 ]; then
  echo "[plucker-update] open failed; launching binary directly"
  ${q(exePath)} >/dev/null 2>&1 &
fi`
  // Extract into a staging dir on the *same* volume as the bundle first, so the only
  // moment the app is absent is a near-atomic same-filesystem `mv` — not the whole
  // (slow) unzip. If anything fails before the swap, `set -e` aborts with the old app
  // still in place.
  return `#!/bin/bash
# Plucker self-update — replaces the app bundle once the running instance exits.
set -e
exec >>${q(logPath)} 2>&1
echo "[plucker-update] $(date) waiting for pid ${pid} to exit"
while kill -0 ${pid} 2>/dev/null; do sleep 0.2; done
sleep 0.5
echo "[plucker-update] installing ${zipPath} -> ${bundlePath}"
STAGE="$(mktemp -d ${q(parent)}/.plucker-update.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT
ditto -x -k ${q(zipPath)} "$STAGE"
rm -rf ${q(bundlePath)}
mv "$STAGE"/${q(basename)} ${q(bundlePath)}
${relaunch ? relaunchBlock : `echo "[plucker-update] installed; not relaunching (install-on-quit)"`}
rm -f "$0"
`
}

export function installMacUpdate(opts: {
  zipPath: string
  bundlePath: string
  pid: number
  logPath: string
  scriptDir: string
  exeName: string
  relaunch?: boolean
}): string {
  const { scriptDir } = opts
  mkdirSync(scriptDir, { recursive: true })
  const scriptPath = join(scriptDir, 'plucker-update.sh')
  writeFileSync(scriptPath, buildSwapScript(opts))
  chmodSync(scriptPath, 0o755)
  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
  return scriptPath
}
```

- [ ] **Step 4: Thread `exeName` through the three `installMacUpdate` call sites**

In `src/main/app/updater/updater.ts`, each call to `installMacUpdate({ … })` must add `exeName: basename(app.getPath('exe'))`. Add the import at the top (alongside `join`):

```ts
import { basename, join } from 'node:path'
```

(The file already imports `{ join } from 'node:path'` on line 16 — replace that line with the line above.)

Then add `exeName: basename(app.getPath('exe'))` to the options object in all three calls: `installUpdateUi()` (~line 247), `installPendingUpdateOnQuit()` (~line 343), and `downloadAndOfferInstall()` (~line 405). For example, `installUpdateUi`'s call becomes:

```ts
  installMacUpdate({
    zipPath: pendingZipPath,
    bundlePath,
    pid: process.pid,
    logPath: logPath(),
    scriptDir: app.getPath('temp'),
    exeName: basename(app.getPath('exe'))
  })
```

Apply the identical `exeName` addition to the other two calls (the one in `installPendingUpdateOnQuit` also keeps `relaunch: false`).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm test -- src/main/app/updater/mac-installer.test.ts`
Expected: PASS (all `buildSwapScript` assertions).
Run: `pnpm typecheck`
Expected: PASS (no errors; the 3 call sites now supply `exeName`).

- [ ] **Step 6: Commit (this is the standalone bugfix commit)**

```bash
git add src/main/app/updater/mac-installer.ts src/main/app/updater/mac-installer.test.ts src/main/app/updater/updater.ts
git commit -m "fix(updater): reliably relaunch after a self-update

Bare 'open' could reactivate the just-killed instance (launching nothing) or
fail transiently under set -e, leaving the user with no app after an update.
Refresh LaunchServices, relaunch with 'open -n' retried outside set -e with
per-attempt exit-code logging, and fall back to launching the binary directly."
```

---

# COMMIT B — `feat(recovery): …` (the safety guard)

### Task 2: Semver compare + version-extract util

**Files:**
- Create: `src/shared/compare-semver.ts`
- Test: `src/shared/compare-semver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/compare-semver.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compareSemver, extractVersion } from './compare-semver'

describe('compareSemver', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemver('1.0.0', '0.9.9')).toBe(1)
    expect(compareSemver('0.21.0', '0.22.0')).toBe(-1)
    expect(compareSemver('0.22.1', '0.22.0')).toBe(1)
    expect(compareSemver('0.22.0', '0.22.0')).toBe(0)
  })

  it('treats missing trailing parts as zero', () => {
    expect(compareSemver('1.2', '1.2.0')).toBe(0)
    expect(compareSemver('1.2.1', '1.2')).toBe(1)
  })

  it('ignores non-numeric noise after the numbers', () => {
    expect(compareSemver('0.22.0-beta', '0.22.0')).toBe(0)
  })
})

describe('extractVersion', () => {
  it('pulls the dotted version out of a release tag', () => {
    expect(extractVersion('plucker-v0.22.0')).toBe('0.22.0')
    expect(extractVersion('v1.2.3')).toBe('1.2.3')
    expect(extractVersion('0.9.1')).toBe('0.9.1')
  })

  it('returns null when there is no version', () => {
    expect(extractVersion('nightly')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/shared/compare-semver.test.ts`
Expected: FAIL — module `./compare-semver` not found.

- [ ] **Step 3: Implement the util**

Create `src/shared/compare-semver.ts`:

```ts
/**
 * Compare two dotted version strings numerically (major.minor.patch).
 * Missing trailing parts count as 0; any non-numeric suffix on a part is ignored.
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 *
 *   compareSemver('0.22.0', '0.21.5') →  1
 *   compareSemver('1.2',    '1.2.0')  →  0
 */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string): number[] => s.split('.').map((n) => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Extract a `major.minor.patch` version from an arbitrary string such as a GitHub
 * release tag (`plucker-v0.22.0` → `0.22.0`). Returns null when none is present.
 */
export function extractVersion(s: string): string | null {
  const m = s.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/shared/compare-semver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/compare-semver.ts src/shared/compare-semver.test.ts
git commit -m "feat(recovery): add semver compare + tag version-extract util"
```

---

### Task 3: Parse `latest-mac.yml` for rollback checksums

**Files:**
- Create: `src/main/app/updater/latest-mac-yml.ts`
- Test: `src/main/app/updater/latest-mac-yml.test.ts`

**Background:** For a *specific* older release we can't reuse electron-updater's parsed `UpdateInfo`. electron-builder uploads a `latest-mac.yml` asset per release listing each zip's base64 SHA-512. We parse just that mapping (no YAML dependency).

- [ ] **Step 1: Write the failing test**

Create `src/main/app/updater/latest-mac-yml.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseLatestMacYml } from './latest-mac-yml'

const SAMPLE = `version: 0.21.0
files:
  - url: Plucker-0.21.0-arm64-mac.zip
    sha512: QUJDarm64base64==
    size: 12345
  - url: Plucker-0.21.0-mac.zip
    sha512: WFlaeng64base64==
    size: 12346
path: Plucker-0.21.0-arm64-mac.zip
sha512: QUJDarm64base64==
releaseDate: '2026-05-01T00:00:00.000Z'
`

describe('parseLatestMacYml', () => {
  it('reads the version', () => {
    expect(parseLatestMacYml(SAMPLE).version).toBe('0.21.0')
  })

  it('maps each file name to its sha512', () => {
    const { sha512ByName } = parseLatestMacYml(SAMPLE)
    expect(sha512ByName['Plucker-0.21.0-arm64-mac.zip']).toBe('QUJDarm64base64==')
    expect(sha512ByName['Plucker-0.21.0-mac.zip']).toBe('WFlaeng64base64==')
  })

  it('does not absorb the top-level path/sha512 as a file entry', () => {
    const { sha512ByName } = parseLatestMacYml(SAMPLE)
    expect(Object.keys(sha512ByName)).toHaveLength(2)
  })

  it('tolerates empty / malformed input', () => {
    expect(parseLatestMacYml('').sha512ByName).toEqual({})
    expect(parseLatestMacYml('garbage: true').version).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/app/updater/latest-mac-yml.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

Create `src/main/app/updater/latest-mac-yml.ts`:

```ts
/**
 * Minimal parser for electron-builder's `latest-mac.yml`, extracting just the
 * per-file base64 SHA-512 map (and the version). Avoids pulling in a YAML
 * dependency for a small, fixed-shape document.
 *
 * The document lists each artifact under `files:` as a `url:`/`sha512:` pair, then
 * repeats a top-level `path:`/`sha512:` for the primary artifact. We key sha512s by
 * the preceding `url:`, so the top-level `sha512:` (which has no pending `url:`) is
 * ignored.
 */
export function parseLatestMacYml(text: string): {
  version: string | null
  sha512ByName: Record<string, string>
} {
  const unquote = (s: string): string => s.replace(/^['"]|['"]$/g, '').trim()
  const sha512ByName: Record<string, string> = {}
  let version: string | null = null
  let pendingName: string | null = null
  for (const line of text.split(/\r?\n/)) {
    const v = line.match(/^version:\s*(.+?)\s*$/)
    if (v && version === null) {
      version = unquote(v[1])
      continue
    }
    const u = line.match(/^\s*-?\s*url:\s*(.+?)\s*$/)
    if (u) {
      pendingName = unquote(u[1])
      continue
    }
    const s = line.match(/^\s*sha512:\s*(.+?)\s*$/)
    if (s && pendingName) {
      sha512ByName[pendingName] = unquote(s[1])
      pendingName = null
    }
  }
  return { version, sha512ByName }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/app/updater/latest-mac-yml.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/app/updater/latest-mac-yml.ts src/main/app/updater/latest-mac-yml.test.ts
git commit -m "feat(recovery): parse latest-mac.yml for rollback checksums"
```

---

### Task 4: Fetch the release list + download a specific release's zip

**Files:**
- Modify: `src/main/app/updater/github-download.ts`
- Test: `src/main/app/updater/github-download.test.ts` (extend — pure parts only)

**Background:** Today `downloadMacUpdate` hardcodes `/releases/latest`. Rollback needs the release *list* and the ability to install a chosen release's per-arch zip (full download + verify against its `latest-mac.yml`). `fetchReleases`/`downloadReleaseZip` touch the network (not unit-tested, like `downloadMacUpdate`); the test only adds coverage that doesn't need the network.

- [ ] **Step 1: Generalize `fetchJson` and add the new exports**

In `src/main/app/updater/github-download.ts`:

1. Add the import for the parser near the other local imports (after the `findCachedUpdate` import line):

```ts
import { parseLatestMacYml } from './latest-mac-yml'
```

2. Add the releases-list endpoint constant under the existing `LATEST_RELEASE_API` line:

```ts
const RELEASES_API = 'https://api.github.com/repos/filiphsps/plucker/releases?per_page=30'
```

3. Add a `GithubRelease` interface right after the `GithubAsset` interface:

```ts
export interface GithubRelease {
  tag_name: string
  name: string | null
  draft: boolean
  prerelease: boolean
  assets: GithubAsset[]
}
```

4. Make `fetchJson` generic. Replace its signature line `function fetchJson(url: string): Promise<{ assets?: GithubAsset[] }> {` with:

```ts
function fetchJson<T>(url: string): Promise<T> {
```

   and update the existing call inside `downloadMacUpdate` (`const release = await fetchJson(LATEST_RELEASE_API)`) to:

```ts
  const release = await fetchJson<{ assets?: GithubAsset[] }>(LATEST_RELEASE_API)
```

5. Add a small text fetcher (place it right after `fetchJson`):

```ts
/** GET a URL via Electron's net stack and resolve its body as UTF-8 text (follows redirects). */
function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'Plucker-Updater')
    req.on('response', (res) => {
      const status = res.statusCode ?? 0
      if (status >= 400) {
        reject(new Error(`request failed: HTTP ${status}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}
```

6. Add `fetchReleases` and `downloadReleaseZip` at the end of the file:

```ts
/** Fetch the repository's recent releases (newest first), as returned by the GitHub API. */
export async function fetchReleases(): Promise<GithubRelease[]> {
  const data = await fetchJson<GithubRelease[]>(RELEASES_API)
  return Array.isArray(data) ? data : []
}

/**
 * Full-download a *specific* release's per-arch zip into `destDir` and verify it.
 * Used by the recovery rollback path (no differential reuse — recovery favours a
 * simple, robust full download). The expected SHA-512 is read from that release's
 * `latest-mac.yml` asset when available; if absent, the zip is installed unverified
 * (recovery is best-effort) and a warning is logged. Resolves the on-disk zip path.
 */
export async function downloadReleaseZip(opts: {
  release: GithubRelease
  arch: string
  destDir: string
  expectedSha512?: string
  throttleBytesPerSec?: number
  onProgress?: (percent: number) => void
}): Promise<string> {
  const { release, arch, destDir, throttleBytesPerSec = 0, onProgress } = opts
  const zipAsset = pickArchZip(release.assets, arch)
  if (!zipAsset) throw new Error(`no macOS ${arch} asset in release ${release.tag_name}`)

  let expected = opts.expectedSha512
  if (!expected) {
    const manifest = release.assets.find((a) => a.name === 'latest-mac.yml')
    if (manifest) {
      try {
        const { sha512ByName } = parseLatestMacYml(await fetchText(manifest.browser_download_url))
        expected = sha512ByName[zipAsset.name]
      } catch (err) {
        log.warn('app', 'could not read latest-mac.yml for rollback verification:', err)
      }
    }
  }

  const zipDest = join(destDir, zipAsset.name)
  log.info('app', `rollback download: ${zipAsset.name} (${formatBytes(zipAsset.size)})`)
  await downloadToFile(zipAsset.browser_download_url, zipDest, { onProgress, throttleBytesPerSec })
  if (expected) {
    if ((await sha512OfFile(zipDest)) !== expected) {
      throw new Error('rollback verification failed: SHA-512 mismatch')
    }
    log.info('app', 'rollback download verified (SHA-512 OK)')
  } else {
    log.warn('app', 'rollback download not verified (no checksum available)')
  }
  return zipDest
}
```

- [ ] **Step 2: Run the existing updater tests + typecheck**

Run: `pnpm test -- src/main/app/updater/github-download.test.ts`
Expected: PASS (the generic `fetchJson` and new exports don't change `pickArchZip`/`pickBlockmapFor`/`sha512OfFile`).
Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/app/updater/github-download.ts
git commit -m "feat(updater): fetch release list + download a specific release zip"
```

---

### Task 5: Persist launch-health / recovery state

**Files:**
- Create: `src/main/app/recovery/recovery-state.ts`
- Test: `src/main/app/recovery/recovery-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/app/recovery/recovery-state.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_RECOVERY_STATE,
  loadRecoveryState,
  saveRecoveryState,
  type RecoveryState
} from './recovery-state'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-recovery-'))
  file = join(dir, 'recovery-state.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('recovery-state', () => {
  it('returns the default state when the file is absent', () => {
    expect(loadRecoveryState(file)).toEqual(DEFAULT_RECOVERY_STATE)
  })

  it('round-trips a saved state', () => {
    const state: RecoveryState = {
      launchInProgress: true,
      badStreak: 2,
      lastRollbackVersion: '0.21.0',
      rollbackAttempts: 1,
      pendingRecoveryNotice: { rolledBackTo: '0.21.0', from: '0.22.0' }
    }
    saveRecoveryState(state, file)
    expect(loadRecoveryState(file)).toEqual(state)
  })

  it('falls back to defaults on corrupt JSON', () => {
    writeFileSync(file, '{ not json', 'utf8')
    expect(loadRecoveryState(file)).toEqual(DEFAULT_RECOVERY_STATE)
  })

  it('drops a malformed pendingRecoveryNotice', () => {
    writeFileSync(file, JSON.stringify({ badStreak: 1, pendingRecoveryNotice: { nope: 1 } }), 'utf8')
    const loaded = loadRecoveryState(file)
    expect(loaded.badStreak).toBe(1)
    expect(loaded.pendingRecoveryNotice).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/app/recovery/recovery-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `src/main/app/recovery/recovery-state.ts`:

```ts
// Cross-launch persistence for the last-resort recovery guard. Stored separately from
// config.json (under ~/.plucker/recovery-state.json) so a factory reset never wipes the
// recovery bookkeeping, and the two concerns stay isolated. Tolerant of a missing or
// corrupt file (falls back to a clean default).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pluckerDir } from '@app/app/settings/settings'

/** Shown once, on the rolled-back build, after it becomes healthy. */
export interface RecoveryNotice {
  rolledBackTo: string
  from: string
}

export interface RecoveryState {
  /** True while a launch hasn't yet become healthy or cleanly exited. */
  launchInProgress: boolean
  /** Consecutive launches that crashed / were force-killed before becoming healthy. */
  badStreak: number
  /** The version most recently rolled back to (so the next attempt steps further back). */
  lastRollbackVersion: string | null
  /** Rollback attempts within the current recovery episode (loop guard). */
  rollbackAttempts: number
  /** A pending "you were rolled back" notice to show once healthy. */
  pendingRecoveryNotice: RecoveryNotice | null
}

export const DEFAULT_RECOVERY_STATE: RecoveryState = {
  launchInProgress: false,
  badStreak: 0,
  lastRollbackVersion: null,
  rollbackAttempts: 0,
  pendingRecoveryNotice: null
}

export function recoveryStatePath(): string {
  return join(pluckerDir(), 'recovery-state.json')
}

function isNotice(v: unknown): v is RecoveryNotice {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as RecoveryNotice).rolledBackTo === 'string' &&
    typeof (v as RecoveryNotice).from === 'string'
  )
}

export function loadRecoveryState(file = recoveryStatePath()): RecoveryState {
  if (!existsSync(file)) return { ...DEFAULT_RECOVERY_STATE }
  try {
    const p = JSON.parse(readFileSync(file, 'utf8')) as Partial<RecoveryState>
    return {
      ...DEFAULT_RECOVERY_STATE,
      ...p,
      pendingRecoveryNotice: isNotice(p.pendingRecoveryNotice) ? p.pendingRecoveryNotice : null
    }
  } catch {
    return { ...DEFAULT_RECOVERY_STATE }
  }
}

export function saveRecoveryState(state: RecoveryState, file = recoveryStatePath()): void {
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/app/recovery/recovery-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/app/recovery/recovery-state.ts src/main/app/recovery/recovery-state.test.ts
git commit -m "feat(recovery): persist launch-health/recovery state"
```

---

### Task 6: Launch-health decision state machine

**Files:**
- Create: `src/main/app/recovery/launch-health.ts`
- Test: `src/main/app/recovery/launch-health.test.ts`

**Background:** This is the pure brain. The key trick: a single persisted `launchInProgress` flag distinguishes a force-close/crash *before* the app was usable (counts) from a clean quit or a force-quit of a working app (doesn't). `noteRollbackAttempt` resets `badStreak` so a fresh rollback isn't immediately re-triggered by the stale streak — the `rollbackAttempts` loop guard bounds repeats instead.

- [ ] **Step 1: Write the failing test**

Create `src/main/app/recovery/launch-health.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_RECOVERY_STATE, type RecoveryState } from './recovery-state'
import {
  BAD_LAUNCH_THRESHOLD,
  MAX_ROLLBACKS,
  accountForStartup,
  canRollback,
  markCleanExit,
  markHealthy,
  noteRollbackAttempt,
  noteRollbackTarget,
  pickRollbackTarget,
  shouldRecoverAtStartup,
  type ReleaseRef
} from './launch-health'

const state = (over: Partial<RecoveryState> = {}): RecoveryState => ({
  ...DEFAULT_RECOVERY_STATE,
  ...over
})

describe('accountForStartup', () => {
  it('increments badStreak when the previous launch was still in progress', () => {
    expect(accountForStartup(state({ launchInProgress: true, badStreak: 1 }))).toMatchObject({
      launchInProgress: true,
      badStreak: 2
    })
  })

  it('leaves badStreak alone after a clean/healthy previous launch', () => {
    expect(accountForStartup(state({ launchInProgress: false, badStreak: 0 }))).toMatchObject({
      launchInProgress: true,
      badStreak: 0
    })
  })
})

describe('shouldRecoverAtStartup', () => {
  it('fires at the threshold', () => {
    expect(shouldRecoverAtStartup(state({ badStreak: BAD_LAUNCH_THRESHOLD }))).toBe(true)
    expect(shouldRecoverAtStartup(state({ badStreak: BAD_LAUNCH_THRESHOLD - 1 }))).toBe(false)
  })
})

describe('markHealthy / markCleanExit', () => {
  it('markHealthy resets the whole episode', () => {
    expect(
      markHealthy()
    ).toEqual(DEFAULT_RECOVERY_STATE)
  })

  it('markCleanExit only clears launchInProgress', () => {
    expect(markCleanExit(state({ launchInProgress: true, badStreak: 2 }))).toMatchObject({
      launchInProgress: false,
      badStreak: 2
    })
  })
})

describe('rollback loop guard', () => {
  it('allows attempts below the cap', () => {
    expect(canRollback(state({ rollbackAttempts: 0 }))).toBe(true)
    expect(canRollback(state({ rollbackAttempts: MAX_ROLLBACKS - 1 }))).toBe(true)
    expect(canRollback(state({ rollbackAttempts: MAX_ROLLBACKS }))).toBe(false)
  })

  it('noteRollbackAttempt bumps the count and resets badStreak', () => {
    expect(noteRollbackAttempt(state({ rollbackAttempts: 1, badStreak: 3 }))).toMatchObject({
      rollbackAttempts: 2,
      badStreak: 0
    })
  })

  it('noteRollbackTarget records the target + a pending notice', () => {
    expect(noteRollbackTarget(state(), { to: '0.21.0', from: '0.22.0' })).toMatchObject({
      lastRollbackVersion: '0.21.0',
      pendingRecoveryNotice: { rolledBackTo: '0.21.0', from: '0.22.0' }
    })
  })
})

describe('pickRollbackTarget', () => {
  const refs: ReleaseRef[] = [
    { tag: 'plucker-v0.22.0', version: '0.22.0' },
    { tag: 'plucker-v0.21.0', version: '0.21.0' },
    { tag: 'plucker-v0.20.1', version: '0.20.1' }
  ]

  it('picks the newest release older than current (2nd-latest from the top)', () => {
    expect(pickRollbackTarget(refs, '0.22.0', null)?.version).toBe('0.21.0')
  })

  it('steps further back, skipping the excluded (already-tried) version', () => {
    expect(pickRollbackTarget(refs, '0.22.0', '0.21.0')?.version).toBe('0.20.1')
  })

  it('never targets a version >= current', () => {
    expect(pickRollbackTarget(refs, '0.20.1', null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/main/app/recovery/launch-health.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the state machine**

Create `src/main/app/recovery/launch-health.ts`:

```ts
// Pure decision logic for the last-resort recovery guard. No Electron / no I/O, so it's
// fully unit-testable. The thin wiring in safety-guard.ts loads/saves RecoveryState around
// these functions and schedules the timers.
import type { RecoveryState } from './recovery-state'
import { compareSemver } from '@shared/compare-semver'

/** Consecutive bad launches before we recover at startup. */
export const BAD_LAUNCH_THRESHOLD = 3
/** Rollback attempts per recovery episode before giving up to a manual-download prompt. */
export const MAX_ROLLBACKS = 2

/**
 * Account for the previous launch and mark this one in progress. If the previous launch
 * was still `launchInProgress` (never became healthy, never cleanly exited), it crashed or
 * was force-killed before becoming usable → count it as a bad launch.
 */
export function accountForStartup(prev: RecoveryState): RecoveryState {
  return {
    ...prev,
    launchInProgress: true,
    badStreak: prev.launchInProgress ? prev.badStreak + 1 : prev.badStreak
  }
}

/** Force-close / crash-loop trigger: recover immediately at startup. */
export function shouldRecoverAtStartup(state: RecoveryState): boolean {
  return state.badStreak >= BAD_LAUNCH_THRESHOLD
}

/** The app reached a usable, stable state: clear the whole episode. */
export function markHealthy(): RecoveryState {
  return {
    launchInProgress: false,
    badStreak: 0,
    lastRollbackVersion: null,
    rollbackAttempts: 0,
    pendingRecoveryNotice: null
  }
}

/** A clean quit (⌘Q) is never a bad launch — just clear the in-progress flag. */
export function markCleanExit(prev: RecoveryState): RecoveryState {
  return { ...prev, launchInProgress: false }
}

/** Loop guard: may we still attempt an automatic rollback this episode? */
export function canRollback(state: RecoveryState): boolean {
  return state.rollbackAttempts < MAX_ROLLBACKS
}

/**
 * Record that a rollback attempt is starting. Bumps the loop-guard count and resets
 * badStreak, so the freshly rolled-back build gets a clean chance instead of being
 * re-triggered by the stale streak (the loop guard bounds repeats instead).
 */
export function noteRollbackAttempt(prev: RecoveryState): RecoveryState {
  return { ...prev, rollbackAttempts: prev.rollbackAttempts + 1, badStreak: 0 }
}

/** Record the chosen target + a one-time post-recovery notice, just before relaunching. */
export function noteRollbackTarget(
  prev: RecoveryState,
  opts: { to: string; from: string }
): RecoveryState {
  return {
    ...prev,
    lastRollbackVersion: opts.to,
    pendingRecoveryNotice: { rolledBackTo: opts.to, from: opts.from }
  }
}

export interface ReleaseRef {
  tag: string
  version: string
}

/**
 * Choose the rollback target: the newest release strictly older than `current`, skipping
 * `exclude` (the version we already rolled back to). From the latest version this is the
 * 2nd-newest release; on a repeat episode it steps further back. Null when none qualifies.
 */
export function pickRollbackTarget(
  releases: ReleaseRef[],
  current: string,
  exclude: string | null
): ReleaseRef | null {
  const older = releases
    .filter((r) => compareSemver(r.version, current) < 0 && r.version !== exclude)
    .sort((a, b) => compareSemver(b.version, a.version))
  return older[0] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/main/app/recovery/launch-health.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/app/recovery/launch-health.ts src/main/app/recovery/launch-health.test.ts
git commit -m "feat(recovery): launch-health decision state machine"
```

---

### Task 7: Rollback orchestration

**Files:**
- Create: `src/main/app/recovery/rollback.ts`

**Background:** Electron/network glue (not unit-tested, like `updater.ts`). Composes the tested pieces: load state → loop guard → fetch releases → pick target → download (verified) → record target → install via the hardened installer → quit (the swap script relaunches the older build).

- [ ] **Step 1: Implement `performRollback`**

Create `src/main/app/recovery/rollback.ts`:

```ts
// Last-resort rollback orchestration. Thin Electron/network glue over the tested pure
// modules (launch-health, github-download, recovery-state). Silent by design: a broken app
// may not be able to render UI, so we download + install + relaunch without an up-front
// prompt, then show a one-time notice on the rolled-back build once it's healthy
// (safety-guard.ts handles that). Best-effort: any failure logs and returns false so the
// caller can fall through to a normal startup attempt.
import { app, dialog, shell, type BrowserWindow } from 'electron'
import { basename } from 'node:path'
import { log } from '@app/app/logging/log'
import { logPath } from '@app/app/settings/settings'
import { appBundlePath, installMacUpdate } from '@app/app/updater/mac-installer'
import { fetchReleases, downloadReleaseZip } from '@app/app/updater/github-download'
import { extractVersion } from '@shared/compare-semver'
import { loadRecoveryState, saveRecoveryState } from './recovery-state'
import {
  canRollback,
  noteRollbackAttempt,
  noteRollbackTarget,
  pickRollbackTarget,
  type ReleaseRef
} from './launch-health'

/** Releases page for the manual-download escape hatch when auto-recovery gives up. */
export const RELEASES_URL = 'https://github.com/filiphsps/plucker/releases'

/**
 * Attempt to roll back to the previous release and relaunch. Returns true when a rollback
 * was initiated (the app is quitting to let the swap script run), false when it bailed
 * (loop guard tripped, no older release, or a download/install error) — in which case the
 * caller should continue a normal startup.
 */
export async function performRollback(getWindow: () => BrowserWindow | null): Promise<boolean> {
  const bundlePath = appBundlePath(app.getPath('exe'))
  if (!bundlePath) {
    log.warn('app', 'rollback skipped: not running from a packaged .app bundle')
    return false
  }

  let state = loadRecoveryState()
  if (!canRollback(state)) {
    log.error('app', `rollback loop guard tripped after ${state.rollbackAttempts} attempts`)
    await offerManualDownload(getWindow())
    return false
  }

  // Count this attempt up-front (and reset badStreak) so even a failed download converges
  // the loop guard and the rolled-back build isn't re-triggered by the stale streak.
  state = noteRollbackAttempt(state)
  saveRecoveryState(state)

  const current = app.getVersion()
  try {
    const releases = await fetchReleases()
    const refs: ReleaseRef[] = releases
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({ tag: r.tag_name, version: extractVersion(r.tag_name) ?? '' }))
      .filter((r) => r.version !== '')
    const target = pickRollbackTarget(refs, current, state.lastRollbackVersion)
    if (!target) {
      log.error('app', `no older release to roll back to (current ${current})`)
      return false
    }
    const release = releases.find((r) => r.tag_name === target.tag)
    if (!release) return false

    log.warn('app', `rolling back from ${current} to ${target.version} (${target.tag})`)
    const zipPath = await downloadReleaseZip({
      release,
      arch: process.arch,
      destDir: app.getPath('temp')
    })

    // Persist the target + post-recovery notice immediately before the relaunch.
    saveRecoveryState(noteRollbackTarget(loadRecoveryState(), { to: target.version, from: current }))
    installMacUpdate({
      zipPath,
      bundlePath,
      pid: process.pid,
      logPath: logPath(),
      scriptDir: app.getPath('temp'),
      exeName: basename(app.getPath('exe'))
    })
    app.quit()
    return true
  } catch (err) {
    log.error('app', 'rollback failed:', err)
    return false
  }
}

/** When auto-recovery gives up, point the user at the releases page for a manual download. */
async function offerManualDownload(win: BrowserWindow | null): Promise<void> {
  const opts: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['Download latest', 'OK'],
    defaultId: 0,
    cancelId: 1,
    message: "Plucker couldn't recover automatically",
    detail:
      'Plucker repeatedly failed to start and rolling back to a previous version did not ' +
      'help. Please download the latest version manually.'
  }
  try {
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    if (response === 0) await shell.openExternal(RELEASES_URL)
  } catch {
    // No display / dialog failure must not throw out of the recovery path.
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/app/recovery/rollback.ts
git commit -m "feat(recovery): rollback orchestration (download + downgrade + relaunch)"
```

---

### Task 8: Safety-guard watchdog + lifecycle wiring

**Files:**
- Create: `src/main/app/recovery/safety-guard.ts`

**Background:** Electron glue (not unit-tested). Owns the watchdog timer, the healthy-settle timer, the startup accounting, and the clean-exit hook; delegates all decisions to `launch-health` and persistence to `recovery-state`, and the heavy lifting to `performRollback`.

- [ ] **Step 1: Implement the guard**

Create `src/main/app/recovery/safety-guard.ts`:

```ts
// Last-resort recovery guard wiring. Two triggers funnel into one rollback:
//   1) no window visible within WATCHDOG_MS of launch (this session), and
//   2) badStreak >= BAD_LAUNCH_THRESHOLD at startup (force-close / crash loop across launches).
// "Healthy" = a window stays visible for HEALTHY_SETTLE_MS; reaching it clears the episode.
// All decision logic lives in launch-health.ts; this file is thin glue around timers + IPC-free
// Electron calls. Gated to packaged macOS builds by the caller (index.ts).
import { app, BrowserWindow, dialog } from 'electron'
import { log } from '@app/app/logging/log'
import { loadRecoveryState, saveRecoveryState, type RecoveryNotice } from './recovery-state'
import { accountForStartup, markCleanExit, markHealthy, shouldRecoverAtStartup } from './launch-health'
import { performRollback } from './rollback'

/** No window visible within this long after launch → recover. */
export const WATCHDOG_MS = 20_000
/** A window must stay visible this long to count the launch as healthy. */
export const HEALTHY_SETTLE_MS = 10_000

export interface SafetyGuard {
  /** Account for the previous launch + mark this one in progress. Returns whether to recover now. */
  beginLaunch(): { recoverNow: boolean }
  /** Start the no-window watchdog (call once after the first createWindow()). */
  armWatchdog(): void
  /** A window became visible — start the healthy-settle timer. */
  onWindowVisible(): void
  /** A clean quit is happening (⌘Q / before-quit). */
  onCleanExit(): void
  /** Trigger a rollback now. Resolves true when the app is quitting to roll back. */
  recover(): Promise<boolean>
}

export function createSafetyGuard(getWindow: () => BrowserWindow | null): SafetyGuard {
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let settle: ReturnType<typeof setTimeout> | null = null
  let healthy = false
  let recovering = false

  const cancelWatchdog = (): void => {
    if (watchdog) clearTimeout(watchdog)
    watchdog = null
  }

  const recover = async (): Promise<boolean> => {
    if (recovering) return false
    recovering = true
    cancelWatchdog()
    const did = await performRollback(getWindow)
    if (!did) recovering = false // bailed — allow a later trigger
    return did
  }

  return {
    beginLaunch() {
      const next = accountForStartup(loadRecoveryState())
      saveRecoveryState(next)
      log.info(
        'app',
        `launch health: badStreak=${next.badStreak}, rollbackAttempts=${next.rollbackAttempts}`
      )
      return { recoverNow: shouldRecoverAtStartup(next) }
    },

    armWatchdog() {
      cancelWatchdog()
      watchdog = setTimeout(() => {
        watchdog = null
        if (healthy) return
        const visible = BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())
        if (visible) return
        log.error('app', `no window visible ${WATCHDOG_MS / 1000}s after launch; recovering`)
        void recover()
      }, WATCHDOG_MS)
    },

    onWindowVisible() {
      if (healthy || settle) return
      settle = setTimeout(() => {
        settle = null
        healthy = true
        cancelWatchdog()
        const prev = loadRecoveryState()
        const notice = prev.pendingRecoveryNotice
        saveRecoveryState(markHealthy())
        log.info('app', 'launch healthy; recovery state reset')
        if (notice) showRecoveryNotice(getWindow(), notice)
      }, HEALTHY_SETTLE_MS)
    },

    onCleanExit() {
      if (healthy) return // healthy already cleared launchInProgress
      saveRecoveryState(markCleanExit(loadRecoveryState()))
    },

    recover
  }
}

/** One-time "you were rolled back" notice, shown on the recovered build once it's healthy. */
function showRecoveryNotice(win: BrowserWindow | null, notice: RecoveryNotice): void {
  const opts: Electron.MessageBoxOptions = {
    type: 'info',
    buttons: ['OK'],
    message: 'Plucker was rolled back',
    detail:
      `Plucker had trouble starting on version ${notice.from}, so it was rolled back to ` +
      `${notice.rolledBackTo} to keep it working.`
  }
  try {
    void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
  } catch {
    // No display — never let a notice failure escape.
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/app/recovery/safety-guard.ts
git commit -m "feat(recovery): safety-guard watchdog + lifecycle wiring"
```

---

### Task 9: Wire the safety guard into main startup

**Files:**
- Modify: `src/main/index.ts`

**Background:** Gate to packaged macOS builds (so dev hot-restarts don't accrue bad launches, and only self-installable builds recover). Run `beginLaunch` early; if it says recover, attempt a rollback before normal startup and bail if it initiates. Hook window visibility + arm the watchdog after the first window; hook `before-quit`.

- [ ] **Step 1: Add the import**

In `src/main/index.ts`, add near the other `@app/app/...` imports (e.g. right after the updater import block at lines 69–73):

```ts
import { createSafetyGuard, type SafetyGuard } from '@app/app/recovery/safety-guard'
```

- [ ] **Step 2: Add the module-level guard variable**

Next to the other module-level lets (after `let crashGuard: CrashGuard | null = null` ~line 124):

```ts
/** Last-resort recovery guard: rolls back to the previous release if the app can't start. */
let safetyGuard: SafetyGuard | null = null
```

- [ ] **Step 3: Initialize + maybe-recover early in `app.whenReady`**

In the `app.whenReady().then(async () => {` body, immediately after `migrateLegacyConfig()` (~line 824), insert:

```ts
  // Last-resort recovery: on a packaged macOS build, account for the previous launch and —
  // if the app has failed to become usable several times in a row — roll back to the previous
  // release before attempting startup again. Dev/non-macOS builds can't self-install, so the
  // guard is skipped entirely (also avoids hot-restart noise inflating the bad-launch streak).
  if (app.isPackaged && process.platform === 'darwin') {
    safetyGuard = createSafetyGuard(() => mainWindow)
    const { recoverNow } = safetyGuard.beginLaunch()
    if (recoverNow) {
      log.error('app', 'repeated failed launches detected; attempting rollback before startup')
      if (await safetyGuard.recover()) return // app is quitting to roll back
    }
  }
```

- [ ] **Step 4: Arm the watchdog after the first window**

In the same `whenReady` body, immediately after the existing `createWindow()` call (~line 872), insert:

```ts
  // Start the no-window watchdog: if nothing is visible within WATCHDOG_MS, recover.
  safetyGuard?.armWatchdog()
```

- [ ] **Step 5: Hook window visibility in `createWindow`**

In `createWindow`, alongside the existing `win.on('ready-to-show', …)` handler (~line 742), add a `show` hook that feeds the guard:

```ts
  // Feed the recovery guard: a visible window that stays up marks the launch healthy.
  win.on('show', () => safetyGuard?.onWindowVisible())
```

- [ ] **Step 6: Hook clean exit in `before-quit`**

In the `app.on('before-quit', () => { … })` handler (~line 928), add as the first line inside the handler (before `consoleRedockOnClose = false`):

```ts
  // A clean quit (⌘Q) is never counted as a bad launch by the recovery guard.
  safetyGuard?.onCleanExit()
```

- [ ] **Step 7: Typecheck + full test run**

Run: `pnpm typecheck`
Expected: PASS.
Run: `pnpm test`
Expected: PASS (all suites, including the new recovery + updater tests).
Run: `pnpm lint`
Expected: PASS (no new lint errors).

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(recovery): wire the last-resort safety guard into main startup

Adds a no-window watchdog and a cross-launch force-close/crash detector that,
on a packaged macOS build, rolls back to the previous release and relaunches
when the app repeatedly fails to become usable. Silent rollback; a one-time
notice is shown on the recovered build once it is healthy."
```

---

## Final verification

- [ ] Run `pnpm typecheck && pnpm test && pnpm lint` — all green.
- [ ] Confirm two logically-distinct change sets landed: the `fix(updater):` relaunch commit (Task 1) and the `feat(recovery):` commits (Tasks 2–9).
- [ ] Sanity-check the git log shows the bugfix as its own commit, as requested.

## Manual smoke test (post-merge, packaged build)

These can't be automated here; note them for the release build:
1. **Relaunch fix:** trigger a normal in-app update install; confirm the app reopens on the new version (and `~/.plucker/plucker.log` shows `[plucker-update] relaunched (attempt N)`).
2. **No-window watchdog:** simulate a hung startup (e.g. temporarily make the renderer fail to load); confirm that ~20s later the app rolls back and relaunches the previous version, then shows the "was rolled back" notice once it's up.
3. **Force-close loop:** force-quit the app during startup 3× in a row; confirm the 4th launch rolls back automatically.
4. **Loop guard:** confirm that after `MAX_ROLLBACKS` failed rollbacks the app stops and shows the manual-download dialog instead of spiraling.
