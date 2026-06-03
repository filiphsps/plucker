// src/main/metadata-fusion.ts
import type { TrackTags, ParsedTitle } from '../shared/types'
import type { SourceMetadata } from './source-metadata'
import type { SourceKind } from './channel-classifier'

export type FieldSource = 'structured' | 'title' | 'channel' | 'none'

export interface FusedField {
  value?: string
  source: FieldSource
  confidence: number
}

export interface FusedTags {
  artist: FusedField
  title: FusedField
  album: FusedField
  year: FusedField
  trackNumber: FusedField
  featured?: string[]
  version?: string
}

export interface FuseOptions {
  useStructuredMetadata: boolean
  channelArtistFallback: 'official-only' | 'always' | 'never'
}

/** How much to trust structured fields / parsed titles for a given source kind. */
const STRUCT_CONF: Record<SourceKind, number> = {
  topic: 0.95,
  vevo: 0.8,
  label: 0.75,
  'official-artist': 0.8,
  generic: 0.6
}
const TITLE_CONF: Record<SourceKind, number> = {
  topic: 0.5,
  vevo: 0.75,
  label: 0.7,
  'official-artist': 0.7,
  generic: 0.6
}

const none = (): FusedField => ({ value: undefined, source: 'none', confidence: 0 })

export function fuseMetadata(
  src: SourceMetadata,
  parsed: ParsedTitle,
  kind: SourceKind,
  opts: FuseOptions
): FusedTags {
  const useStruct = opts.useStructuredMetadata
  const sc = STRUCT_CONF[kind]
  const tc = TITLE_CONF[kind]

  const fromStruct = (v?: string): FusedField | null =>
    useStruct && v ? { value: v, source: 'structured', confidence: sc } : null
  const fromTitle = (v?: string | null): FusedField | null =>
    v ? { value: v, source: 'title', confidence: tc } : null

  const pick = (...cands: (FusedField | null)[]): FusedField =>
    cands.find((c): c is FusedField => c !== null) ?? none()

  // Artist: structured > parsed > channel (gated by fallback policy + kind).
  const allowChannel =
    opts.channelArtistFallback === 'always' ||
    (opts.channelArtistFallback === 'official-only' && kind === 'official-artist')
  const channelArtist: FusedField | null =
    allowChannel && (src.channel || src.uploader)
      ? { value: src.channel ?? src.uploader, source: 'channel', confidence: 0.4 }
      : null

  const artist = pick(
    fromStruct(src.artist ?? src.creator),
    fromTitle(parsed.artist),
    channelArtist
  )
  const title = pick(fromStruct(src.track), fromTitle(parsed.title))
  const album = pick(fromStruct(src.album))
  const year = pick(fromStruct(src.releaseYear))
  const trackNumber = pick(fromStruct(src.trackNumber))

  const fused: FusedTags = { artist, title, album, year, trackNumber }
  if (parsed.featured?.length) fused.featured = parsed.featured
  if (parsed.version) fused.version = parsed.version
  return fused
}

/** Flatten the confidence-scored fields into a plain TrackTags object. */
export function fusedToTags(f: FusedTags): TrackTags {
  const tags: TrackTags = {}
  if (f.artist.value) tags.artist = f.artist.value
  if (f.title.value) tags.title = f.title.value
  if (f.album.value) tags.album = f.album.value
  if (f.year.value) tags.year = f.year.value
  if (f.trackNumber.value) tags.trackNumber = f.trackNumber.value
  return tags
}
