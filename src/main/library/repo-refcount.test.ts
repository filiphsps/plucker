import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo, type Repo } from './repo'
import { createContentStore, type ContentStore } from './content-store'

let dir: string
const setup = (): { repo: Repo; store: ContentStore } => {
  const db = new Database(':memory:')
  migrate(db)
  const repo = createRepo(db)
  const store = createContentStore(join(dir, 'blobs'))
  return { repo, store }
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-rc-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function ingestBlob(
  store: ReturnType<typeof createContentStore>,
  content: string
): { hash: string; path: string; size: number } {
  const f = join(dir, `${Math.random()}.mp3`)
  writeFileSync(f, content)
  return store.put(f)
}

describe('refcount + cascade delete', () => {
  it('refBlob registers + increments; deref decrements and removes file at zero', () => {
    const { repo, store } = setup()
    const b = ingestBlob(store, 'x')
    repo.refBlob(b, store)
    expect(repo.getBlob(b.hash)?.refcount).toBe(1)
    repo.refBlob(b, store)
    expect(repo.getBlob(b.hash)?.refcount).toBe(2)
    repo.derefBlob(b.hash, store)
    expect(repo.getBlob(b.hash)?.refcount).toBe(1)
    expect(existsSync(b.path)).toBe(true)
    repo.derefBlob(b.hash, store)
    expect(repo.getBlob(b.hash)).toBeNull()
    expect(existsSync(b.path)).toBe(false)
  })

  it('REGRESSION: two track instances sharing one blob — deleting one keeps the file for the other', () => {
    const { repo, store } = setup()
    const root = ingestBlob(store, 'shared-raw-audio')
    // collection A with a track whose root version points at the shared blob
    for (const id of ['A', 'B']) {
      repo.insertCollection({ id: `c${id}`, kind: 'single', title: id, createdAt: 't' })
      repo.insertTrack({
        id: `t${id}`,
        collectionId: `c${id}`,
        orderIndex: 1,
        title: id,
        activeBranchId: `b${id}`
      })
      repo.insertVersion({
        id: `v${id}`,
        trackId: `t${id}`,
        parentId: null,
        blobHash: root.hash,
        recipe: { steps: [] },
        materialized: true,
        createdAt: 't'
      })
      repo.insertBranch({ id: `b${id}`, trackId: `t${id}`, name: 'main', tipVersionId: `v${id}` })
      repo.refBlob(root, store)
    }
    expect(repo.getBlob(root.hash)?.refcount).toBe(2)

    repo.deleteTrack('tA', store) // delete the "solo" copy
    expect(repo.getTrack('tA')).toBeNull()
    expect(existsSync(root.path)).toBe(true) // file survives!
    expect(repo.getBlob(root.hash)?.refcount).toBe(1) // still referenced by B

    repo.deleteTrack('tB', store) // now the last reference
    expect(existsSync(root.path)).toBe(false)
    expect(repo.getBlob(root.hash)).toBeNull()
  })

  it('deleteCollection cascades to its tracks/versions/branches and derefs their blobs', () => {
    const { repo, store } = setup()
    const blob = ingestBlob(store, 'only-here')
    repo.insertCollection({ id: 'c1', kind: 'playlist', title: 'P', createdAt: 't' })
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
      parentId: null,
      blobHash: blob.hash,
      recipe: { steps: [] },
      materialized: true,
      createdAt: 't'
    })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })
    repo.refBlob(blob, store)
    repo.deleteCollection('c1', store)
    expect(repo.getCollection('c1')).toBeNull()
    expect(repo.getTrack('t1')).toBeNull()
    expect(existsSync(blob.path)).toBe(false)
  })
})
