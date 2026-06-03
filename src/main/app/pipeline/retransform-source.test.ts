import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { buildRetransformSource, type RetransformTarget } from './retransform-source'
import type { TrackProgress } from '@shared/types'

const targets: RetransformTarget[] = [
  { entryId: 'e1', index: 0, file: '/m/Songs/a.mp3', title: 'A', videoId: 'va' },
  { entryId: 'e2', index: 3, file: '/m/Other/b.mp3', title: 'B', videoId: 'vb' }
]

const tp = (): TrackProgress => ({
  index: 1,
  title: 'A',
  status: 'transforming',
  percent: 100,
  transformPercent: 0
})

describe('buildRetransformSource', () => {
  it('resolves to a retransform-shaped job titled by count', async () => {
    const src = buildRetransformSource(targets)
    expect(await src.resolve()).toEqual({
      title: 'Re-running transforms · 2 tracks',
      kind: 'video',
      url: ''
    })
  })

  it('singularizes the title for a single target', async () => {
    const src = buildRetransformSource([targets[0]])
    expect((await src.resolve()).title).toBe('Re-running transforms · 1 track')
  })

  it('maps each target to an entry with a unique synthetic index and its own destFolder', () => {
    const entries = buildRetransformSource(targets).entries()
    expect(entries.map((e) => e.index)).toEqual([1, 2])
    expect(entries.map((e) => e.destFolder)).toEqual(['/m/Songs', '/m/Other'])
    expect(entries.map((e) => e.title)).toEqual(['A', 'B'])
    expect(entries.map((e) => e.videoId)).toEqual(['va', 'vb'])
  })

  describe('provide()', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'plucker-retransform-'))
    })
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('yields the existing file when present', async () => {
      const file = join(dir, 'a.mp3')
      writeFileSync(file, 'audio')
      const entry = buildRetransformSource([{ ...targets[0], file }]).entries()[0]
      expect(entry.destFolder).toBe(dirname(file))
      expect(await entry.provide(tp(), () => {})).toEqual({ kind: 'file', file })
    })

    it('fails when the file is gone', async () => {
      const file = join(dir, 'missing.mp3')
      const entry = buildRetransformSource([{ ...targets[0], file }]).entries()[0]
      expect(await entry.provide(tp(), () => {})).toEqual({
        kind: 'failed',
        reason: 'Source file is missing'
      })
    })
  })
})
