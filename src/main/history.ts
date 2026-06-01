import type { HistoryEntry } from '../shared/types'

export const HISTORY_CAP = 100

/** Prepend a new entry (most-recent-first), capped to HISTORY_CAP. */
export function addEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...history].slice(0, HISTORY_CAP)
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
