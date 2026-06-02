// Builds the node-swift addon into `.build/Module.node`. No-ops off macOS so the
// package can sit in the workspace without breaking Linux/Windows/CI installs.
//
// Incremental by default: `node-swift build` reuses SwiftPM's `.build` cache, so a
// one-file change only recompiles our sources — not node-swift's swift-syntax tree.
// (`node-swift rebuild` wipes `.build` first; only use it via `--clean` when needed.)
//
//   node scripts/build.mjs            incremental release build (default)
//   node scripts/build.mjs --debug    incremental debug build (fastest; for dev)
//   node scripts/build.mjs --clean    clean release rebuild (cold)
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync, copyFileSync, realpathSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')

if (process.platform !== 'darwin') {
  console.log('[native-context-menu] skipping build (macOS only)')
  process.exit(0)
}

const args = process.argv.slice(2)
const cmd = args.includes('--clean') ? 'rebuild' : 'build'
const mode = args.includes('--debug') ? ' --debug' : ''

execSync(`node node_modules/node-swift/lib/cli.js ${cmd}${mode}`, {
  cwd: pkgDir,
  stdio: 'inherit'
})

// Stage the built binary into prebuilds/ (resolving the .build/Module.node symlink) so
// packaging ships just the .node — never SwiftPM's heavy .build tree.
const built = realpathSync(resolve(pkgDir, '.build/Module.node'))
const out = resolve(pkgDir, 'prebuilds')
mkdirSync(out, { recursive: true })
copyFileSync(built, resolve(out, 'Module.node'))
console.log('[native-context-menu] staged prebuilds/Module.node')
