// src/main/transforms/run-chain.ts
import { renameSync, rmSync, existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { TransformInstance } from '../../shared/transforms'
import type { ChainResult, TransformDefinition, TransformServices, TrackContext } from './types'
import { writeTrackTags, readTrackTags } from '../tagger'
import { withPrefix } from './transform-logger'

/** Flush in-memory tags to disk; ignore failures on non-mp3 / unreadable files. */
function tryFlushTags(file: string, ctx: TrackContext): void {
  try {
    writeTrackTags(file, ctx.tags)
  } catch {
    /* leave file as-is */
  }
}

/** Human-readable millisecond duration, e.g. "842ms" or "1.2s". */
function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** A compact one-line summary of a transform instance's config for logging. */
function summarizeConfig(config: Record<string, unknown>): string {
  const parts = Object.entries(config)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
  return parts.length ? parts.join(' ') : '(defaults)'
}

export async function runTransformChain(
  sourceFile: string,
  destFolder: string,
  info: TrackContext['info'],
  instances: TransformInstance[],
  registry: Map<string, TransformDefinition>,
  services: Omit<TransformServices, 'reportProgress'>,
  onProgress: (fraction: number) => void,
  /** Report the current activity (transform type, then 'saving') for the ticker. */
  onStage?: (stage: string) => void
): Promise<ChainResult> {
  const working = join(destFolder, `.plucker-tmp-${info.index}-${basename(sourceFile)}`)
  // Async copy (not copyFileSync) so duplicating a large mp3 doesn't block the
  // main process — this runs on the Electron main thread alongside progress IPC.
  await copyFile(sourceFile, working)

  let startTags = {}
  try {
    startTags = readTrackTags(working)
  } catch {
    /* non-mp3 in tests */
  }
  const ctx: TrackContext = { workingFile: working, tags: startTags, info }

  const total = instances.length || 1
  const label = info.rawTitle || basename(sourceFile)
  if (instances.length === 0) {
    services.log.debug(`chain: no transforms enabled for "${label}"`)
  } else {
    services.log.info(
      `chain: running ${instances.length} transform(s) on "${label}" — ${instances
        .map((i) => i.type)
        .join(' → ')}`
    )
  }
  const chainStart = performance.now()

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]
    const def = registry.get(inst.type)
    const step = `${i + 1}/${instances.length}`
    if (!def) {
      services.log.warn(`[${inst.type}] (${step}) unknown transform type — skipped`)
      onProgress((i + 1) / total)
      continue
    }
    const slog = withPrefix(services.log, `[${inst.type}]`)
    onStage?.(inst.type)
    const config = { ...def.defaultConfig, ...inst.config }
    slog.info(`(${step}) start — ${summarizeConfig(config)}`)
    const stepStart = performance.now()
    const stepServices: TransformServices = {
      ...services,
      log: slog,
      reportProgress: (f) => onProgress((i + Math.min(Math.max(f, 0), 1)) / total)
    }
    try {
      await def.run(ctx, config, stepServices)
      slog.info(`(${step}) done in ${fmtMs(performance.now() - stepStart)}`)
    } catch (err) {
      if (def.failureMode === 'fatal') {
        slog.warn(
          `(${step}) FATAL after ${fmtMs(performance.now() - stepStart)} — aborting chain:`,
          err
        )
        if (existsSync(working)) rmSync(working, { force: true })
        return { outputFile: sourceFile, tags: ctx.tags, failed: true, reason: String(err) }
      }
      slog.warn(`(${step}) skipped after ${fmtMs(performance.now() - stepStart)}:`, err)
    }
    onProgress((i + 1) / total)
  }

  // Commit: flush tags, then move the working copy to its final name.
  onStage?.('saving')
  tryFlushTags(working, ctx)
  const finalBase = ctx.outputName || basename(sourceFile).replace(/\.mp3$/i, '')
  const target = join(destFolder, `${finalBase}.mp3`)
  try {
    renameSync(working, target)
  } catch (err) {
    services.log.warn(`commit: failed to write "${finalBase}.mp3":`, err)
    if (existsSync(working)) rmSync(working, { force: true })
    return { outputFile: sourceFile, tags: ctx.tags, failed: true, reason: String(err) }
  }
  if (instances.length > 0) {
    services.log.info(
      `chain: committed "${finalBase}.mp3" in ${fmtMs(performance.now() - chainStart)}`
    )
  }
  return { outputFile: target, tags: ctx.tags, failed: false }
}
