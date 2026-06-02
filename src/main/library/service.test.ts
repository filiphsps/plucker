import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { createLibraryService } from './service'
import type { JobResult } from '../pipeline'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-svc-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function svc() {
  const db = new Database(':memory:'); migrate(db)
  const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
  const events: string[] = []
  const service = createLibraryService({ repo, store, emit: (e) => events.push(e) })
  return { service, repo, store, events }
}
function done(content: string, over: Partial<JobResult> = {}): JobResult {
  const f = join(dir, `${Math.random()}.mp3`); writeFileSync(f, content)
  return { title: 'T', folder: dir, url: 'u', kind: 'video', outcome: 'completed',
    tracks: [{ title: 'T', status: 'done', file: f }], ...over }
}

describe('LibraryService', () => {
  it('ingest emits library:changed and surfaces a CollectionView', () => {
    const { service, events } = svc()
    service.ingestJobResult('j1', done('a'))
    expect(events).toContain('library:changed')
    const views = service.listCollections()
    expect(views[0].tracks).toHaveLength(1)
    expect(views[0].tracks[0].currentVersionId).toBeTruthy()
  })

  it('getTrack returns instance + versions + branches', () => {
    const { service } = svc()
    service.ingestJobResult('j1', done('a'))
    const view = service.listCollections()[0]
    const detail = service.getTrack(view.tracks[0].id)!
    expect(detail.versions).toHaveLength(1)
    expect(detail.branches[0].name).toBe('main')
  })

  it('deleteTrack removes the row, derefs the blob, logs activity, emits change', () => {
    const { service, repo, store, events } = svc()
    service.ingestJobResult('j1', done('a'))
    const view = service.listCollections()[0]
    const versionId = view.tracks[0].currentVersionId
    const hash = repo.getVersion(versionId)!.blobHash!
    events.length = 0
    service.deleteTrack(view.tracks[0].id)
    expect(repo.getBlob(hash)).toBeNull()
    expect(existsSync(store.pathFor(hash))).toBe(false)
    expect(events).toContain('library:changed')
    expect(service.listActivity().some((a) => a.type === 'deleted')).toBe(true)
  })
})
