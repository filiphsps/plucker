import { mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Repo } from './repo'
import type { TrackTags } from '../../shared/types'
import { sanitizeFileName } from '../rename'

export interface ExportDeps {
  repo: Repo
  /** Ensure a version's blob exists and return its path (recompute if cold). */
  materialize: (versionId: string) => Promise<string>
  /** Compute a base filename (no extension) from resolved tags. */
  buildName: (tags: TrackTags) => string
}

/**
 * One-shot export: for each track, materialize its current (active-branch tip)
 * version and copy it to `destFolder` named by its resolved tags. When
 * `perPlaylistSubfolder` is set, multi-track collections export into a subfolder
 * named after the collection.
 */
export async function exportTracks(
  deps: ExportDeps,
  trackIds: string[],
  destFolder: string,
  opts: { perPlaylistSubfolder: boolean }
): Promise<string[]> {
  const written: string[] = []
  for (const trackId of trackIds) {
    const track = deps.repo.getTrack(trackId)
    if (!track) continue
    const tipVersionId = deps.repo.getBranch(track.activeBranchId)!.tipVersionId
    const version = deps.repo.getVersion(tipVersionId)!
    const tags = version.recipe.resolved?.tags ?? { title: track.title }
    const src = await deps.materialize(tipVersionId)
    const collection = deps.repo.getCollection(track.collectionId)!
    const folder =
      opts.perPlaylistSubfolder && collection.kind !== 'single'
        ? join(destFolder, sanitizeFileName(collection.title))
        : destFolder
    mkdirSync(folder, { recursive: true })
    const base = sanitizeFileName(deps.buildName(tags) || track.title)
    const target = join(folder, `${base}.mp3`)
    copyFileSync(src, target)
    written.push(target)
  }
  return written
}
