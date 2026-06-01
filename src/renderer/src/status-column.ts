import type { TFunction } from 'i18next'

/** Status keys that render as a text label in the download list (the % states
 *  render a short percent instead, and `done` additionally shows a check icon). */
const STATUS_LABEL_KEYS = ['queued', 'failed', 'skipped'] as const

/**
 * Width of the download status column, sized to the widest localized status
 * label in the active locale (in `ch`, since the column is monospace). Shared
 * by the column header and every row so the labels never overflow — German
 * strings like "IN WARTESCHLANGE" are far longer than the old fixed 64px box —
 * while the meters stay aligned across rows.
 */
export function statusColumnWidth(t: TFunction): string {
  const lengths = [
    ...STATUS_LABEL_KEYS.map((k) => t(`status.${k}`).length),
    t('status.done').length + 3, // check icon + gap ≈ 3ch
    '100%'.length
  ]
  return `${Math.max(...lengths) + 0.5}ch`
}
