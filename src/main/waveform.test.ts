import { describe, it, expect } from 'vitest'
import { pcmToPeaks, getWaveform, WAVEFORM_BARS, type WaveformDeps } from './waveform'

describe('pcmToPeaks', () => {
  it('returns exactly WAVEFORM_BARS peaks', () => {
    const samples = new Int16Array(1000).fill(1000)
    expect(pcmToPeaks(samples, WAVEFORM_BARS)).toHaveLength(WAVEFORM_BARS)
  })

  it('normalizes the loudest bucket to 1', () => {
    // Two buckets: first quiet, second loud.
    const samples = new Int16Array([100, 100, 16000, 16000])
    const peaks = pcmToPeaks(samples, 2)
    expect(peaks[1]).toBeCloseTo(1, 5)
    expect(peaks[0]).toBeCloseTo(100 / 16000, 5)
  })

  it('returns an all-zero array for silence (no divide-by-zero)', () => {
    const peaks = pcmToPeaks(new Int16Array(64), 8)
    expect(peaks).toHaveLength(8)
    expect(peaks.every((p) => p === 0)).toBe(true)
  })

  it('returns an empty array when there are no samples', () => {
    expect(pcmToPeaks(new Int16Array(0), 8)).toEqual([])
  })
})

function deps(over: Partial<WaveformDeps> = {}): WaveformDeps {
  return {
    cache: { read: () => null, writeWaveform: () => {} },
    decode: async () => ({ samples: new Int16Array([16000, 16000]), sampleRate: 8000 }),
    hashFile: async () => 'HASH',
    ...over
  }
}

describe('getWaveform', () => {
  it('returns the cached waveform without decoding', async () => {
    let decoded = false
    const cached = { peaks: [0.1, 0.2], durationSec: 5 }
    const wf = await getWaveform(
      '/a.mp3',
      'H',
      deps({
        cache: { read: () => ({ waveform: cached }), writeWaveform: () => {} },
        decode: async () => {
          decoded = true
          return { samples: new Int16Array([1]), sampleRate: 8000 }
        }
      })
    )
    expect(wf).toEqual(cached)
    expect(decoded).toBe(false)
  })

  it('decodes, derives duration, and writes to the cache on a miss', async () => {
    const writes: Array<[string, unknown]> = []
    const wf = await getWaveform(
      '/a.mp3',
      'H',
      deps({
        decode: async () => ({ samples: new Int16Array(8000).fill(16000), sampleRate: 8000 }),
        cache: { read: () => null, writeWaveform: (h, w) => writes.push([h, w]) }
      })
    )
    expect(wf?.peaks).toHaveLength(WAVEFORM_BARS)
    expect(wf?.durationSec).toBeCloseTo(1, 5) // 8000 samples / 8000 Hz
    expect(writes).toEqual([['H', wf]])
  })

  it('falls back to hashing the file when no hash is supplied', async () => {
    const writes: string[] = []
    await getWaveform(
      '/a.mp3',
      undefined,
      deps({
        hashFile: async () => 'DERIVED',
        cache: { read: () => null, writeWaveform: (h) => writes.push(h) }
      })
    )
    expect(writes).toEqual(['DERIVED'])
  })

  it('returns null when decoding fails', async () => {
    const wf = await getWaveform('/a.mp3', 'H', deps({ decode: async () => null }))
    expect(wf).toBeNull()
  })
})
