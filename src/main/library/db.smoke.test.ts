import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

describe('better-sqlite3', () => {
  it('opens an in-memory database and round-trips a row', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)')
    db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').run('a', 1)
    const row = db.prepare('SELECT n FROM t WHERE id = ?').get('a') as { n: number }
    expect(row.n).toBe(1)
    db.close()
  })
})
