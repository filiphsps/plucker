import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { collectGarbage } from './gc'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-gc-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('orphan GC', () => {
  it('removes on-disk blobs that have no row (crash between blob write and DB commit)', () => {
    const db = new Database(':memory:')
    migrate(db)
    const repo = createRepo(db)
    const store = createContentStore(join(dir, 'blobs'))
    const f = join(dir, 'x.mp3')
    writeFileSync(f, 'orphan')
    const { hash, path } = store.put(f) // on disk, never registered in DB
    const report = collectGarbage(repo, store)
    expect(report.removedFiles).toContain(hash)
    expect(existsSync(path)).toBe(false)
  })

  it('marks versions whose blob is missing on disk as unmaterialized', () => {
    const db = new Database(':memory:')
    migrate(db)
    const repo = createRepo(db)
    const store = createContentStore(join(dir, 'blobs'))
    repo.insertCollection({ id: 'c1', kind: 'single', title: 'T', createdAt: 't' })
    repo.insertTrack({
      id: 't1',
      collectionId: 'c1',
      orderIndex: 1,
      title: 'T',
      activeBranchId: 'b1'
    })
    repo.insertVersion({
      id: 'v1',
      trackId: 't1',
      parentId: 'v0',
      blobHash: 'deadbeef',
      recipe: { steps: [{ type: 'rename', config: {} }] },
      materialized: true,
      createdAt: 't'
    })
    // blobs row exists but file does not
    repo.db
      .prepare('INSERT INTO blobs (hash,path,size,refcount) VALUES (?,?,?,1)')
      .run('deadbeef', store.pathFor('deadbeef'), 1)
    const report = collectGarbage(repo, store)
    expect(report.demoted).toContain('v1')
    expect(repo.getVersion('v1')?.materialized).toBe(false)
  })
})
