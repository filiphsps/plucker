import { describe, it, expect, vi } from 'vitest'
import {
  essentiaKeyToString,
  analyzeKeyEssentia,
  analyzeBpmEssentia,
  type EssentiaLike
} from './essentia'

describe('essentiaKeyToString', () => {
  it('returns the bare root for major keys', () => {
    expect(essentiaKeyToString('C', 'major')).toBe('C')
    expect(essentiaKeyToString('F#', 'major')).toBe('F#')
  })

  it('appends m for minor keys', () => {
    expect(essentiaKeyToString('A', 'minor')).toBe('Am')
    expect(essentiaKeyToString('C', 'minor')).toBe('Cm')
  })

  it('normalises flats to the sharp spelling Camelot expects', () => {
    expect(essentiaKeyToString('Bb', 'major')).toBe('A#')
    expect(essentiaKeyToString('Eb', 'minor')).toBe('D#m')
  })
})

function fakeVector(): { delete: ReturnType<typeof vi.fn> } {
  return { delete: vi.fn() }
}

describe('analyzeKeyEssentia', () => {
  it('maps the KeyExtractor result and frees the input vector', () => {
    const input = fakeVector()
    const es = {
      arrayToVector: vi.fn(() => input),
      KeyExtractor: vi.fn(() => ({ key: 'A', scale: 'minor', strength: 0.83 })),
      RhythmExtractor2013: vi.fn()
    } as unknown as EssentiaLike
    const result = analyzeKeyEssentia(es, new Float32Array([0, 1, 0, -1]), 44100)
    expect(result).toEqual({ key: 'Am', strength: 0.83 })
    expect(es.KeyExtractor).toHaveBeenCalledWith(
      input,
      true,
      4096,
      4096,
      12,
      3500,
      60,
      25,
      0.2,
      'edma',
      44100
    )
    expect(input.delete).toHaveBeenCalledOnce()
  })
})

describe('analyzeBpmEssentia', () => {
  it('octave-folds the BPM and frees every vector it gets', () => {
    const input = fakeVector()
    const ticks = fakeVector()
    const estimates = fakeVector()
    const bpmIntervals = fakeVector()
    const es = {
      arrayToVector: vi.fn(() => input),
      KeyExtractor: vi.fn(),
      RhythmExtractor2013: vi.fn(() => ({
        bpm: 256, // out of range -> folds to 128
        confidence: 3.4,
        ticks,
        estimates,
        bpmIntervals
      }))
    } as unknown as EssentiaLike
    const result = analyzeBpmEssentia(es, new Float32Array([0, 1, 0, -1]), {
      minBpm: 70,
      maxBpm: 180
    })
    expect(result).toEqual({ bpm: 128, confidence: 3.4 })
    expect(input.delete).toHaveBeenCalledOnce()
    expect(ticks.delete).toHaveBeenCalledOnce()
    expect(estimates.delete).toHaveBeenCalledOnce()
    expect(bpmIntervals.delete).toHaveBeenCalledOnce()
  })
})
