import { describe, it, expect } from 'vitest'
import {
  clampConsoleZoom,
  stepConsoleZoom,
  CONSOLE_ZOOM_MIN,
  CONSOLE_ZOOM_MAX,
  CONSOLE_ZOOM_DEFAULT
} from './console-zoom'

describe('clampConsoleZoom', () => {
  it('passes through values within range', () => {
    expect(clampConsoleZoom(1)).toBe(1)
    expect(clampConsoleZoom(1.5)).toBe(1.5)
  })

  it('clamps to the min and max bounds', () => {
    expect(clampConsoleZoom(0.1)).toBe(CONSOLE_ZOOM_MIN)
    expect(clampConsoleZoom(5)).toBe(CONSOLE_ZOOM_MAX)
  })

  it('falls back to the default for non-finite input', () => {
    expect(clampConsoleZoom(NaN)).toBe(CONSOLE_ZOOM_DEFAULT)
    expect(clampConsoleZoom(Infinity)).toBe(CONSOLE_ZOOM_DEFAULT)
    expect(clampConsoleZoom(-Infinity)).toBe(CONSOLE_ZOOM_DEFAULT)
  })
})

describe('stepConsoleZoom', () => {
  it('steps up and down by one increment', () => {
    expect(stepConsoleZoom(1, 1)).toBe(1.1)
    expect(stepConsoleZoom(1, -1)).toBe(0.9)
  })

  it('avoids floating-point drift across repeated steps', () => {
    let z = 1
    for (let i = 0; i < 3; i++) z = stepConsoleZoom(z, 1)
    expect(z).toBe(1.3)
  })

  it('does not exceed the bounds', () => {
    expect(stepConsoleZoom(CONSOLE_ZOOM_MAX, 1)).toBe(CONSOLE_ZOOM_MAX)
    expect(stepConsoleZoom(CONSOLE_ZOOM_MIN, -1)).toBe(CONSOLE_ZOOM_MIN)
  })
})
