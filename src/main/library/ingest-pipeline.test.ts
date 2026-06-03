import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runPipeline, type JobSource, type RunJobDeps } from '@app/app/pipeline/pipeline'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { foldJobResultIntoLibrary } from './ingest'

// End-to-end check of the riskiest seam: the real pipeline engine captures the raw
// download + applied chain, and ingest folds that into a two-node version graph.
// Uses a rename-only chain, which is fully binary-free (copy → set name → rename),
// so no yt-dlp/ffmpeg is needed; rename to a literal name guarantees the output
// file differs from the input, which is what triggers raw capture.

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-ingpipe-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function singleFileSource(file: string, destFolder: string): JobSource {
  return {
    resolve: async () => ({ title: 'Solo', kind: 'video', url: 'http://watch' }),
    entries: () => [
      {
        index: 1,
        title: 'Solo',
        destFolder,
        // Provide a stable file outside the per-track scratch dir (which the pipeline
        // reaps right after the download stage).
        async provide() {
          return existsSync(file) ? { kind: 'file', file } : { kind: 'failed', reason: 'missing' }
        }
      }
    ]
  }
}

describe('pipeline raw-capture → two-node ingest (integration)', () => {
  it('captures rawFile + appliedChain through the real pipeline and folds a root+child', async () => {
    const srcFile = join(dir, 'source.mp3')
    writeFileSync(srcFile, 'raw-download-bytes')
    const destFolder = join(dir, 'out')

    const deps: RunJobDeps = {
      bin: { ytdlp: join(dir, 'noop-yt'), ffmpeg: join(dir, 'noop-ff') } as RunJobDeps['bin'],
      settings: {
        ...DEFAULT_SETTINGS,
        transforms: [
          { instanceId: 'r', type: 'rename', enabled: true, config: { template: 'renamed-track' } }
        ]
      },
      homeBase: dir,
      onProgress: () => {}
    }

    const result = await runPipeline(singleFileSource(srcFile, destFolder), deps)

    expect(result.outcome).toBe('completed')
    const t = result.tracks[0]
    expect(t.status).toBe('done')
    expect(t.file?.endsWith('renamed-track.mp3')).toBe(true)
    // The real pipeline moved the raw download out to a temp path and recorded it.
    expect(t.rawFile).toBeTruthy()
    expect(existsSync(t.rawFile!)).toBe(true)
    expect(t.appliedChain).toEqual([{ type: 'rename', config: { template: 'renamed-track' } }])

    // Fold the genuine JobResult into a fresh library.
    const db = new Database(':memory:')
    migrate(db)
    const repo = createRepo(db)
    const store = createContentStore(join(dir, 'blobs'))
    let seq = 0
    foldJobResultIntoLibrary(
      repo,
      store,
      { idGen: () => `id${seq++}`, now: () => '2026-06-02T00:00:00.000Z' },
      'job-int',
      result
    )

    const track = repo.listTracks(repo.listCollections()[0].id)[0]
    const versions = repo.listVersions(track.id)
    expect(versions).toHaveLength(2)
    const root = versions.find((v) => v.parentId === null)!
    const child = versions.find((v) => v.parentId === root.id)!
    expect(root.recipe.steps).toEqual([])
    expect(child.recipe.steps[0].type).toBe('rename')
    expect(repo.getBranch(track.activeBranchId)!.tipVersionId).toBe(child.id)
    // The raw temp file was consumed (ingested into the store, then reclaimed).
    expect(existsSync(t.rawFile!)).toBe(false)
  })
})
