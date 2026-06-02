import { randomUUID } from 'node:crypto'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { JobResult } from '../pipeline'
import { foldJobResultIntoLibrary } from './ingest'
import type { CollectionView, TrackDetail, ActivityEvent } from '../../shared/library'

export interface LibraryDeps {
  repo: Repo
  store: ContentStore
  /** Push a renderer event (e.g. 'library:changed', 'library:activityChanged'). */
  emit: (event: 'library:changed' | 'library:activityChanged') => void
}

export function createLibraryService(deps: LibraryDeps) {
  const { repo, store, emit } = deps
  const clock = { idGen: () => randomUUID(), now: () => new Date().toISOString() }

  const listCollections = (): CollectionView[] =>
    repo.listCollections().map((c) => ({
      ...c,
      tracks: repo.listTracks(c.id).map((t) => ({
        id: t.id, title: t.title, orderIndex: t.orderIndex,
        currentVersionId: repo.getBranch(t.activeBranchId)!.tipVersionId
      }))
    }))

  const getTrack = (trackId: string): TrackDetail | null => {
    const instance = repo.getTrack(trackId)
    if (!instance) return null
    return { instance, versions: repo.listVersions(trackId), branches: repo.listBranches(trackId) }
  }

  const listActivity = (limit = 200): ActivityEvent[] => repo.listActivity(limit)

  return {
    listCollections,
    getTrack,
    listActivity,

    ingestJobResult(jobId: string, result: JobResult): string {
      const id = foldJobResultIntoLibrary(repo, store, clock, jobId, result)
      emit('library:changed')
      emit('library:activityChanged')
      return id
    },

    deleteTrack(trackId: string): void {
      const t = repo.getTrack(trackId)
      repo.deleteTrack(trackId, store)
      if (t) repo.insertActivity({ id: clock.idGen(), type: 'deleted', ts: clock.now(), summary: `Deleted track “${t.title}”` })
      emit('library:changed'); emit('library:activityChanged')
    },

    deleteCollection(collectionId: string): void {
      const c = repo.getCollection(collectionId)
      repo.deleteCollection(collectionId, store)
      if (c) repo.insertActivity({ id: clock.idGen(), type: 'deleted', ts: clock.now(), summary: `Deleted “${c.title}”` })
      emit('library:changed'); emit('library:activityChanged')
    }
  }
}

export type LibraryService = ReturnType<typeof createLibraryService>
