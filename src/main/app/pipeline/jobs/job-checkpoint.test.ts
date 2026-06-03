import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  upsertEntries,
  settleEntry,
  writeCheckpoint,
  readCheckpoint,
  listCheckpoints,
  deleteCheckpoint,
  dismissCheckpoint
} from './job-checkpoint'
import type { JobCheckpoint } from '@shared/types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plk-jobs-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const base = (over: Partial<JobCheckpoint> = {}): JobCheckpoint => ({
  jobId: 'job1',
  version: 1,
  url: 'http://x',
  folder: '/out',
  jobTitle: 'Mix',
  kind: 'playlist',
  startedAt: 1,
  updatedAt: 1,
  total: 2,
  entries: [
    { index: 1, videoId: 'a', title: 'A', status: 'queued' },
    { index: 2, videoId: 'b', title: 'B', status: 'queued' }
  ],
  ...over
})

describe('checkpoint store', () => {
  it('writes and reads a checkpoint round-trip', () => {
    writeCheckpoint(dir, base(), 5)
    const got = readCheckpoint(join(dir, 'job1.json'))
    expect(got?.jobId).toBe('job1')
    expect(got?.updatedAt).toBe(5)
    expect(got?.entries).toHaveLength(2)
  })

  it('lists every checkpoint file and tolerates a corrupt one', () => {
    writeCheckpoint(dir, base(), 1)
    writeCheckpoint(dir, base({ jobId: 'job2' }), 1)
    writeFileSync(join(dir, 'job3.json'), '{not json')
    const all = listCheckpoints(dir)
    expect(all.map((c) => c.jobId).sort()).toEqual(['job1', 'job2'])
  })

  it('deletes a checkpoint file', () => {
    writeCheckpoint(dir, base(), 1)
    deleteCheckpoint(dir, 'job1')
    expect(existsSync(join(dir, 'job1.json'))).toBe(false)
  })

  it('dismiss flags the checkpoint without deleting it, preserving entries', () => {
    writeCheckpoint(dir, base(), 1)
    dismissCheckpoint(dir, 'job1', 7)
    const got = readCheckpoint(join(dir, 'job1.json'))
    expect(got?.dismissed).toBe(true)
    expect(got?.updatedAt).toBe(7)
    expect(got?.entries).toHaveLength(2) // still resumable from History
  })

  it('dismiss is a no-op when the checkpoint is absent', () => {
    expect(() => dismissCheckpoint(dir, 'missing', 7)).not.toThrow()
    expect(existsSync(join(dir, 'missing.json'))).toBe(false)
  })

  it('upsertEntries merges by index without dropping existing completed entries', () => {
    const cp = base()
    cp.entries[0] = { index: 1, videoId: 'a', title: 'A', status: 'done' }
    const merged = upsertEntries(cp.entries, [
      { index: 2, videoId: 'b', title: 'B (resumed)', status: 'queued' },
      { index: 3, videoId: 'c', title: 'C', status: 'queued' }
    ])
    expect(merged.find((e) => e.index === 1)?.status).toBe('done')
    expect(merged.find((e) => e.index === 2)?.title).toBe('B (resumed)')
    expect(merged.find((e) => e.index === 3)).toBeTruthy()
  })

  it('settleEntry patches one entry status + track by index', () => {
    const entries = base().entries
    const next = settleEntry(entries, {
      index: 2,
      videoId: 'b',
      title: 'B',
      status: 'done',
      track: { title: 'B', status: 'done', file: '/out/B.mp3' }
    })
    expect(next.find((e) => e.index === 2)?.status).toBe('done')
    expect(next.find((e) => e.index === 2)?.track?.file).toBe('/out/B.mp3')
    expect(next.find((e) => e.index === 1)?.status).toBe('queued')
  })
})
