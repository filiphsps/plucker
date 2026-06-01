/**
 * Unified main-process logger.
 *
 * Every line is stamped into a {@link LogEntry}, kept in a bounded in-memory ring
 * buffer, mirrored to the console (as `[level] [scope] message`), and fanned out to
 * any registered transports — the file transport and the IPC bridge that drives the
 * developer console overlay both attach this way.
 */
import type { LogEntry, LogLevel } from '../shared/types'

export type LogTransport = (entry: LogEntry) => void

const RING_CAP = 1000
const ring: LogEntry[] = []
const transports = new Set<LogTransport>()

/** Mirror to the matching console method so existing log-capture keeps working. */
function toConsole({ level, scope, message }: LogEntry): void {
  const line = `[${level}] [${scope}] ${message}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else if (level === 'info') console.info(line)
  else console.debug(line)
}

function emit(level: LogLevel, scope: string, message: string): void {
  const entry: LogEntry = { time: Date.now(), level, scope, message }
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
  debug: (scope: string, message: string): void => emit('debug', scope, message),
  info: (scope: string, message: string): void => emit('info', scope, message),
  warn: (scope: string, message: string): void => emit('warn', scope, message),
  error: (scope: string, message: string): void => emit('error', scope, message)
}

/** Register an additional sink; returns an unregister function. */
export function addLogTransport(transport: LogTransport): () => void {
  transports.add(transport)
  return () => transports.delete(transport)
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
