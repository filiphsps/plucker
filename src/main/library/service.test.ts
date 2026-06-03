import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo, type Repo } from './repo'
import { createContentStore, type ContentStore } from './content-store'
import { createLibraryService, type LibraryService } from './service'
import type { JobResult } from '../pipeline'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-svc-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function svc(): { service: LibraryService; repo: Repo; store: ContentStore; events: string[] } {
  const db = new Database(':memory:')
  migrate(db)
  const repo = createRepo(db)
  const store = createContentStore(join(dir, 'blobs'))
  const events: string[] = []
  const service = createLibraryService({ repo, store, emit: (e) => events.push(e) })
  return { service, repo, store, events }
}
function done(content: string, over: Partial<JobResult> = {}): JobResult {
  const f = join(dir, `${Math.random()}.mp3`)
  writeFileSync(f, content)
  return {
    title: 'T',
    folder: dir,
    url: 'u',
    kind: 'video',
    outcome: 'completed',
    tracks: [{ title: 'T', status: 'done', file: f }],
    ...over
  }
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

  it('listCollections reports versionCount and branchCount per track', () => {
    const { service } = svc()
    service.ingestJobResult('j1', done('a'))
    const tr = service.listCollections()[0].tracks[0]
    expect(tr.versionCount).toBe(1)
    expect(tr.branchCount).toBe(1)
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

  it('edit appends a child version on the active branch tip and advances the tip', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const view = service.listCollections()[0]
    const trackId = view.tracks[0].id
    const before = repo.getTrack(trackId)!
    const tipBefore = repo.getBranch(before.activeBranchId)!.tipVersionId
    // simulate a finished edit job result (one done track)
    const editedFile = join(dir, 'edited.mp3')
    writeFileSync(editedFile, 'edited')
    service.foldEditResult({
      trackId,
      branchId: before.activeBranchId,
      parentVersionId: tipBefore,
      chainSteps: [{ type: 'trim-silence', config: { db: -40 } }],
      result: {
        title: 'T',
        folder: dir,
        url: '',
        kind: 'video',
        outcome: 'completed',
        tracks: [{ title: 'T', status: 'done', file: editedFile, artist: 'A' }]
      }
    })
    const after = repo.listVersions(trackId)
    expect(after).toHaveLength(2)
    const child = after.find((v) => v.parentId === tipBefore)!
    expect(child.recipe.steps[0].type).toBe('trim-silence')
    expect(repo.getBranch(before.activeBranchId)!.tipVersionId).toBe(child.id)
    expect(service.listActivity().some((a) => a.type === 'edited')).toBe(true)
  })

  it('createBranch forks off a node, sets it active; editing then advances only that branch', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const trackId = service.listCollections()[0].tracks[0].id
    const main = repo.getBranch(repo.getTrack(trackId)!.activeBranchId)!
    const rootTip = main.tipVersionId

    const clubId = service.createBranch(trackId, rootTip, 'club edit')
    const track = repo.getTrack(trackId)!
    expect(track.activeBranchId).toBe(clubId) // new branch is active
    expect(repo.getBranch(clubId)!.tipVersionId).toBe(rootTip) // starts at the fork point
    expect(
      repo
        .listBranches(trackId)
        .map((b) => b.name)
        .sort()
    ).toEqual(['club edit', 'main'])
    expect(service.listActivity().some((a) => a.type === 'branched')).toBe(true)
  })

  it('switchBranch changes the active branch and logs activity', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const trackId = service.listCollections()[0].tracks[0].id
    const main = repo.getTrack(trackId)!.activeBranchId
    service.createBranch(trackId, repo.getBranch(main)!.tipVersionId, 'b2')
    service.switchBranch(trackId, main)
    expect(repo.getTrack(trackId)!.activeBranchId).toBe(main)
    expect(service.listActivity().some((a) => a.type === 'switched')).toBe(true)
  })
})
