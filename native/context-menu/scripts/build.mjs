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
// Each arch gets its OWN build path (`.build/<arch>`) — they must NOT share one. SwiftPM
// keeps a single llbuild manifest + `build.db` per build path, and node-swift's macro
// plugin (NodeAPIMacros + its whole swift-syntax tree) is a *host* tool whose build
// commands SwiftPM regenerates differently for a native build vs a cross build. With a
// shared `.build`, the arm64 pass and the x86_64 pass overwrite each other's manifest, so
// every flip re-dirties the other arch's macro plugin and recompiles swift-syntax from
// scratch (~4 min/arch, every build). Isolated build paths make each arch a permanent
// incremental cache: swift-syntax compiles once per arch, then never again.
//
// Incremental by default: a one-file change only recompiles our sources — not
// node-swift's swift-syntax tree — and an unchanged rebuild is a ~1 s no-op per arch.
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

if (args.includes('--clean')) {
  rmSync(buildPath, { recursive: true, force: true })
}

// Which arches to build. CLI flags win (`--arch arm64`, `--arch arm64,x86_64`, or the
// bare `--arm64`/`--x64`/`--x86_64` shorthands); otherwise PLUCKER_NATIVE_ARCH — CI's
// per-arch matrix sets this so each job builds only its own slice instead of both;
// otherwise default to both → a universal binary for local dev and `build:mac`. `x64`
// (Electron/CI naming) is accepted as an alias for Swift/lipo's `x86_64`.
const ALL_ARCHES = ['arm64', 'x86_64']
const normalizeArch = (a) => (a === 'x64' ? 'x86_64' : a)
function requestedArches() {
  const fromFlags = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--arm64') fromFlags.push('arm64')
    else if (a === '--x64' || a === '--x86_64') fromFlags.push('x86_64')
    else if (a === '--arch') fromFlags.push(...(args[++i] ?? '').split(','))
    else if (a.startsWith('--arch=')) fromFlags.push(...a.slice('--arch='.length).split(','))
  }
  const raw = fromFlags.length ? fromFlags : (process.env.PLUCKER_NATIVE_ARCH ?? '').split(',')
  const arches = [...new Set(raw.map((s) => normalizeArch(s.trim())).filter(Boolean))]
  const unknown = arches.filter((a) => !ALL_ARCHES.includes(a))
  if (unknown.length) {
    console.error(
      `[native-context-menu] unknown arch(es): ${unknown.join(', ')} — want arm64 or x86_64/x64`
    )
    process.exit(1)
  }
  return arches.length ? arches : ALL_ARCHES
}
const arches = requestedArches()

// One self-contained dylib per arch, each built in its OWN build path (`.build/<arch>`) so
// the arches never share a build.db — sharing thrashes node-swift's macro plugin (header).
const slices = arches.map((arch) => {
  const archBuildPath = join(buildPath, arch)
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
      archBuildPath,
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
  return join(archBuildPath, `${arch}-apple-macosx`, mode, 'libModule.dylib')
})

// Stitch the slice(s) into one Module.node and ad-hoc codesign it (dyld/Gatekeeper reject
// the rewritten Mach-O otherwise — node-swift does the same after its own build). With both
// arches it's a universal binary; with one (CI's per-arch matrix) lipo just emits that thin
// slice — exactly what that arch's DMG ships, so no later thinning is needed.
const outDir = join(buildPath, mode)
mkdirSync(outDir, { recursive: true })
const universal = join(outDir, 'Module.node')
console.log(`[native-context-menu] lipo → Module.node (${arches.join(' + ')})`)
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
const kind = arches.length > 1 ? 'universal' : 'thin'
console.log(`[native-context-menu] staged prebuilds/Module.node (${kind}: ${arches.join(' + ')})`)
