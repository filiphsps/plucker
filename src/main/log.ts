/**
 * Unified main-process logger.
 *
 * Every line is stamped into a {@link LogEntry}, kept in a bounded in-memory ring
 * buffer, mirrored to the console (as `[level] [scope] message`), and fanned out to
 * any registered transports — the file transport and the IPC bridge that drives the
 * developer console overlay both attach this way.
 *
 * Each level accepts a variadic argument list of any type and formats it exactly the
 * way `console.log` does — printf-style specifiers (`%s`, `%d`, `%o`…), objects
 * inspected, `Error`s rendered with their stack — via {@link formatWithOptions}. So
 * `log.error('app', 'update failed:', err)` Just Works without callers hand-rolling
 * `err instanceof Error ? err.message : String(err)` at every site.
 */
import { formatWithOptions } from 'node:util'
import type { LogEntry, LogLevel } from '../shared/types'
import { serializeArgs } from './log-serialize'

export type LogTransport = (entry: LogEntry) => void

const RING_CAP = 1000
const ring: LogEntry[] = []
const transports = new Set<LogTransport>()

/**
 * `console.log`-equivalent formatting for the variadic args. `breakLength: Infinity`
 * keeps inspected objects on a single line so each {@link LogEntry} stays one logical
 * line for the file transport and console overlay (Errors still span their stack).
 */
const INSPECT_OPTIONS = { colors: false, depth: 4, breakLength: Infinity } as const

function format(args: unknown[]): string {
  return formatWithOptions(INSPECT_OPTIONS, ...args)
}

/** Mirror to the matching console method so existing log-capture keeps working. */
function toConsole({ level, scope, message }: LogEntry): void {
  const line = `[${level}] [${scope}] ${message}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else if (level === 'info') console.info(line)
  else console.debug(line)
}

function emit(level: LogLevel, scope: string, args: unknown[]): void {
  const entry: LogEntry = { time: Date.now(), level, scope, message: format(args) }
  const structured = serializeArgs(args)
  if (structured) entry.args = structured
  ring.push(entry)
  if (ring.length > RING_CAP) ring.shift()
  toConsole(entry)
  for (const t of transports) {
    try {
      t(entry)
    } catch {
      // A failing transport (e.g. file write / closed webContents) must never
      // break logging or the caller.
    }
  }
}

export const log = {
  debug: (scope: string, ...args: unknown[]): void => emit('debug', scope, args),
  info: (scope: string, ...args: unknown[]): void => emit('info', scope, args),
  warn: (scope: string, ...args: unknown[]): void => emit('warn', scope, args),
  error: (scope: string, ...args: unknown[]): void => emit('error', scope, args)
}

/**
 * Route otherwise-fatal process events into the logger so an `uncaughtException` or
 * `unhandledRejection` lands in the log file and developer console instead of being
 * lost to a silent crash. Returns a disposer that detaches both handlers.
 *
 * Note: we deliberately do *not* call `process.exit` — Electron keeps the app alive,
 * and the surfaced log entry is what makes the failure diagnosable after the fact.
 */
export function installProcessErrorHandlers(): () => void {
  const onException = (err: unknown): void => log.error('process', 'uncaught exception:', err)
  const onRejection = (reason: unknown): void =>
    log.error('process', 'unhandled rejection:', reason)
  process.on('uncaughtException', onException)
  process.on('unhandledRejection', onRejection)
  return () => {
    process.off('uncaughtException', onException)
    process.off('unhandledRejection', onRejection)
  }
}

/** Register an additional sink; returns an unregister function. */
export function addLogTransport(transport: LogTransport): () => void {
  transports.add(transport)
  return () => transports.delete(transport)
}

/**
 * Re-inject an already-formed entry (e.g. forwarded from a job worker) into the
 * ring buffer and all transports, preserving its original time/level/scope/message
 * instead of re-stamping it as a fresh line.
 */
export function replayLogEntry(entry: LogEntry): void {
  ring.push(entry)
  if (ring.length > RING_CAP) ring.shift()
  toConsole(entry)
  for (const t of transports) {
    try {
      t(entry)
    } catch {
      // A failing transport must never break logging.
    }
  }
}

/** The most recent log entries (oldest → newest), for seeding the console on open. */
export function getLogTail(limit = RING_CAP): LogEntry[] {
  return limit >= ring.length ? [...ring] : ring.slice(ring.length - limit)
}

/** Test helper: drop all non-console transports and clear the ring buffer. */
export function __resetLog(): void {
  transports.clear()
  ring.length = 0
}
