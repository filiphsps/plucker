import { describe, it, expect, vi } from 'vitest'
import { ensureBetterSqlite3ElectronAbi } from './ensure-abi-vite-plugin.mjs'

/** Minimal stand-in for rollup's PluginContext (`this`) inside the `buildStart` hook. */
function context(watchMode) {
  return { meta: watchMode === undefined ? undefined : { watchMode } }
}

describe('ensureBetterSqlite3ElectronAbi', () => {
  it('is a named vite plugin exposing a buildStart hook', () => {
    const plugin = ensureBetterSqlite3ElectronAbi()
    expect(plugin.name).toBe('ensure-better-sqlite3-electron-abi')
    expect(typeof plugin.buildStart).toBe('function')
  })

  it('reconciles the Electron ABI on a watch-mode rebuild', () => {
    const run = vi.fn()
    const plugin = ensureBetterSqlite3ElectronAbi({ run })
    plugin.buildStart.call(context(true))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does nothing on a one-shot (production) build', () => {
    const run = vi.fn()
    const plugin = ensureBetterSqlite3ElectronAbi({ run })
    plugin.buildStart.call(context(false))
    expect(run).not.toHaveBeenCalled()
  })

  it('does nothing when no rollup watch metadata is present', () => {
    const run = vi.fn()
    const plugin = ensureBetterSqlite3ElectronAbi({ run })
    plugin.buildStart.call(context(undefined))
    expect(run).not.toHaveBeenCalled()
  })
})
