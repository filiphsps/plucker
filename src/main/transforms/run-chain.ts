// src/main/transforms/run-chain.ts
import { copyFileSync, renameSync, rmSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { TransformInstance } from '../../shared/transforms'
import type { ChainResult, TransformDefinition, TransformServices, TrackContext } from './types'
import { writeTrackTags, readTrackTags } from '../tagger'

/** Flush in-memory tags to disk; ignore failures on non-mp3 / unreadable files. */
function tryFlushTags(file: string, ctx: TrackContext): void {
  try {
    writeTrackTags(file, ctx.tags)
  } catch {
    /* leave file as-is */
  }
}

export async function runTransformChain(
  sourceFile: string,
  destFolder: string,
  info: TrackContext['info'],
  instances: TransformInstance[],
  registry: Map<string, TransformDefinition>,
  services: Omit<TransformServices, 'reportProgress'>,
  onProgress: (fraction: number) => void
): Promise<ChainResult> {
  const working = join(destFolder, `.plucker-tmp-${info.index}-${basename(sourceFile)}`)
  copyFileSync(sourceFile, working)

  let startTags = {}
  try {
    startTags = readTrackTags(working)
  } catch {
    /* non-mp3 in tests */
  }
  const ctx: TrackContext = { workingFile: working, tags: startTags, info }

  const total = instances.length || 1
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]
    const def = registry.get(inst.type)
    if (!def) {
      onProgress((i + 1) / total)
      continue
    }
    const stepServices: TransformServices = {
      ...services,
      reportProgress: (f) => onProgress((i + Math.min(Math.max(f, 0), 1)) / total)
    }
    try {
      await def.run(ctx, { ...def.defaultConfig, ...inst.config }, stepServices)
    } catch (err) {
      if (def.failureMode === 'fatal') {
        if (existsSync(working)) rmSync(working, { force: true })
        return { outputFile: sourceFile, tags: ctx.tags, failed: true, reason: String(err) }
      }
      services.log(`[${inst.type}] skipped: ${String(err)}`)
    }
    onProgress((i + 1) / total)
  }

  // Commit: flush tags, then move the working copy to its final name.
  tryFlushTags(working, ctx)
  const finalBase = ctx.outputName || basename(sourceFile).replace(/\.mp3$/i, '')
  const target = join(destFolder, `${finalBase}.mp3`)
  try {
    renameSync(working, target)
  } catch (err) {
    if (existsSync(working)) rmSync(working, { force: true })
    return { outputFile: sourceFile, tags: ctx.tags, failed: true, reason: String(err) }
  }
  return { outputFile: target, tags: ctx.tags, failed: false }
}
