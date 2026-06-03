import { rmSync } from 'node:fs'
import type { JobResult } from '@app/app/pipeline/pipeline'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { CollectionKind } from '@shared/library'

export interface IngestClock {
  idGen: () => string
  now: () => string
}

/**
 * Fold a finished download/resume JobResult into the Library. Each successfully
 * downloaded track becomes a collection-owned TrackInstance with a single root
 * Version (the finished file ingested as a blob) on a `main` branch. The blob is
 * refcounted so a later delete of one instance never destroys a shared file.
 *
 * Phase-2 shape: one version per track. Phase 4 (Task 18) replaces this with a
 * raw-root + default-chain-child pair.
 */
export function foldJobResultIntoLibrary(
  repo: Repo,
  store: ContentStore,
  clock: IngestClock,
  _jobId: string,
  result: JobResult
): string {
  const kind: CollectionKind = result.kind === 'playlist' ? 'playlist' : 'single'
  const collectionId = clock.idGen()
  repo.insertCollection({
    id: collectionId,
    kind,
    title: result.title,
    sourceUrl: result.url,
    createdAt: clock.now()
  })

  let order = 0
  for (const t of result.tracks) {
    if (t.status !== 'done' || !t.file) continue
    order += 1
    const trackId = clock.idGen()
    const branchId = clock.idGen()
    const finalBlob = store.put(t.file)

    if (t.rawFile && t.appliedChain && t.appliedChain.length > 0) {
      const rootBlob = store.put(t.rawFile)
      const rootId = clock.idGen()
      const childId = clock.idGen()
      repo.insertTrack({
        id: trackId,
        collectionId,
        sourceVideoId: t.videoId,
        sourceUrl: result.url,
        sourceAudioHash: t.hash,
        orderIndex: order,
        title: t.title,
        activeBranchId: branchId
      })
      repo.insertVersion({
        id: rootId,
        trackId,
        parentId: null,
        blobHash: rootBlob.hash,
        recipe: { steps: [] },
        materialized: true,
        createdAt: clock.now()
      })
      repo.insertVersion({
        id: childId,
        trackId,
        parentId: rootId,
        blobHash: finalBlob.hash,
        materialized: true,
        createdAt: clock.now(),
        recipe: {
          steps: t.appliedChain,
          resolved: {
            tags: { artist: t.artist, album: t.album, year: t.year, title: t.title },
            outputName: undefined
          }
        }
      })
      repo.insertBranch({ id: branchId, trackId, name: 'main', tipVersionId: childId })
      repo.refBlob(rootBlob, store)
      repo.refBlob(finalBlob, store)
      // The raw file is a throwaway temp the worker preserved only for this capture;
      // its bytes now live in the content store, so reclaim the temp.
      rmSync(t.rawFile, { force: true })
    } else {
      // fallback: single root version (no raw captured)
      const versionId = clock.idGen()
      repo.insertTrack({
        id: trackId,
        collectionId,
        sourceVideoId: t.videoId,
        sourceUrl: result.url,
        sourceAudioHash: t.hash,
        orderIndex: order,
        title: t.title,
        activeBranchId: branchId
      })
      repo.insertVersion({
        id: versionId,
        trackId,
        parentId: null,
        blobHash: finalBlob.hash,
        recipe: { steps: [] },
        materialized: true,
        createdAt: clock.now()
      })
      repo.insertBranch({ id: branchId, trackId, name: 'main', tipVersionId: versionId })
      repo.refBlob(finalBlob, store)
    }
  }

  repo.insertActivity({
    id: clock.idGen(),
    type: 'ingested',
    ts: clock.now(),
    collectionId,
    summary: `Downloaded “${result.title}” (${order} track${order === 1 ? '' : 's'})`
  })
  return collectionId
}
