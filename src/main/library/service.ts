import { randomUUID } from 'node:crypto'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { JobResult } from '../pipeline'
import type { TransformInstance } from '../../shared/transforms'
import { foldJobResultIntoLibrary } from './ingest'
import type { CollectionView, TrackDetail, ActivityEvent } from '../../shared/library'

export interface LibraryDeps {
  repo: Repo
  store: ContentStore
  /** Push a renderer event (e.g. 'library:changed', 'library:activityChanged'). */
  emit: (event: 'library:changed' | 'library:activityChanged') => void
  /** Ensure a version's blob exists (recompute if cold); returns its file path. */
  materialize?: (versionId: string) => Promise<string>
  /** Start a libraryEdit job for the chosen chain; the fold happens when it finishes. */
  dispatchEdit?: (payload: {
    trackId: string
    branchId: string
    parentVersionId: string
    sourceFile: string
    chain: TransformInstance[]
  }) => Promise<void>
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
    },

    /** Start an edit job: materialize the branch tip, run `chain`, fold into a child version. */
    async edit(trackId: string, chain: TransformInstance[]): Promise<void> {
      const track = repo.getTrack(trackId)
      if (!track) return
      const branch = repo.getBranch(track.activeBranchId)!
      const sourceFile = await deps.materialize!(branch.tipVersionId)
      await deps.dispatchEdit!({
        trackId, branchId: branch.id, parentVersionId: branch.tipVersionId, sourceFile, chain
      })
      // foldEditResult is called by index.ts when the job completes.
    },

    /** Fold a finished libraryEdit job into a new child version on the branch tip. */
    foldEditResult(args: {
      trackId: string
      branchId: string
      parentVersionId: string
      chainSteps: { type: string; config: Record<string, unknown> }[]
      result: JobResult
    }): void {
      const track = repo.getTrack(args.trackId)
      const finished = args.result.tracks.find((t) => t.status === 'done' && t.file)
      if (!track || !finished?.file) { emit('library:changed'); return }
      const blob = store.put(finished.file)
      const versionId = clock.idGen()
      repo.insertVersion({
        id: versionId, trackId: args.trackId, parentId: args.parentVersionId, blobHash: blob.hash,
        materialized: true, createdAt: clock.now(),
        recipe: {
          steps: args.chainSteps,
          resolved: {
            tags: {
              artist: finished.artist, album: finished.album,
              year: finished.year, title: finished.title
            }
          }
        }
      })
      repo.refBlob(blob, store)
      repo.setBranchTip(args.branchId, versionId)
      repo.insertActivity({
        id: clock.idGen(), type: 'edited', ts: clock.now(), trackId: args.trackId, versionId,
        summary: `Edited “${track.title}”`
      })
      emit('library:changed'); emit('library:activityChanged')
    }
  }
}

export type LibraryService = ReturnType<typeof createLibraryService>
