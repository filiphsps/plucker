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
})
