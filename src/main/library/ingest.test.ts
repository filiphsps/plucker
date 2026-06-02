import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { foldJobResultIntoLibrary } from './ingest'
import type { JobResult } from '../pipeline'

let dir: string
let seq = 0
const ids = () => `id${seq++}`
const now = () => '2026-06-02T00:00:00.000Z'
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-ingest-')); seq = 0 })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function fileWith(content: string): string {
  const f = join(dir, `${Math.random()}.mp3`); writeFileSync(f, content); return f
}

describe('foldJobResultIntoLibrary', () => {
  it('creates a playlist collection with one track+version+branch per done track', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const result: JobResult = {
      title: 'My Mix', folder: dir, url: 'http://list', kind: 'playlist', outcome: 'completed',
      tracks: [
        { title: 'One', status: 'done', file: fileWith('a'), videoId: 'v1', hash: 'h1', artist: 'AA' },
        { title: 'Two', status: 'failed', reason: 'nope' }
      ]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job1', result)
    const cols = repo.listCollections()
    expect(cols).toHaveLength(1)
    expect(cols[0].kind).toBe('playlist')
    const tracks = repo.listTracks(cols[0].id)
    expect(tracks).toHaveLength(1) // only the done track
    const branch = repo.getBranch(tracks[0].activeBranchId)!
    const ver = repo.getVersion(branch.tipVersionId)!
    expect(ver.parentId).toBeNull()
    expect(ver.materialized).toBe(true)
    expect(repo.getBlob(ver.blobHash!)?.refcount).toBe(1)
  })

  it('a single-video job becomes a `single` collection', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const result: JobResult = {
      title: 'Solo', folder: dir, url: 'http://watch', kind: 'video', outcome: 'completed',
      tracks: [{ title: 'Solo', status: 'done', file: fileWith('b'), videoId: 'v9', hash: 'h9' }]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job2', result)
    expect(repo.listCollections()[0].kind).toBe('single')
  })

  it('appends an `ingested` activity event', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const result: JobResult = {
      title: 'X', folder: dir, url: 'u', kind: 'video', outcome: 'completed',
      tracks: [{ title: 'X', status: 'done', file: fileWith('c') }]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job3', result)
    expect(repo.listActivity().some((a) => a.type === 'ingested')).toBe(true)
  })

  it('builds a raw root + default-chain child when rawFile + appliedChain are present', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const raw = fileWith('raw-audio'); const finalF = fileWith('tagged-audio')
    const result: JobResult = {
      title: 'X', folder: dir, url: 'u', kind: 'video', outcome: 'completed',
      tracks: [{ title: 'X', status: 'done', file: finalF, rawFile: raw,
        appliedChain: [{ type: 'auto-tag', config: {} }], artist: 'A', hash: 'h' }]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job1', result)
    const track = repo.listTracks(repo.listCollections()[0].id)[0]
    const versions = repo.listVersions(track.id)
    expect(versions).toHaveLength(2)
    const root = versions.find((v) => v.parentId === null)!
    const child = versions.find((v) => v.parentId === root.id)!
    expect(root.recipe.steps).toEqual([])
    expect(child.recipe.steps[0].type).toBe('auto-tag')
    expect(child.recipe.resolved?.tags?.artist).toBe('A')
    // main branch tip is the child (current)
    expect(repo.getBranch(track.activeBranchId)!.tipVersionId).toBe(child.id)
  })
})
