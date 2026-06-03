import { randomUUID } from 'node:crypto'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { JobResult } from '@app/app/pipeline/pipeline'
import type { TransformInstance } from '@shared/transforms'
import type { TrackTags } from '@shared/types'
import { foldJobResultIntoLibrary } from './ingest'
import { exportTracks as exportTracksToFolder } from './export'
import {
  COLLECTION_TITLE_FIELD,
  type CollectionView,
  type TrackDetail,
  type ActivityEvent
} from '@shared/library'
import { resolveVersionBranchTarget } from '@shared/version-branch-target'
import { normalizeFieldValue, validateField } from '@shared/forms/field'

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
  renameCollection: (collectionId: string, title: string) => void
  /** Start an edit job that folds a new child version off `parentVersionId`. */
  createVersion: (
    trackId: string,
    parentVersionId: string,
    chain: TransformInstance[]
  ) => Promise<void>
  foldEditResult: (args: {
    trackId: string
    parentVersionId: string
    chainSteps: { type: string; config: Record<string, unknown> }[]
    result: JobResult
  }) => { ok: boolean; reason?: string }
  createBranch: (trackId: string, fromVersionId: string, name: string) => string
  switchBranch: (trackId: string, branchId: string) => void
  renameBranch: (branchId: string, name: string) => void
  renameVersion: (versionId: string, label: string) => void
  deleteVersion: (versionId: string) => void
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
        currentVersionId: repo.getBranch(t.activeBranchId)!.tipVersionId,
        versionCount: repo.listVersions(t.id).length,
        branchCount: repo.listBranches(t.id).length,
        sourceVideoId: t.sourceVideoId,
        sourceUrl: t.sourceUrl
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

    renameCollection(collectionId: string, title: string): void {
      const c = repo.getCollection(collectionId)
      if (!c) return
      const next = normalizeFieldValue(COLLECTION_TITLE_FIELD, title)
      if (validateField(COLLECTION_TITLE_FIELD, title) || next === c.title) return
      repo.renameCollection(collectionId, next)
      repo.insertActivity({
        id: clock.idGen(),
        type: 'renamed',
        ts: clock.now(),
        collectionId,
        summary: `Renamed “${c.title}” → “${next}”`
      })
      emit('library:changed')
      emit('library:activityChanged')
    },

    /** Start an edit job: materialize `parentVersionId`, run `chain`, fold into a child of it. */
    async createVersion(
      trackId: string,
      parentVersionId: string,
      chain: TransformInstance[]
    ): Promise<void> {
      const track = repo.getTrack(trackId)
      if (!track) return
      const parent = repo.getVersion(parentVersionId)
      if (!parent || parent.trackId !== trackId) return
      const sourceFile = await deps.materialize!(parentVersionId)
      await deps.dispatchEdit!({
        trackId,
        // payload-only; the actual target branch is re-resolved at fold time so a
        // failed job (or a branch switch in between) never leaves a dangling branch.
        branchId: track.activeBranchId,
        parentVersionId,
        sourceFile,
        chain
      })
      // foldEditResult is called by index.ts when the job completes.
    },

    /** Fold a finished libraryEdit job into a new child version off `parentVersionId`. */
    foldEditResult(args: {
      trackId: string
      parentVersionId: string
      chainSteps: { type: string; config: Record<string, unknown> }[]
      result: JobResult
    }): { ok: boolean; reason?: string } {
      const track = repo.getTrack(args.trackId)
      const finished = args.result.tracks.find((t) => t.status === 'done' && t.file)
      if (!track || !finished?.file) {
        // The edit job produced no usable output — surface *why* instead of swallowing it.
        const failed = args.result.tracks.find((t) => t.status === 'failed')
        const reason = failed?.reason ?? failed?.errorCode ?? 'Edit produced no output'
        if (track)
          repo.insertActivity({
            id: clock.idGen(),
            type: 'edited',
            ts: clock.now(),
            trackId: args.trackId,
            summary: `Edit failed: ${reason}`
          })
        emit('library:changed')
        emit('library:activityChanged')
        return { ok: false, reason }
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

      // Land the child on the branch its parent implies: advance the active branch
      // tip, advance+switch a sibling branch's tip, or fork a new branch off an
      // interior version (keeps every leaf reachable as a branch tip).
      const target = resolveVersionBranchTarget(
        repo.listBranches(args.trackId),
        track.activeBranchId,
        args.parentVersionId
      )
      if (target.kind === 'fork') {
        const branchId = clock.idGen()
        repo.insertBranch({
          id: branchId,
          trackId: args.trackId,
          name: target.branchName,
          tipVersionId: versionId
        })
        repo.setActiveBranch(args.trackId, branchId)
        repo.insertActivity({
          id: clock.idGen(),
          type: 'branched',
          ts: clock.now(),
          trackId: args.trackId,
          versionId,
          summary: `Branched “${target.branchName}”`
        })
      } else {
        repo.setBranchTip(target.branchId, versionId)
        if (target.kind === 'switch') {
          repo.setActiveBranch(args.trackId, target.branchId)
          const b = repo.getBranch(target.branchId)
          repo.insertActivity({
            id: clock.idGen(),
            type: 'switched',
            ts: clock.now(),
            trackId: args.trackId,
            summary: `Switched to “${b?.name ?? target.branchId}”`
          })
        }
      }
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
      return { ok: true }
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

    /** Delete a single version unless it is some branch's tip (the UI also hides that). */
    deleteVersion(versionId: string): void {
      const ver = repo.getVersion(versionId)
      if (!ver) return
      const isTip = repo.listBranches(ver.trackId).some((b) => b.tipVersionId === versionId)
      if (isTip) return // refuse: deleting a tip is not allowed here
      repo.deleteVersion(versionId, store)
      repo.insertActivity({
        id: clock.idGen(),
        type: 'deleted',
        ts: clock.now(),
        trackId: ver.trackId,
        versionId,
        summary: `Deleted a version`
      })
      emit('library:changed')
      emit('library:activityChanged')
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
