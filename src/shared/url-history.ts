/**
 * Pure helpers for the persisted list of past download URLs (`Settings.urlHistory`).
 * The list is most-recent-first, deduped, and intentionally uncapped.
 */

/** Add `url` to the front, removing any existing copy so it moves to the top. No-op for blanks. */
export function addUrl(list: string[], url: string): string[] {
  const value = url.trim()
  if (!value) return [...list]
  return [value, ...list.filter((u) => u !== value)]
}

/** Remove `url` from the list (trimmed match). Returns a new array. */
export function removeUrl(list: string[], url: string): string[] {
  const value = url.trim()
  return list.filter((u) => u !== value)
}
