// `electron-vite dev --watch` kills and respawns the Electron child on every main-process
// rebuild (see "electron main process rebuilt successfully / restarting electron app"), but the
// ABI guard only runs once per `pnpm` invocation via the `predev` hook — it never re-runs on
// those in-session restarts. Because one `node_modules` serves two runtimes (Electron = ABI 146,
// Node = ABI 147) from a single better-sqlite3 binary, a mid-session `pnpm test` (`pretest`
// compiles it for the Node ABI) leaves the next watch restart loading the wrong ABI, and the
// respawned main process crashes with `NODE_MODULE_VERSION 147 … requires 146`.
//
// This plugin closes that gap: attached to the *main* config (the only target that respawns
// Electron — preload changes only reload the renderer), its `buildStart` re-reconciles the binary
// to the Electron ABI before each restart. It runs only under rollup watch (i.e. `dev`), never a
// production `electron-vite build`, and the underlying guard short-circuits cheaply when the
// binary already matches, so the from-source recompile is paid only right after a test flip.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ensureAbiScript = join(dirname(fileURLToPath(import.meta.url)), 'ensure-better-sqlite3-abi.mjs')

/** Reconcile the installed better-sqlite3 binary to Electron's ABI via the shared ABI guard. */
function reconcileElectronAbi() {
  execFileSync(process.execPath, [ensureAbiScript, '--target', 'electron'], { stdio: 'inherit' })
}

/**
 * Vite plugin (main config only) that keeps the shared better-sqlite3 binary matched to the
 * Electron ABI across every dev-watch restart. `run` is injectable for tests.
 */
export function ensureBetterSqlite3ElectronAbi({ run = reconcileElectronAbi } = {}) {
  return {
    name: 'ensure-better-sqlite3-electron-abi',
    buildStart() {
      // `this.meta.watchMode` is true only under rollup watch (electron-vite `dev`); a one-shot
      // production build leaves it false, so this never recompiles during `electron-vite build`.
      if (!this.meta?.watchMode) return
      run()
    }
  }
}
