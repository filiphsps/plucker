import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { exportTracks } from './export'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-export-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('exportTracks', () => {
  it('copies each track’s current blob to dest named by its resolved tags', async () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const f = join(dir, 'x.mp3'); writeFileSync(f, 'bytes')
    const blob = store.put(f); repo.refBlob(blob, store)
    repo.insertCollection({ id: 'c1', kind: 'single', title: 'T', createdAt: 't' })
    repo.insertTrack({ id: 't1', collectionId: 'c1', orderIndex: 1, title: 'Song', activeBranchId: 'b1' })
    repo.insertVersion({ id: 'v1', trackId: 't1', parentId: null, blobHash: blob.hash, recipe: { steps: [], resolved: { tags: { artist: 'Artist', title: 'Song' } } }, materialized: true, createdAt: 't' })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })

    const dest = join(dir, 'out')
    const written = await exportTracks(
      { repo, materialize: async (id) => store.pathFor(repo.getVersion(id)!.blobHash!), buildName: (tags) => `${tags.artist} - ${tags.title}` },
      ['t1'], dest, { perPlaylistSubfolder: false }
    )
    expect(written[0]).toBe(join(dest, 'Artist - Song.mp3'))
    expect(existsSync(written[0])).toBe(true)
    expect(readdirSync(dest)).toContain('Artist - Song.mp3')
  })
})
