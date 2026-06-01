// src/main/transforms/auto-tag.ts
import type { TrackTags } from '../../shared/types'
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import { parseTitle } from '../title-parser'
import { selectBestMatch } from '../mb-select'
import { MusicBrainzClient } from '../musicbrainz'
import { readTrackTags, embedCover } from '../tagger'
import { timed } from '../bench'
import { log } from '../log'

export interface AutoTagConfig {
  primarySource: 'youtube' | 'musicbrainz'
  enrichWithMusicBrainz: boolean
  fetchCoverArt: boolean
  fetchGenre: boolean
  fetchTrackNumber: boolean
  minMatchScore: number
}

/** App identifier sent in the MusicBrainz User-Agent (per their API etiquette). */
const MUSICBRAINZ_CONTACT = 'Plucker desktop app'

/** Primary source wins; secondary only fills gaps. */
export function mergeTags(
  yt: TrackTags,
  mb: TrackTags,
  primarySource: 'youtube' | 'musicbrainz'
): TrackTags {
  const primary = primarySource === 'youtube' ? yt : mb
  const secondary = primarySource === 'youtube' ? mb : yt
  const pick = (k: keyof TrackTags): string | undefined => primary[k] || secondary[k]
  return {
    artist: pick('artist'),
    title: pick('title'),
    album: pick('album'),
    date: pick('date'),
    year: pick('year'),
    trackNumber: pick('trackNumber'),
    genre: pick('genre')
  }
}

/** Look up MusicBrainz and return the enrichment tags + optional cover bytes. */
export async function enrich(
  ytNorm: TrackTags,
  config: AutoTagConfig,
  services: Pick<TransformServices, 'fetch' | 'log' | 'reportProgress'>
): Promise<{ tags: TrackTags; cover?: Buffer }> {
  if (!config.enrichWithMusicBrainz) return { tags: {} }
  const mb = new MusicBrainzClient(MUSICBRAINZ_CONTACT, { fetchImpl: services.fetch })
  const search = await mb.searchRecording(ytNorm.artist ?? null, ytNorm.title ?? '')
  const match = selectBestMatch(search, config.minMatchScore)
  if (!match) return { tags: {} }
  const tags: TrackTags = {
    artist: match.artist ?? undefined,
    title: match.title,
    album: match.album ?? undefined,
    date: match.date ?? undefined,
    year: match.year ?? undefined
  }
  if (config.fetchTrackNumber && match.releaseId) {
    tags.trackNumber = (await mb.getTrackNumber(match.releaseId, match.recordingId)) ?? undefined
  }
  if (config.fetchGenre && match.releaseGroupId) {
    tags.genre = (await mb.getReleaseGroupGenre(match.releaseGroupId)) ?? undefined
  }
  let cover: Buffer | undefined
  if (config.fetchCoverArt && match.releaseId) {
    try {
      const res = await services.fetch(
        `https://coverartarchive.org/release/${match.releaseId}/front-500`
      )
      if (res.ok) cover = Buffer.from(await res.arrayBuffer())
    } catch {
      /* keep embedded youtube thumbnail */
    }
  }
  services.reportProgress(0.9)
  return { tags, cover }
}

/**
 * Cache-first wrapper around {@link enrich}: on a content-hash hit, reuse the
 * stored MusicBrainz tags + cover and skip the network entirely; on a miss, run
 * enrich and persist the result for next time.
 */
export async function resolveAutoTag(
  ytNorm: TrackTags,
  config: AutoTagConfig,
  services: Pick<TransformServices, 'fetch' | 'log' | 'reportProgress' | 'cache'>,
  hash: string | undefined
): Promise<{ tags: TrackTags; cover?: Buffer }> {
  if (hash && services.cache) {
    const cached = services.cache.read(hash)
    if (cached?.mb) {
      log.debug('transform', `cache hit — skipping MusicBrainz lookup (${hash})`)
      services.reportProgress(0.9)
      return { tags: cached.mb, cover: services.cache.readCover(hash) ?? undefined }
    }
  }
  log.debug(
    'transform',
    `MusicBrainz lookup for "${ytNorm.artist ?? '?'} – ${ytNorm.title ?? '?'}"`
  )
  const result = await timed('auto-tag-enrich', 'transform', () => enrich(ytNorm, config, services))
  if (hash && services.cache) services.cache.writeAutoTag(hash, result.tags, result.cover)
  return result
}

const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: 'primarySource',
    labelKey: 'transforms.autoTag.fields.primarySource',
    type: 'enum',
    default: 'youtube',
    options: [
      { value: 'youtube', labelKey: 'transforms.autoTag.options.youtube' },
      { value: 'musicbrainz', labelKey: 'transforms.autoTag.options.musicbrainz' }
    ]
  },
  {
    key: 'enrichWithMusicBrainz',
    labelKey: 'transforms.autoTag.fields.enrich',
    type: 'boolean',
    default: true
  },
  {
    key: 'fetchCoverArt',
    labelKey: 'transforms.autoTag.fields.fetchCover',
    type: 'boolean',
    default: true
  },
  {
    key: 'fetchGenre',
    labelKey: 'transforms.autoTag.fields.fetchGenre',
    type: 'boolean',
    default: true
  },
  {
    key: 'fetchTrackNumber',
    labelKey: 'transforms.autoTag.fields.fetchTrackNumber',
    type: 'boolean',
    default: true
  },
  {
    key: 'minMatchScore',
    labelKey: 'transforms.autoTag.fields.minMatchScore',
    type: 'number',
    default: 80,
    min: 0,
    max: 100
  }
]

export const autoTagTransform: TransformDefinition<AutoTagConfig> = {
  type: 'auto-tag',
  apiVersion: 1,
  labelKey: 'transforms.autoTag.label',
  descriptionKey: 'transforms.autoTag.description',
  allowMultiple: false,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: {
    primarySource: 'youtube',
    enrichWithMusicBrainz: true,
    fetchCoverArt: true,
    fetchGenre: true,
    fetchTrackNumber: true,
    minMatchScore: 80
  },
  async run(ctx: TrackContext, config: AutoTagConfig, services: TransformServices): Promise<void> {
    const ytTags = readTrackTags(ctx.workingFile)
    const parsed = parseTitle(ctx.info.rawTitle || ytTags.title || '')
    const ytNorm: TrackTags = {
      ...ytTags,
      artist: ytTags.artist || parsed.artist || undefined,
      title: parsed.title || ytTags.title
    }
    // Set a safe baseline first so a skip-on-failure still yields YouTube tags.
    ctx.tags = ytNorm
    const { tags: mbTags, cover } = await resolveAutoTag(
      ytNorm,
      config,
      services,
      ctx.info.contentHash
    )
    if (cover) embedCover(ctx.workingFile, cover, 'image/jpeg')
    ctx.tags = mergeTags(ytNorm, mbTags, config.primarySource)
  }
}
