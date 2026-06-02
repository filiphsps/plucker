import { describe, expect, it } from 'vitest'
import {
  MAC_ICON_BODY_RATIO,
  MAC_ICON_SUPERELLIPSE_EXPONENT,
  macIconSquirclePath
} from './macos-icon-mask'

/** Parse "x,y" pairs out of an `M…L…L…Z` path. */
function pointsOf(path: string): Array<[number, number]> {
  return path
    .replace(/^M/, '')
    .replace(/Z$/, '')
    .split('L')
    .map((pair) => pair.split(',').map(Number) as [number, number])
}

describe('macIconSquirclePath', () => {
  it('is a closed path starting with M and ending with Z', () => {
    const path = macIconSquirclePath(1024)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
  })

  it('emits one point per segment', () => {
    expect(pointsOf(macIconSquirclePath(1024, 8))).toHaveLength(8)
    expect(pointsOf(macIconSquirclePath(1024, 360))).toHaveLength(360)
  })

  it('starts at the rightmost point on the vertical center line', () => {
    // t = 0 → (center + radius, center).
    const radius = (1024 * MAC_ICON_BODY_RATIO) / 2
    const [x, y] = pointsOf(macIconSquirclePath(1024))[0]
    expect(x).toBeCloseTo(512 + radius, 3)
    expect(y).toBeCloseTo(512, 3)
  })

  it('insets every point to the icon body — never touching the canvas edge', () => {
    const margin = (1024 * (1 - MAC_ICON_BODY_RATIO)) / 2
    for (const [x, y] of pointsOf(macIconSquirclePath(1024))) {
      expect(x).toBeGreaterThanOrEqual(margin - 0.001)
      expect(x).toBeLessThanOrEqual(1024 - margin + 0.001)
      expect(y).toBeGreaterThanOrEqual(margin - 0.001)
      expect(y).toBeLessThanOrEqual(1024 - margin + 0.001)
    }
  })

  it('is symmetric about the center for an even segment count', () => {
    const path = macIconSquirclePath(1024, 360)
    const pts = pointsOf(path)
    const opposite = pts[180] // half a turn from the start
    expect(opposite[0]).toBeCloseTo(512 - (1024 * MAC_ICON_BODY_RATIO) / 2, 3)
    expect(opposite[1]).toBeCloseTo(512, 3)
  })

  it('fills more of the box than a circle (corners push outward)', () => {
    // A point at 45° on a superellipse (n>2) sits beyond the inscribed circle.
    const pts = pointsOf(macIconSquirclePath(1024, 8))
    const corner = pts[1] // t = 45°
    const radius = (1024 * MAC_ICON_BODY_RATIO) / 2
    const distFromCenter = Math.hypot(corner[0] - 512, corner[1] - 512)
    expect(distFromCenter).toBeGreaterThan(radius)
  })

  it('scales with the canvas size', () => {
    const radius = (2048 * MAC_ICON_BODY_RATIO) / 2
    const [x, y] = pointsOf(macIconSquirclePath(2048))[0]
    expect(x).toBeCloseTo(1024 + radius, 3)
    expect(y).toBeCloseTo(1024, 3)
  })

  it('uses the documented Apple grid constants', () => {
    expect(MAC_ICON_BODY_RATIO).toBeCloseTo(0.8046875, 7)
    expect(MAC_ICON_SUPERELLIPSE_EXPONENT).toBe(5)
  })
})
