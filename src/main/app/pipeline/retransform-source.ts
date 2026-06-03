import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { JobSource, SourceEntry } from './pipeline'

/** One already-downloaded track to re-run the enabled transform chain on. */
export interface RetransformTarget {
  entryId: string
  index: number
  file: string
  title: string
  videoId?: string
}

/**
 * A {@link JobSource} over already-downloaded files. No network, no yt-dlp: each
 * entry's `provide()` just confirms the file is still on disk and hands it to the
 * shared transform/probe/cache core. Synthetic 1-based indices keep the chain's
 * working files (`.plucker-tmp-${index}-…`) unique across targets from different
 * history entries that may share an original playlist index.
 */
export function buildRetransformSource(targets: RetransformTarget[]): JobSource {
  const entries: SourceEntry[] = targets.map((tgt, i) => ({
    index: i + 1,
    title: tgt.title,
    videoId: tgt.videoId,
    destFolder: dirname(tgt.file),
    async provide() {
      if (!existsSync(tgt.file)) return { kind: 'failed', reason: 'Source file is missing' }
      return { kind: 'file', file: tgt.file }
    }
  }))
  return {
    resolve: async () => ({
      title: `Re-running transforms · ${targets.length} track${targets.length === 1 ? '' : 's'}`,
      kind: 'video',
      url: ''
    }),
    entries: () => entries
  }
}

/**
 * A single-file {@link JobSource} for a Library edit: re-runs a chosen chain on one
 * already-materialized blob. The chain output lands in a temp folder (not the user's
 * library folder); main folds it into the content store as a new version. No network.
 */
export function buildEditSource(sourceFile: string, title: string): JobSource {
  const entry: SourceEntry = {
    index: 1,
    title,
    destFolder: join(tmpdir(), 'plucker-edit'),
    async provide() {
      if (!existsSync(sourceFile)) return { kind: 'failed', reason: 'Source file is missing' }
      return { kind: 'file', file: sourceFile }
    }
  }
  return {
    resolve: async () => ({ title: `Editing · ${title}`, kind: 'video', url: '' }),
    entries: () => [entry]
  }
}
