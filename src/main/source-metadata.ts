// src/main/source-metadata.ts

/** Structured + contextual metadata pulled from a yt-dlp `.info.json`. */
export interface SourceMetadata {
  artist?: string
  track?: string
  album?: string
  releaseYear?: string
  creator?: string
  trackNumber?: string
  uploader?: string
  channel?: string
  description?: string
  categories?: string[]
  durationSec?: number
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return undefined
}

/** Pull the useful subset of a yt-dlp info.json into a typed, tolerant shape. */
export function extractSourceMetadata(info: unknown): SourceMetadata {
  if (!info || typeof info !== 'object') return {}
  const o = info as Record<string, unknown>
  const out: SourceMetadata = {}
  const set = (k: keyof SourceMetadata, v: string | undefined): void => {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v
  }
  set('artist', str(o.artist))
  set('track', str(o.track))
  set('album', str(o.album))
  set('releaseYear', str(o.release_year))
  set('creator', str(o.creator))
  // Genre is intentionally not extracted: we don't carry YouTube's genre into
  // the app's tagging (yt-dlp is also told not to embed it). MusicBrainz remains
  // the only genre source, via the auto-tag transform's `fetchGenre`.
  set('trackNumber', str(o.track_number))
  set('uploader', str(o.uploader))
  set('channel', str(o.channel))
  set('description', str(o.description))
  if (Array.isArray(o.categories)) {
    const cats = o.categories.filter((c): c is string => typeof c === 'string')
    if (cats.length) out.categories = cats
  }
  if (typeof o.duration === 'number' && Number.isFinite(o.duration)) {
    out.durationSec = Math.round(o.duration)
  }
  return out
}
