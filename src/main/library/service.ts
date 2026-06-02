import { randomUUID } from 'node:crypto'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { JobResult } from '../pipeline'
import type { TransformInstance } from '../../shared/transforms'
import type { TrackTags } from '../../shared/types'
import { foldJobResultIntoLibrary } from './ingest'
import { exportTracks as exportTracksToFolder } from './export'
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
  /** Compute an export filename (no extension) from a version's resolved tags. */
  buildName?: (tags: TrackTags) => string
  /** Whether multi-track collections export into a per-collection subfolder. */
  perPlaylistSubfolder?: () => boolean
}

export interface LibraryService {
  listCollections: () => CollectionView[]
  getTrack: (trackId: string) => TrackDetail | null
  listActivity: (limit?: number) => ActivityEvent[]
  ingestJobResult: (jobId: string, result: JobResult) => string
  deleteTrack: (trackId: string) => void
  deleteCollection: (collectionId: string) => void
  edit: (trackId: string, chain: TransformInstance[]) => Promise<void>
  foldEditResult: (args: {
    trackId: string
    branchId: string
    parentVersionId: string
    chainSteps: { type: string; config: Record<string, unknown> }[]
    result: JobResult
  }) => void
  createBranch: (trackId: string, fromVersionId: string, name: string) => string
  switchBranch: (trackId: string, branchId: string) => void
  renameBranch: (branchId: string, name: string) => void
  renameVersion: (versionId: string, label: string) => void
  exportTracks: (trackIds: string[], destFolder: string) => Promise<string[]>
}

export function createLibraryService(deps: LibraryDeps): LibraryService {
  const { repo, store, emit } = deps
  const clock = { idGen: () => randomUUID(), now: () => new Date().toISOString() }

  const listCollections = (): CollectionView[] =>
    repo.listCollections().map((c) => ({
      ...c,
      tracks: repo.listTracks(c.id).map((t) => ({
        id: t.id,
        title: t.title,
        orderIndex: t.orderIndex,
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
      if (t)
        repo.insertActivity({
          id: clock.idGen(),
          type: 'deleted',
          ts: clock.now(),
          summary: `Deleted track “${t.title}”`
        })
      emit('library:changed')
      emit('library:activityChanged')
    },

    deleteCollection(collectionId: string): void {
      const c = repo.getCollection(collectionId)
      repo.deleteCollection(collectionId, store)
      if (c)
        repo.insertActivity({
          id: clock.idGen(),
          type: 'deleted',
          ts: clock.now(),
          summary: `Deleted “${c.title}”`
        })
      emit('library:changed')
      emit('library:activityChanged')
    },

    /** Start an edit job: materialize the branch tip, run `chain`, fold into a child version. */
    async edit(trackId: string, chain: TransformInstance[]): Promise<void> {
      const track = repo.getTrack(trackId)
      if (!track) return
      const branch = repo.getBranch(track.activeBranchId)!
      const sourceFile = await deps.materialize!(branch.tipVersionId)
      await deps.dispatchEdit!({
        trackId,
        branchId: branch.id,
        parentVersionId: branch.tipVersionId,
        sourceFile,
        chain
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
      if (!track || !finished?.file) {
        emit('library:changed')
        return
      }
      const blob = store.put(finished.file)
      const versionId = clock.idGen()
      repo.insertVersion({
        id: versionId,
        trackId: args.trackId,
        parentId: args.parentVersionId,
        blobHash: blob.hash,
        materialized: true,
        createdAt: clock.now(),
        recipe: {
          steps: args.chainSteps,
          resolved: {
            tags: {
              artist: finished.artist,
              album: finished.album,
              year: finished.year,
              title: finished.title
            }
          }
        }
      })
      repo.refBlob(blob, store)
      repo.setBranchTip(args.branchId, versionId)
      repo.insertActivity({
        id: clock.idGen(),
        type: 'edited',
        ts: clock.now(),
        trackId: args.trackId,
        versionId,
        summary: `Edited “${track.title}”`
      })
      emit('library:changed')
      emit('library:activityChanged')
    },

    /** Fork a new named branch off any version and make it active. Returns its id. */
    createBranch(trackId: string, fromVersionId: string, name: string): string {
      const branchId = clock.idGen()
      repo.insertBranch({ id: branchId, trackId, name, tipVersionId: fromVersionId })
      repo.setActiveBranch(trackId, branchId)
      repo.insertActivity({
        id: clock.idGen(),
        type: 'branched',
        ts: clock.now(),
        trackId,
        summary: `Branched “${name}”`
      })
      emit('library:changed')
      emit('library:activityChanged')
      return branchId
    },
    /** Make another branch active for a track. */
    switchBranch(trackId: string, branchId: string): void {
      repo.setActiveBranch(trackId, branchId)
      const b = repo.getBranch(branchId)
      repo.insertActivity({
        id: clock.idGen(),
        type: 'switched',
        ts: clock.now(),
        trackId,
        summary: `Switched to “${b?.name ?? branchId}”`
      })
      emit('library:changed')
      emit('library:activityChanged')
    },
    renameBranch(branchId: string, name: string): void {
      repo.setBranchName(branchId, name)
      emit('library:changed')
    },
    renameVersion(versionId: string, label: string): void {
      repo.setVersionLabel(versionId, label)
      emit('library:changed')
    },

    /** Materialize each track's current version and copy it to `destFolder`. */
    async exportTracks(trackIds: string[], destFolder: string): Promise<string[]> {
      const written = await exportTracksToFolder(
        { repo, materialize: deps.materialize!, buildName: deps.buildName! },
        trackIds,
        destFolder,
        { perPlaylistSubfolder: deps.perPlaylistSubfolder?.() ?? false }
      )
      repo.insertActivity({
        id: clock.idGen(),
        type: 'exported',
        ts: clock.now(),
        summary: `Exported ${written.length} track${written.length === 1 ? '' : 's'} to ${destFolder}`
      })
      emit('library:activityChanged')
      return written
    }
  }
}
