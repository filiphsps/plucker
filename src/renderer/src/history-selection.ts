// Pure helpers for History track selection + bulk actions. Kept out of the
// view component so the selection math stays unit-testable.

/** Stable selection key for the track at `index` within history entry `entryId`. */
export function trackKey(entryId: string, index: number): string {
  return `${entryId}#${index}`
}

/** Parse a track key back into its entry id and index (split on the last `#`). */
export function parseTrackKey(key: string): { entryId: string; index: number } {
  const i = key.lastIndexOf('#')
  return { entryId: key.slice(0, i), index: Number(key.slice(i + 1)) }
}

/**
 * Inclusive range of keys between `anchor` and `key` in `ordered` render order.
 * Falls back to just `[key]` when the anchor is absent or no longer present.
 */
export function rangeBetween(ordered: string[], anchor: string | null, key: string): string[] {
  if (!anchor) return [key]
  const a = ordered.indexOf(anchor)
  const b = ordered.indexOf(key)
  if (a === -1 || b === -1) return [key]
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return ordered.slice(lo, hi + 1)
}

/**
 * Next selection after a click on `key`, given the modifier flags and current
 * state. Returns the new set and the new anchor.
 */
export function selectOnClick(
  current: Set<string>,
  anchor: string | null,
  ordered: string[],
  key: string,
  mods: { shift: boolean; meta: boolean }
): { selected: Set<string>; anchor: string | null } {
  if (mods.shift) {
    return { selected: new Set(rangeBetween(ordered, anchor, key)), anchor: anchor ?? key }
  }
  if (mods.meta) {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return { selected: next, anchor: key }
  }
  return { selected: new Set([key]), anchor: key }
}

/**
 * Targets for a row action: the whole selection when `key` belongs to a
 * multi-selection, otherwise just `[key]`. So acting on a non-selected row
 * affects only that row; acting on a member of a multi-selection affects all.
 */
export function targetsFor(selected: Set<string>, key: string): string[] {
  return selected.has(key) && selected.size > 1 ? [...selected] : [key]
}

/**
 * Group target keys by entry id, each entry's indices sorted descending so
 * sequential removals keep the earlier indices valid as later ones are removed.
 */
export function groupForDelete(keys: string[]): Map<string, number[]> {
  const byEntry = new Map<string, number[]>()
  for (const key of keys) {
    const { entryId, index } = parseTrackKey(key)
    const list = byEntry.get(entryId) ?? []
    list.push(index)
    byEntry.set(entryId, list)
  }
  for (const list of byEntry.values()) list.sort((a, b) => b - a)
  return byEntry
}

/** A track has something to delete on disk only when its file is present and not missing. */
export function isDeletable(file: string | undefined, missing: boolean): boolean {
  return !!file && !missing
}

/**
 * Ids of entries that should start collapsed: multi-track playlists that fall
 * outside the latest `keepOpen` entries (history is newest-first). Single-track
 * entries are never collapsed — there is nothing to fold away.
 */
export function defaultCollapsedIds(
  entries: ReadonlyArray<{ id: string; tracks: ReadonlyArray<unknown> }>,
  keepOpen = 3
): Set<string> {
  return new Set(entries.filter((e, i) => i >= keepOpen && e.tracks.length > 1).map((e) => e.id))
}
