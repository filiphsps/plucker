import type { ParsedTitle } from '../shared/types'

/** Remove trailing "(...)" / "[...]" noise like "(Official Video)". */
function stripNoise(s: string): string {
  return s.replace(/\s*[([].*$/, '').trim()
}

export function parseTitle(ytTitle: string): ParsedTitle {
  const t = ytTitle.trim()
  const idx = t.indexOf(' - ')
  if (idx === -1) {
    return { artist: null, title: stripNoise(t) }
  }
  const artist = t.slice(0, idx).trim()
  const title = stripNoise(t.slice(idx + 3))
  return { artist: artist || null, title }
}
