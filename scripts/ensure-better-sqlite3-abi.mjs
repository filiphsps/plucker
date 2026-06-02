// better-sqlite3 is a native (node-gyp) module, so its compiled binary is ABI-specific,
// and this repo serves two runtimes from one node_modules:
//   • the app runs under Electron (its `postinstall` builds the Electron ABI), and
//   • Vitest runs the unit tests under plain Node (a different ABI).
//
// This guard keeps the binary matched to whatever is about to run it:
//   `pretest` → `--target node`     (rebuild for Node if the binary won't load there)
//   `predev`  → `--target electron` (rebuild for Electron if the binary is a Node build)
//
// It's a fast no-op once the binary already matches, so the watch/TDD and dev loops stay
// quick; the rebuild cost is paid only when switching between testing and running the app.
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const target = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : 'node'

/** Probe the installed binary against the *current* (Node) ABI. */
function probe() {
  try {
    const Database = require('better-sqlite3')
    new Database(':memory:').close()
    return 'node' // loads under Node → it's a Node-ABI build
  } catch (err) {
    const message = String(err?.message ?? err)
    if (/NODE_MODULE_VERSION/.test(message)) return 'other' // built for a different (Electron) ABI
    if (/Could not locate the bindings file|did not self-register/.test(message)) return 'missing'
    throw err
  }
}

const state = probe()

if (target === 'node') {
  if (state !== 'node') {
    console.log('[ensure-abi] rebuilding better-sqlite3 for the Node test runtime…')
    execSync('pnpm rebuild better-sqlite3', { stdio: 'inherit' })
  }
} else if (target === 'electron') {
  // Only the Node-ABI (or missing) cases need work; an 'other' ABI is assumed to be the
  // Electron build already in place. A fresh install or Electron upgrade goes through
  // `postinstall` anyway, which rebuilds for Electron.
  if (state === 'node' || state === 'missing') {
    console.log('[ensure-abi] rebuilding native deps for the Electron runtime…')
    // `pnpm exec` resolves the local electron-builder regardless of how this script is
    // invoked (PATH only includes node_modules/.bin inside a pnpm lifecycle script).
    execSync('pnpm exec electron-builder install-app-deps', { stdio: 'inherit' })
  }
} else {
  throw new Error(`ensure-abi: unknown --target "${target}" (expected node|electron)`)
}
