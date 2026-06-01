import type { HistoryEntry } from '../shared/types'

export const HISTORY_CAP = 100

/**
 * Record a completed job (most-recent-first), capped to HISTORY_CAP.
 *
 * If an entry for the same source url + destination folder already exists (a
 * redownload), it is refreshed in place — its content is replaced with the new
 * data while preserving the original id — and bumped to the top, rather than
 * adding a duplicate.
 */
export function addEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const existing = history.find((e) => e.url === entry.url && e.folder === entry.folder)
  const merged = existing ? { ...entry, id: existing.id } : entry
  const rest = existing ? history.filter((e) => e.id !== existing.id) : history
  return [merged, ...rest].slice(0, HISTORY_CAP)
}

/** Remove an entry by id. */
export function removeEntry(history: HistoryEntry[], id: string): HistoryEntry[] {
  return history.filter((e) => e.id !== id)
}

/** Remove a single track (by file path) from an entry; drop the entry if it becomes empty. */
export function removeTrack(history: HistoryEntry[], id: string, file: string): HistoryEntry[] {
  return history
    .map((e) => (e.id === id ? { ...e, tracks: e.tracks.filter((t) => t.file !== file) } : e))
    .filter((e) => e.tracks.length > 0)
}
