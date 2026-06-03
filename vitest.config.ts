import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Mirrors the `@shared` / `@app` TS paths (tsconfig.node.json) and
  // electron-vite's main-process aliases (electron.vite.config.ts) so tests
  // resolve the same specifiers as the build.
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@app': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    passWithNoTests: true
  }
})
