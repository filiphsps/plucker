// Build a UNIVERSAL (x86_64 + arm64) better_sqlite3.node for the macOS DMGs.
//
// Why this exists: electron-builder.yml sets `npmRebuild: false`, so electron-builder ships
// whatever single better_sqlite3.node is already in node_modules into *every* arch it packages.
// Our CI release runners (and the local `build:mac`) are Apple Silicon, and the dev/CI tooling
// only ever compiles the *host* arch — so the x64 DMG silently shipped an arm64-only binary.
// On an Intel Mac that `.node` fails to `dlopen` ("incompatible architecture"), better-sqlite3's
// lazy first `new Database()` throws, and the app never opens a window.
//
// Fix: compile the patched source for BOTH arches against Electron's ABI and `lipo` them into a
// single fat binary at the path `bindings` resolves — exactly how @plucker/native-context-menu
// already ships its (fat) Module.node. One binary then loads correctly on both arm64 and x64.
//
// Run this AFTER `pnpm run build` and BEFORE electron-builder, for both local `build:mac` and the
// `release.yml` macOS jobs. Cross-compiling x64 on an arm64 host works because macOS clang is a
// universal toolchain and native addons link with `-undefined dynamic_lookup` (no per-arch lib).
import { execFileSync } from 'node:child_process'
import { copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { resolveModuleDir, rebuildFromSource } from './lib/better-sqlite3-build.mjs'

const PREFIX = '[universal-sqlite3]'
const REQUIRED_ARCHS = ['x86_64', 'arm64'] // lipo names: x64 → x86_64

const moduleDir = resolveModuleDir()
const finalNode = join(moduleDir, 'build', 'Release', 'better_sqlite3.node')

// rebuildFromSource wipes build/ before each compile, so copy each arch's .node out first,
// then lipo the copies back into place.
const slices = []
for (const arch of ['arm64', 'x64']) {
  rebuildFromSource({ runtime: 'electron', arch, logPrefix: PREFIX })
  const slice = join(moduleDir, `better_sqlite3.${arch}.node`)
  copyFileSync(finalNode, slice)
  slices.push(slice)
}

console.log(`${PREFIX} lipo-combining ${slices.length} slices → ${finalNode}`)
execFileSync('lipo', ['-create', ...slices, '-output', finalNode], { stdio: 'inherit' })
for (const slice of slices) rmSync(slice, { force: true })

// Hard regression guard: the packaged binary MUST be fat. A single-arch result here means the
// off-host-arch DMG would again ship an unloadable binary — fail the build loudly instead.
const archs = execFileSync('lipo', ['-archs', finalNode], { encoding: 'utf8' }).trim().split(/\s+/)
const missing = REQUIRED_ARCHS.filter((a) => !archs.includes(a))
if (missing.length > 0) {
  throw new Error(
    `${PREFIX} expected a fat ${REQUIRED_ARCHS.join('+')} binary but got [${archs.join(', ')}]` +
      ` — missing ${missing.join(', ')}`
  )
}
console.log(`${PREFIX} ✓ better_sqlite3.node is universal: ${archs.join(' + ')}`)
