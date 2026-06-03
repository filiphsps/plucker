// Thin every embedded UNIVERSAL (fat) Mach-O binary down to a single CPU arch, so each
// per-arch macOS DMG ships only its own slice instead of both. macOS-only; no-op elsewhere.
//
// Several bundled binaries are fat (x86_64 + arm64): the universal better_sqlite3.node we build,
// @plucker/native-context-menu's Module.node, and — by far the largest — yt-dlp's onedir tree
// (yt-dlp_macos plus _internal libs like libcrypto / libcurl-impersonate / libssl / libunistring).
// Shipping both slices in a single-arch DMG ~doubles their on-disk size for no benefit. `lipo -thin`
// keeps only the slice that DMG can actually run.
//
// `lipo` ships with the Xcode Command Line Tools — preinstalled on GitHub's macOS runners, so there
// is nothing to install or build for this step.
//
// Usage: node scripts/thin-native-bins.mjs <arm64|x64>
// Run in the per-arch release job AFTER fetch-binaries + the universal better-sqlite3 build and
// BEFORE electron-builder. (Not wired into the local `build:mac`, which packages both arches from
// one node_modules and so must keep the fat .node.) Safe & idempotent: only *fat* Mach-O files that
// contain the target slice are touched; single-arch files, non-Mach-O files, symlinks, and the
// other arch's resources/bin tree are left alone.
import { execFileSync } from 'node:child_process'
import { globSync, readdirSync, lstatSync, statSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { resolveModuleDir } from './lib/better-sqlite3-build.mjs'

const arg = process.argv[2]
const LIPO_ARCH = { arm64: 'arm64', x64: 'x86_64' }[arg]
if (!LIPO_ARCH) {
  throw new Error(`thin-native-bins: pass a target arch (arm64|x64), got "${arg ?? ''}"`)
}
if (process.platform !== 'darwin') {
  console.log('[thin] not macOS — nothing to thin')
  process.exit(0)
}

/** Recursively collect real files (no symlinks/dirs), descending hidden dirs like yt-dlp's
 *  `.dylibs/` that standard globbing skips. */
function walk(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out // missing tree (e.g. binaries not fetched) — nothing to thin
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isSymbolicLink()) continue
    else if (e.isDirectory()) out.push(...walk(p))
    else if (e.isFile()) out.push(p)
  }
  return out
}

// The shared native addons (one node_modules serves both DMGs) + this arch's bundled tool tree
// (resources/bin/<arch> is the only bin/ tree this DMG ships).
const candidates = [
  ...globSync(`${resolveModuleDir()}/build/Release/*.node`),
  ...globSync('node_modules/@plucker/native-context-menu/prebuilds/*.node'),
  ...walk(`resources/bin/${arg}`)
]

/** lipo arch list, or null when the file isn't a Mach-O. Most files in the yt-dlp tree are
 *  plain data (plists, .pem, .txt, .zip, .js); lipo errors on those, so we ignore its stderr
 *  ("can't figure out the architecture type") and treat the failure as "not a Mach-O". */
function archsOf(file) {
  try {
    return execFileSync('lipo', ['-archs', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .trim()
      .split(/\s+/)
  } catch {
    return null
  }
}

let thinnedCount = 0
let bytesSaved = 0
for (const file of candidates) {
  try {
    if (!lstatSync(file).isFile()) continue
  } catch {
    continue
  }
  const archs = archsOf(file)
  if (!archs || archs.length < 2) continue // non-Mach-O or already single-arch
  if (!archs.includes(LIPO_ARCH)) {
    console.warn(`[thin] skip (no ${LIPO_ARCH} slice): ${file} [${archs.join(', ')}]`)
    continue
  }
  const before = statSync(file).size
  const tmp = `${file}.thin`
  execFileSync('lipo', [file, '-thin', LIPO_ARCH, '-output', tmp])
  renameSync(tmp, file) // atomic replace; unsigned binaries, so no signature to preserve
  bytesSaved += before - statSync(file).size
  thinnedCount++
}

console.log(
  `[thin] ✓ thinned ${thinnedCount} fat binaries to ${LIPO_ARCH} (${arg}), ` +
    `saved ${(bytesSaved / 1024 / 1024).toFixed(1)} MB`
)
