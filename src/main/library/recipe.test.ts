import { describe, it, expect } from 'vitest'
import { buildRecipe, isReplayable } from './recipe'
import type { TransformDefinition } from '../transforms/types'

const reg = new Map<string, TransformDefinition>([
  ['auto-tag', { deterministicGivenInput: false } as TransformDefinition],
  ['trim-silence', { deterministicGivenInput: true } as TransformDefinition],
  ['rename', { deterministicGivenInput: true } as TransformDefinition]
])

describe('recipe helpers', () => {
  it('buildRecipe captures steps + resolved tags/outputName', () => {
    const recipe = buildRecipe(
      [{ instanceId: 'a', type: 'trim-silence', enabled: true, config: { db: -40 } }],
      { outputFile: '/x/Artist - Song.mp3', tags: { artist: 'Artist', title: 'Song' }, failed: false }
    )
    expect(recipe.steps).toEqual([{ type: 'trim-silence', config: { db: -40 } }])
    expect(recipe.resolved?.tags?.artist).toBe('Artist')
    expect(recipe.resolved?.outputName).toBe('Artist - Song')
  })

  it('isReplayable is false when any step is non-deterministic (auto-tag)', () => {
    expect(isReplayable({ steps: [{ type: 'trim-silence', config: {} }] }, reg)).toBe(true)
    expect(isReplayable({ steps: [{ type: 'auto-tag', config: {} }, { type: 'rename', config: {} }] }, reg)).toBe(false)
  })

  it('isReplayable treats unknown transform types as non-replayable', () => {
    expect(isReplayable({ steps: [{ type: 'mystery', config: {} }] }, reg)).toBe(false)
  })
})
