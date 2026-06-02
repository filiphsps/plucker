import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from './schema'
import { createRepo, type Repo } from './repo'

function freshRepo(): Repo {
  const db = new Database(':memory:')
  migrate(db)
  return createRepo(db)
}

describe('repo — basic CRUD & reads', () => {
  it('inserts a collection and reads it back', () => {
    const repo = freshRepo()
    repo.insertCollection({
      id: 'c1',
      kind: 'playlist',
      title: 'Mix',
      sourceUrl: 'u',
      createdAt: 't'
    })
    expect(repo.getCollection('c1')?.title).toBe('Mix')
    expect(repo.listCollections().map((c) => c.id)).toEqual(['c1'])
  })

  it('round-trips a version recipe through JSON', () => {
    const repo = freshRepo()
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
      blobHash: null,
      recipe: {
        steps: [{ type: 'auto-tag', config: { lang: 'en' } }],
        resolved: { tags: { artist: 'A' } }
      },
      materialized: false,
      createdAt: 't'
    })
    const ver = repo.getVersion('v1')!
    expect(ver.recipe.resolved?.tags?.artist).toBe('A')
    expect(ver.recipe.steps[0].type).toBe('auto-tag')
    expect(ver.materialized).toBe(false)
  })

  it('lists versions and branches for a track', () => {
    const repo = freshRepo()
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
      blobHash: null,
      recipe: { steps: [] },
      materialized: false,
      createdAt: 't'
    })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })
    expect(repo.listVersions('t1').map((ver) => ver.id)).toEqual(['v1'])
    expect(repo.listBranches('t1').map((b) => b.name)).toEqual(['main'])
  })
})
