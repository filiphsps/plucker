/**
 * Minimal leveled logger for the main process.
 *
 * Each line is prefixed with its level and a scope (the subsystem emitting it),
 * e.g. `[info] [pipeline] job start`. Routed to the matching console method so
 * existing log-capture keeps working.
 */
type Level = 'debug' | 'info' | 'warn'

function emit(level: Level, scope: string, message: string): void {
  const line = `[${level}] [${scope}] ${message}`
  if (level === 'warn') console.warn(line)
  else if (level === 'info') console.info(line)
  else console.debug(line)
}

export const log = {
  debug: (scope: string, message: string): void => emit('debug', scope, message),
  info: (scope: string, message: string): void => emit('info', scope, message),
  warn: (scope: string, message: string): void => emit('warn', scope, message)
}
