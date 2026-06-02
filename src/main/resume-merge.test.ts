import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { partitionCheckpoint, mergeResumed, synthesizeEntry } from './resume-merge'
import type { JobCheckpoint, HistoryTrack } from '../shared/types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plk-resume-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const cp = (entries: JobCheckpoint['entries']): JobCheckpoint => ({
  jobId: 'j',
  version: 1,
  url: 'http://x',
  folder: dir,
  jobTitle: 'Mix',
  kind: 'playlist',
  startedAt: 1,
  updatedAt: 1,
  total: entries.length,
  entries
})

describe('partitionCheckpoint', () => {
  it('keeps a done track whose file still exists as completed', () => {
    const file = join(dir, 'A.mp3')
    writeFileSync(file, 'x')
    const { completed, pending } = partitionCheckpoint(
      cp([{ index: 1, title: 'A', status: 'done', track: { title: 'A', status: 'done', file } }])
    )
    expect(completed).toHaveLength(1)
    expect(pending).toHaveLength(0)
  })

  it('re-queues a done track whose file was deleted', () => {
    const { completed, pending } = partitionCheckpoint(
      cp([
        {
          index: 1,
          title: 'A',
          status: 'done',
          track: { title: 'A', status: 'done', file: join(dir, 'gone.mp3') }
        }
      ])
    )
    expect(completed).toHaveLength(0)
    expect(pending.map((p) => p.index)).toEqual([1])
  })

  it('treats skipped as completed and queued/failed/cancelled as pending', () => {
    const { completed, pending } = partitionCheckpoint(
      cp([
        { index: 1, title: 'A', status: 'skipped', track: { title: 'A', status: 'skipped' } },
        { index: 2, title: 'B', status: 'queued' },
        { index: 3, title: 'C', status: 'failed' },
        { index: 4, title: 'D', status: 'cancelled' }
      ])
    )
    expect(completed.map((c) => c.index)).toEqual([1])
    expect(pending.map((p) => p.index)).toEqual([2, 3, 4])
  })
})

describe('mergeResumed', () => {
  it('orders completed + resumed tracks by original index', () => {
    const completed = [{ index: 1, track: { title: 'A', status: 'done' } as HistoryTrack }]
    const resumed = [
      { index: 3, track: { title: 'C', status: 'done' } as HistoryTrack },
      { index: 2, track: { title: 'B', status: 'failed' } as HistoryTrack }
    ]
    const merged = mergeResumed(completed, resumed)
    expect(merged.map((t) => t.title)).toEqual(['A', 'B', 'C'])
  })
})

describe('synthesizeEntry', () => {
  it('builds an interrupted history entry carrying the jobId', () => {
    const entry = synthesizeEntry(
      cp([
        { index: 1, title: 'A', status: 'done', track: { title: 'A', status: 'done' } },
        { index: 2, title: 'B', status: 'queued' }
      ]),
      'hist-1',
      '2026-06-02T00:00:00.000Z'
    )
    expect(entry.outcome).toBe('interrupted')
    expect(entry.jobId).toBe('j')
    expect(entry.id).toBe('hist-1')
    // queued (non-terminal) tracks are recorded as cancelled so the row renders.
    expect(entry.tracks.map((t) => t.status)).toEqual(['done', 'cancelled'])
  })
})
