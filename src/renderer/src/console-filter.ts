import type { LogEntry, LogLevel } from '../../shared/types'

/** Distinct scopes present in the entries, sorted — drives the scope filter chips. */
export function logScopes(entries: LogEntry[]): string[] {
  const seen = new Set<string>()
  for (const e of entries) seen.add(e.scope)
  return [...seen].sort()
}

/** Keep entries whose level and scope are not toggled off. */
export function filterEntries(
  entries: LogEntry[],
  levelsOff: Set<LogLevel>,
  scopesOff: Set<string>
): LogEntry[] {
  return entries.filter((e) => !levelsOff.has(e.level) && !scopesOff.has(e.scope))
}
