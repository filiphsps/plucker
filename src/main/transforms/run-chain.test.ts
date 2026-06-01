// src/main/transforms/run-chain.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runTransformChain } from './run-chain'
import type { TransformDefinition } from './types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-chain-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const services = { bin: {} as never, fetch, log: () => {}, reportProgress: () => {} }

// A transform that sets outputName, and one that throws.
const renamer: TransformDefinition = {
  type: 'r',
  apiVersion: 1,
  labelKey: '',
  descriptionKey: '',
  allowMultiple: true,
  failureMode: 'skip',
  configSchema: [],
  defaultConfig: {},
  async run(ctx) {
    ctx.outputName = 'Final Name'
  }
}
const fatalBoom: TransformDefinition = {
  type: 'boom',
  apiVersion: 1,
  labelKey: '',
  descriptionKey: '',
  allowMultiple: true,
  failureMode: 'fatal',
  configSchema: [],
  defaultConfig: {},
  async run() {
    throw new Error('boom')
  }
}
const skipBoom: TransformDefinition = { ...fatalBoom, type: 'skipboom', failureMode: 'skip' }

describe('runTransformChain', () => {
  it('commits the working copy under the rename output name', async () => {
    const src = join(dir, 'orig.mp3')
    writeFileSync(src, 'AUDIO')
    const registry = new Map([['r', renamer]])
    const res = await runTransformChain(
      src,
      dir,
      { rawTitle: 'orig', sourceFile: src, index: 1 },
      [{ instanceId: 'i1', type: 'r', enabled: true, config: {} }],
      registry,
      services,
      () => {}
    )
    expect(res.failed).toBe(false)
    expect(res.outputFile).toBe(join(dir, 'Final Name.mp3'))
    expect(existsSync(res.outputFile)).toBe(true)
    expect(readdirSync(dir).some((f) => f.startsWith('.plucker-tmp'))).toBe(false)
  })

  it('fatal failure discards temp and keeps the pristine source', async () => {
    const src = join(dir, 'orig.mp3')
    writeFileSync(src, 'AUDIO')
    const registry = new Map([['boom', fatalBoom]])
    const res = await runTransformChain(
      src,
      dir,
      { rawTitle: 'orig', sourceFile: src, index: 1 },
      [{ instanceId: 'i1', type: 'boom', enabled: true, config: {} }],
      registry,
      services,
      () => {}
    )
    expect(res.failed).toBe(true)
    expect(existsSync(src)).toBe(true)
    expect(readdirSync(dir).some((f) => f.startsWith('.plucker-tmp'))).toBe(false)
  })

  it('skip failure continues the chain and still commits', async () => {
    const src = join(dir, 'orig.mp3')
    writeFileSync(src, 'AUDIO')
    const registry = new Map([
      ['skipboom', skipBoom],
      ['r', renamer]
    ])
    const res = await runTransformChain(
      src,
      dir,
      { rawTitle: 'orig', sourceFile: src, index: 1 },
      [
        { instanceId: 'i1', type: 'skipboom', enabled: true, config: {} },
        { instanceId: 'i2', type: 'r', enabled: true, config: {} }
      ],
      registry,
      services,
      () => {}
    )
    expect(res.failed).toBe(false)
    expect(res.outputFile).toBe(join(dir, 'Final Name.mp3'))
  })
})
