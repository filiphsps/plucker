import { describe, it, expect } from 'vitest'
import { runPipeline, type JobSource, type RunJobDeps } from './pipeline'
import type { CheckpointEntry } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/defaults'

function fakeSource(): JobSource {
  return {
    resolve: async () => ({ title: 'Mix', kind: 'playlist', url: 'http://list' }),
    entries: () => [
      {
        index: 1,
        title: 'A',
        videoId: 'a',
        destFolder: '/tmp/plk-test-out',
        provide: async () => ({ kind: 'skipped', reason: 'below minimum quality' })
      }
    ]
  }
}

describe('runPipeline checkpoint sink', () => {
  it('calls begin once and settle once when a track goes terminal', async () => {
    const begins: unknown[] = []
    const settles: CheckpointEntry[] = []
    const deps = {
      bin: { ytdlp: 'yt', ffmpeg: 'ff' },
      settings: {
        ...DEFAULT_SETTINGS,
        transforms: [],
        performance: { ...DEFAULT_SETTINGS.performance, parallel: 1 }
      },
      homeBase: '/tmp',
      onProgress: () => {},
      checkpoint: {
        begin: (i: unknown) => begins.push(i),
        settle: (e: CheckpointEntry) => settles.push(e)
      }
    } as unknown as RunJobDeps

    const res = await runPipeline(fakeSource(), deps)
    expect(begins).toHaveLength(1)
    expect(settles).toHaveLength(1)
    expect(settles[0].index).toBe(1)
    expect(settles[0].status).toBe('skipped')
    expect(res.tracks[0].status).toBe('skipped')
  })
})
