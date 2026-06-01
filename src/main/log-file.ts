/**
 * File transport for the unified logger: appends each line to `~/.plucker/plucker.log`,
 * rotating to a single `.1` backup once the file passes a size cap (so the on-disk log
 * never grows without bound). Write/rotate failures are swallowed — logging must never
 * crash the app.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LogEntry } from '../shared/types'
import type { LogTransport } from './log'

/** 5 MB per file → ~10 MB on disk with the single rotated backup. */
export const DEFAULT_MAX_LOG_BYTES = 5 * 1024 * 1024

/** Pure rotation decision, extracted for testing. */
export function shouldRotate(sizeBytes: number, maxBytes: number): boolean {
  return sizeBytes > maxBytes
}

function formatLine(e: LogEntry): string {
  return `${new Date(e.time).toISOString()} [${e.level}] [${e.scope}] ${e.message}\n`
}

/**
 * Build a log transport that appends to `filePath`, rotating to `filePath.1` when the
 * current file exceeds `maxBytes`. Tracks size in memory to avoid stat-ing every line.
 */
export function createFileTransport(
  filePath: string,
  maxBytes = DEFAULT_MAX_LOG_BYTES
): LogTransport {
  mkdirSync(dirname(filePath), { recursive: true })
  let size = existsSync(filePath) ? statSync(filePath).size : 0
  return (entry: LogEntry): void => {
    const line = formatLine(entry)
    if (shouldRotate(size, maxBytes)) {
      try {
        renameSync(filePath, `${filePath}.1`)
      } catch {
        // best-effort rotation
      }
      size = 0
    }
    appendFileSync(filePath, line)
    size += Buffer.byteLength(line)
  }
}
