// Builds the node-swift addon into a UNIVERSAL `.build/<mode>/Module.node` (arm64 +
// x86_64) and stages it into `prebuilds/`. No-ops off macOS so the package can sit in
// the workspace without breaking Linux/Windows/CI installs.
//
// Why we drive `swift build` directly instead of node-swift's CLI: node-swift can't
// cross-compile. Passing `--arch` relocates the product into an arch-specific subdir
// that its rename step doesn't look in, and a single multi-arch `swift build` trips
// node-swift's macro plugin under Xcode's integrated build system. So we build each arch
// separately with the normal build system (macros work, and NodeAPI links statically —
// no external libNodeAPI.dylib to ship), then `lipo` the slices into one fat binary.
// A universal binary means each arch's DMG bundles a single addon that loads on both
// Apple Silicon and Intel Macs.
//
// Incremental by default: `swift build` reuses SwiftPM's per-arch `.build` cache, so a
// one-file change only recompiles our sources — not node-swift's swift-syntax tree.
//
//   node scripts/build.mjs            incremental release build (default)
//   node scripts/build.mjs --debug    incremental debug build (fastest; for dev)
//   node scripts/build.mjs --clean    clean release rebuild (cold)
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdirSync, copyFileSync, rmSync, symlinkSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')

if (process.platform !== 'darwin') {
  console.log('[native-context-menu] skipping build (macOS only)')
  process.exit(0)
}

const args = process.argv.slice(2)
const mode = args.includes('--debug') ? 'debug' : 'release'
const buildPath = join(pkgDir, '.build')

if (args.includes('--clean')) rmSync(buildPath, { recursive: true, force: true })

// One self-contained dylib per arch.
const arches = ['arm64', 'x86_64']
const slices = arches.map((arch) => {
  console.log(`[native-context-menu] building ${arch} (${mode})…`)
  execFileSync(
    'swift',
    [
      'build',
      '-c',
      mode,
      '--product',
      'Module',
      '--build-path',
      buildPath,
      '--arch',
      arch,
      // node-swift's macros leave the napi C symbols (napi_*) undefined; the host
      // node/electron process provides them at load time.
      '-Xlinker',
      '-undefined',
      '-Xlinker',
      'dynamic_lookup'
    ],
    { cwd: pkgDir, stdio: 'inherit' }
  )
  return join(buildPath, `${arch}-apple-macosx`, mode, 'libModule.dylib')
})

// Stitch the slices into one universal Module.node and ad-hoc codesign it (dyld/Gatekeeper
// reject the rewritten Mach-O otherwise — node-swift does the same after its own build).
const outDir = join(buildPath, mode)
mkdirSync(outDir, { recursive: true })
const universal = join(outDir, 'Module.node')
console.log('[native-context-menu] lipo → universal Module.node')
execFileSync('lipo', ['-create', ...slices, '-output', universal], { stdio: 'inherit' })
execFileSync('codesign', ['-fs', '-', universal], { stdio: 'inherit' })

// The loader (index.js) tries ./prebuilds/Module.node then ./.build/Module.node, so keep
// a top-level .build symlink for local dev and stage prebuilds/ for packaging (ships just
// the .node — never SwiftPM's heavy .build tree).
const devLink = join(buildPath, 'Module.node')
rmSync(devLink, { force: true })
symlinkSync(join(mode, 'Module.node'), devLink)

const prebuilds = join(pkgDir, 'prebuilds')
mkdirSync(prebuilds, { recursive: true })
copyFileSync(universal, join(prebuilds, 'Module.node'))
console.log(`[native-context-menu] staged prebuilds/Module.node (universal: ${arches.join(' + ')})`)
