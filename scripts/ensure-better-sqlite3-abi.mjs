// better-sqlite3 is a native (node-gyp) module, so its compiled binary is ABI-specific.
// The app's `postinstall` builds it for Electron's ABI (via electron-builder
// install-app-deps), but Vitest runs the unit tests under plain Node — a different ABI.
// This guard, wired as `pretest`, loads the module and, only if the ABI doesn't match,
// rebuilds it for the current Node. It's a no-op (fast) once the binary already matches,
// so the watch/TDD loop stays quick; it only pays the rebuild cost right after an
// Electron build (e.g. a fresh `pnpm install` or `pnpm dev`).
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)

try {
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
} catch (err) {
  const message = String(err?.message ?? err)
  const abiMismatch = /NODE_MODULE_VERSION|Could not locate the bindings file|did not self-register/.test(
    message
  )
  if (!abiMismatch) throw err
  console.log('[ensure-abi] better-sqlite3 needs a Node rebuild for the test runtime…')
  execSync('pnpm rebuild better-sqlite3', { stdio: 'inherit' })
}
