import type { HistoryEntry, HistoryTrack, JobOutcome } from '../shared/types'

export const HISTORY_CAP = 100

/**
 * Normalize history loaded from disk for backward compatibility: entries written
 * before per-track status / job outcome existed only ever recorded successful
 * downloads, so a missing track `status` defaults to `done` and a missing entry
 * `outcome` is derived from the tracks. Keeps old `~/.plucker.json` files valid
 * without a version bump.
 */
export function normalizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return (raw as HistoryEntry[]).map((e) => {
    const tracks: HistoryTrack[] = (e.tracks ?? []).map((t) => ({
      ...t,
      status: t.status ?? 'done'
    }))
    return { ...e, tracks, outcome: e.outcome ?? deriveOutcome(tracks) }
  })
}

/** Derive a job outcome from recorded track statuses (no cancellation context). */
function deriveOutcome(tracks: HistoryTrack[]): JobOutcome {
  const failed = tracks.filter((t) => t.status === 'failed').length
  const done = tracks.filter((t) => t.status === 'done').length
  if (failed === 0) return 'completed'
  if (done === 0) return 'failed'
  return 'partial'
}

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

/**
 * The on-disk files this entry actually owns — the downloaded track files.
 *
 * Deletion must be keyed on these, never on the entry's destination `folder`:
 * the folder is shared with other jobs (same-url redownloads collapse onto one
 * folder, and every job shares the base folder when per-playlist subfolders are
 * off), so removing the folder would wipe unrelated downloads. A stopped/failed
 * job owns no files, so deleting it is just clearing history.
 */
export function entryFiles(entry: HistoryEntry | undefined): string[] {
  if (!entry) return []
  return entry.tracks.map((t) => t.file).filter((f): f is string => Boolean(f))
}

/**
 * Remove a single track (by its index within the entry) and drop the entry if it
 * becomes empty. Index-based rather than file-based so failed/cancelled tracks —
 * which have no file — can still be removed individually.
 */
export function removeTrack(history: HistoryEntry[], id: string, index: number): HistoryEntry[] {
  return history
    .map((e) => (e.id === id ? { ...e, tracks: e.tracks.filter((_, i) => i !== index) } : e))
    .filter((e) => e.tracks.length > 0)
}

/**
 * Merge a partial patch onto the track at `index` within entry `entryId`.
 * Used when re-running transforms in place: the file may be renamed and the
 * tags refreshed, but the entry and the other tracks are untouched. No-ops on
 * an unknown entry id or out-of-range index. Returns a new array (immutable).
 */
export function updateTrack(
  history: HistoryEntry[],
  entryId: string,
  index: number,
  patch: Partial<HistoryTrack>
): HistoryEntry[] {
  return history.map((e) => {
    if (e.id !== entryId || index < 0 || index >= e.tracks.length) return e
    const tracks = e.tracks.map((t, i) => (i === index ? { ...t, ...patch } : t))
    return { ...e, tracks }
  })
}
