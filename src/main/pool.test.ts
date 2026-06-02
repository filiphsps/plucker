// src/main/pool.test.ts
import { describe, it, expect } from 'vitest'
import { createPool } from './pool'

describe('createPool', () => {
  it('runs all submitted tasks and never exceeds the limit', async () => {
    const pool = createPool(2)
    let active = 0
    let maxActive = 0
    const order: number[] = []
    for (let i = 0; i < 6; i++) {
      pool.run(async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 5))
        order.push(i)
        active--
      })
    }
    await pool.drain()
    expect(order).toHaveLength(6)
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('drain settles even if a task throws', async () => {
    const pool = createPool(2)
    pool.run(async () => {
      throw new Error('boom')
    })
    pool.run(async () => {})
    await expect(pool.drain()).resolves.toBeDefined()
  })

  it('setLimit raises the ceiling and wakes waiters', async () => {
    const defer = (): { p: Promise<void>; resolve: () => void } => {
      let resolve!: () => void
      const p = new Promise<void>((r) => (resolve = r))
      return { p, resolve }
    }
    const pool = createPool(1)
    let active = 0
    let peak = 0
    const gates = [defer(), defer(), defer()]
    gates.forEach((g) =>
      pool.run(async () => {
        active++
        peak = Math.max(peak, active)
        await g.p
        active--
      })
    )
    pool.setLimit(3) // wakes the two queued tasks
    await Promise.resolve()
    await Promise.resolve()
    gates.forEach((g) => g.resolve())
    await pool.drain()
    expect(peak).toBe(3)
  })
})
