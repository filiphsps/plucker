import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ensureBetterSqlite3ElectronAbi } from './scripts/ensure-abi-vite-plugin.mjs'

export default defineConfig({
  // The main process is the only target electron-vite respawns on a watch rebuild, so it's where
  // we re-pin the shared better-sqlite3 binary to Electron's ABI before each restart — otherwise a
  // mid-session `pnpm test` flips it to the Node ABI and the respawn crashes (see the plugin).
  main: { plugins: [ensureBetterSqlite3ElectronAbi()] },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
