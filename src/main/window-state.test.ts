import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseBounds,
  isOnScreen,
  loadWindowBounds,
  saveWindowBounds,
  clearWindowBounds,
  type WindowBounds
} from './window-state'

const valid: WindowBounds = { x: 100, y: 120, width: 900, height: 670 }

describe('parseBounds', () => {
  it('accepts a well-formed bounds object', () => {
    expect(parseBounds(valid)).toEqual(valid)
  })

  it('rejects non-objects', () => {
    expect(parseBounds(null)).toBeNull()
    expect(parseBounds('nope')).toBeNull()
    expect(parseBounds(42)).toBeNull()
  })

  it('rejects missing or non-finite numbers', () => {
    expect(parseBounds({ x: 0, y: 0, width: 900 })).toBeNull()
    expect(parseBounds({ x: 0, y: 0, width: NaN, height: 670 })).toBeNull()
    expect(parseBounds({ x: 0, y: 0, width: '900', height: 670 })).toBeNull()
  })

  it('rejects windows below the usable size floor', () => {
    expect(parseBounds({ x: 0, y: 0, width: 100, height: 100 })).toBeNull()
  })
})

describe('isOnScreen', () => {
  const display = { x: 0, y: 0, width: 1440, height: 900 }

  it('is true when the window sits inside a display', () => {
    expect(isOnScreen(valid, [display])).toBe(true)
  })

  it('is true when partially overlapping but still grabbable', () => {
    expect(isOnScreen({ x: -200, y: 50, width: 900, height: 670 }, [display])).toBe(true)
  })

  it('is false when stranded off every display', () => {
    expect(isOnScreen({ x: 5000, y: 5000, width: 900, height: 670 }, [display])).toBe(false)
  })

  it('is false when only a sliver smaller than the margin is visible', () => {
    expect(isOnScreen({ x: 1430, y: 0, width: 900, height: 670 }, [display])).toBe(false)
  })

  it('finds the window on a secondary display', () => {
    const second = { x: 1440, y: 0, width: 1920, height: 1080 }
    expect(isOnScreen({ x: 1500, y: 100, width: 900, height: 670 }, [display, second])).toBe(true)
  })
})

describe('load/save round-trip', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plucker-winstate-'))
  })
  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('persists and reads back bounds', () => {
    const file = join(dir, 'window-state.json')
    saveWindowBounds(file, valid)
    expect(loadWindowBounds(file)).toEqual(valid)
  })

  it('returns null for a missing file', () => {
    expect(loadWindowBounds(join(dir, 'nope.json'))).toBeNull()
  })

  it('returns null for a corrupt file', () => {
    const file = join(dir, 'corrupt.json')
    writeFileSync(file, '{ not json')
    expect(loadWindowBounds(file)).toBeNull()
  })

  it('clearWindowBounds forgets persisted geometry', () => {
    const file = join(dir, 'window-state.json')
    saveWindowBounds(file, valid)
    clearWindowBounds(file)
    expect(loadWindowBounds(file)).toBeNull()
  })

  it('clearWindowBounds is a no-op when no file exists', () => {
    expect(() => clearWindowBounds(join(dir, 'nope.json'))).not.toThrow()
  })
})
