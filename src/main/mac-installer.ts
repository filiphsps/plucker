// Custom macOS self-update — the part Squirrel.Mac can't do for an unsigned app.
//
// electron-updater still does the *check* and *download* (it reads the bundled
// app-update.yml / latest-mac.yml and fetches the per-arch `.zip`), but its install
// path hands the zip to native Squirrel.Mac, which hard-requires a valid Developer ID
// signature. Plucker ships unsigned, so instead we install the downloaded zip ourselves:
// a detached shell script waits for the app to quit, replaces the running `.app` bundle
// in place, and relaunches it. Because *we* perform the swap (not Squirrel), there is no
// signature to verify.
import { spawn } from 'node:child_process'
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Resolve the `.app` bundle root from the running executable path.
 * `/Applications/Plucker.app/Contents/MacOS/Plucker` → `/Applications/Plucker.app`.
 * Returns null when the path isn't inside an `.app` bundle (e.g. unpackaged dev runs).
 */
export function appBundlePath(exePath: string): string | null {
  const marker = '.app/'
  const i = exePath.indexOf(marker)
  if (i === -1) return null
  return exePath.slice(0, i + marker.length - 1) // keep ".app", drop the trailing slash
}

/**
 * Build the detached swap-and-relaunch script.
 * - waits for the running app (`pid`) to fully exit,
 * - removes the old bundle and extracts the downloaded zip in its place,
 * - relaunches the app, then deletes itself.
 *
 * `ditto -x -k` extracts the macOS app zip (which contains `<Name>.app` at its root)
 * without re-applying a quarantine flag, so the freshly installed bundle launches
 * without a Gatekeeper prompt.
 */
export function buildSwapScript(opts: {
  zipPath: string
  bundlePath: string
  pid: number
  logPath: string
}): string {
  const { zipPath, bundlePath, pid, logPath } = opts
  const slash = bundlePath.lastIndexOf('/')
  const parent = bundlePath.slice(0, slash) || '/'
  const basename = bundlePath.slice(slash + 1)
  // Single-quote every interpolated path and escape embedded single quotes so paths
  // with spaces (e.g. "/Applications/Plucker.app") survive the shell unharmed.
  const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`
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
echo "[plucker-update] relaunching"
open ${q(bundlePath)}
rm -f "$0"
`
}

/**
 * Write the swap script to `scriptDir`, spawn it fully detached (so it outlives this
 * process), and return its path. The caller is responsible for quitting the app
 * immediately after — the script blocks until this pid dies before swapping.
 */
export function installMacUpdate(opts: {
  zipPath: string
  bundlePath: string
  pid: number
  logPath: string
  scriptDir: string
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
