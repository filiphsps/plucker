import type { TrackTags } from '../shared/types'

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/<>:"|?*\\]/g, '')
    .replace(/^[.\s]+/, '')
    .replace(/\s+$/, '')
}

function pad2(track?: string): string {
  if (!track) return ''
  const n = track.split('/')[0].trim()
  return /^\d+$/.test(n) ? String(Number(n)).padStart(2, '0') : n
}

/**
 * Render the filename template, then collapse artifacts left by empty fields:
 * empty "()", doubled separators, dangling " - " / ". " fragments.
 */
export function buildFileName(template: string, tags: TrackTags): string {
  let out = template
    .replaceAll('{artist}', tags.artist ?? '')
    .replaceAll('{track}', pad2(tags.trackNumber))
    .replaceAll('{title}', tags.title ?? '')
    .replaceAll('{album}', tags.album ?? '')
    .replaceAll('{year}', tags.year ?? '')

  out = out
    .replace(/\(\s*\)/g, '') // empty parens
    .replace(/\.\s+(?=-|\.|$)/g, ' ') // dangling "03." when no title follows
    .replace(/\s*-\s*-\s*/g, ' - ') // doubled dashes
    .replace(/^\s*[-.]\s*/, '') // leading separators
    .replace(/\s*[-.]\s*$/, '') // trailing separators
    .replace(/\s{2,}/g, ' ') // collapse spaces
    .replace(/\s+\.\s+/g, ' ') // dangling dot with spaces (missing track)
    .trim()

  return sanitizeFileName(out)
}
