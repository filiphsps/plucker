import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { createMaterializer } from './materialize'
import type { TransformServices } from '@app/transforms/types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-mat-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function blob(
  store: ReturnType<typeof createContentStore>,
  content: string
): { hash: string; path: string; size: number } {
  const f = join(dir, `${Math.random()}.mp3`)
  writeFileSync(f, content)
  return store.put(f)
}

describe('materializer', () => {
  it('returns the existing blob path when a version is already materialized', async () => {
    const db = new Database(':memory:')
    migrate(db)
    const repo = createRepo(db)
    const store = createContentStore(join(dir, 'blobs'))
    const f = join(dir, 'root.mp3')
    writeFileSync(f, 'root-bytes')
    const b = store.put(f)
    repo.refBlob(b, store)
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
      parentId: null,
      blobHash: b.hash,
      recipe: { steps: [] },
      materialized: true,
      createdAt: 't'
    })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })

    const mat = createMaterializer({
      repo,
      store,
      registry: new Map(),
      services: {} as unknown as Omit<TransformServices, 'reportProgress'>,
      lruCapacity: 8
    })
    const path = await mat.ensureMaterialized('v1')
    expect(path).toBe(store.pathFor(b.hash))
  })

  it('evicts the coldest replayable, non-tip, non-root version once the LRU exceeds capacity', async () => {
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
    // root v0 (protected), then 9 interior materialized replayable versions v1..v9.
    const root = blob(store, 'root')
    repo.refBlob(root, store)
    repo.insertVersion({
      id: 'v0',
      trackId: 't1',
      parentId: null,
      blobHash: root.hash,
      recipe: { steps: [] },
      materialized: true,
      createdAt: 't0'
    })
    let parent = 'v0'
    for (let i = 1; i <= 9; i++) {
      const b = blob(store, `audio-${i}`)
      repo.refBlob(b, store)
      repo.insertVersion({
        id: `v${i}`,
        trackId: 't1',
        parentId: parent,
        blobHash: b.hash,
        recipe: { steps: [] },
        materialized: true,
        createdAt: `t${i}`
      })
      parent = `v${i}`
    }
    // branch tip is the latest (v9) so it stays protected; v1..v8 are interior.
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v9' })

    const mat = createMaterializer({
      repo,
      store,
      registry: new Map(),
      services: {} as unknown as Omit<TransformServices, 'reportProgress'>,
      lruCapacity: 8
    })
    for (let i = 1; i <= 9; i++) await mat.ensureMaterialized(`v${i}`)

    // After the 9th touch the LRU exceeds 8 and the coldest evictable (v1) is demoted.
    expect(repo.getVersion('v1')?.materialized).toBe(false)
    expect(repo.getVersion('v9')?.materialized).toBe(true) // tip protected
    expect(repo.getVersion('v0')?.materialized).toBe(true) // root protected
  })
})
