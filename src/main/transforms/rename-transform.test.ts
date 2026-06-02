// src/main/transforms/rename-transform.test.ts
import { describe, it, expect } from 'vitest'
import { renameTransform } from './rename'
import { silentTransformLog } from './transform-logger'
import type { TrackContext, TransformServices } from './types'

const services = {
  bin: {} as never,
  fetch,
  log: silentTransformLog,
  reportProgress: () => {}
} as TransformServices

function ctx(tags: TrackContext['tags']): TrackContext {
  return {
    workingFile: '/tmp/x.mp3',
    tags,
    info: { rawTitle: '', sourceFile: '/tmp/x.mp3', index: 1 }
  }
}

describe('renameTransform', () => {
  it('sets outputName from tags via the template', async () => {
    const c = ctx({ artist: 'A', title: 'T', album: 'Alb', year: '2020', trackNumber: '3' })
    await renameTransform.run(
      c,
      { template: '{artist} - {track}. {title} - {album} ({year})' },
      services
    )
    expect(c.outputName).toBe('A - 03. T - Alb (2020)')
  })
  it('leaves outputName undefined when the template renders empty', async () => {
    const c = ctx({})
    await renameTransform.run(c, { template: '{artist}' }, services)
    expect(c.outputName).toBeUndefined()
  })
})
