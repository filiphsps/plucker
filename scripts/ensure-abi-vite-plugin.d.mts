import type { Plugin } from 'vite'

/**
 * Vite plugin (main config only) that re-pins the shared better-sqlite3 binary to Electron's ABI
 * before every `electron-vite dev` watch restart. `run` is injectable for tests.
 */
export declare function ensureBetterSqlite3ElectronAbi(options?: { run?: () => void }): Plugin
