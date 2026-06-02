import type { PlaylistEntry } from '../../shared/types'

/** Remove the entry at array position `pos` (returns a new array; never mutates). */
export function removeEntry(entries: PlaylistEntry[], pos: number): PlaylistEntry[] {
  return entries.filter((_, i) => i !== pos)
}

/** Move the entry at `from` to `to` (clamped to bounds), returning a new array. */
export function moveEntry(entries: PlaylistEntry[], from: number, to: number): PlaylistEntry[] {
  if (from === to) return entries
  const next = [...entries]
  const [item] = next.splice(from, 1)
  if (item === undefined) return entries
  const target = Math.max(0, Math.min(to, next.length))
  next.splice(target, 0, item)
  return next
}
