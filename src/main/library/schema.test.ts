import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from './schema'

describe('schema migration', () => {
  it('creates every table with foreign keys and WAL pragma', () => {
    const db = new Database(':memory:')
    migrate(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of ['activity', 'blobs', 'branches', 'collections', 'track_instances', 'versions'])
      expect(tables).toContain(t)
    expect(db.pragma('foreign_keys', { simple: true }) as number).toBe(1)
  })

  it('is idempotent (safe to run twice)', () => {
    const db = new Database(':memory:')
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
  })
})
