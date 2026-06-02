// src/main/transforms/auto-tag.ts
import type { TrackTags } from '../../shared/types'
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices, TransformLog } from './types'
import { parseTitle } from '../title-parser'
import { selectBestMatch } from '../mb-select'
import { MusicBrainzClient } from '../musicbrainz'
import { readTrackTags, embedCover } from '../tagger'
import { timed } from '../bench'

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

/** Cover Art Archive base URL. */
const CAA_BASE = 'https://coverartarchive.org'

/**
 * Fetch front cover art from the Cover Art Archive, preferring the specific
 * release but falling back to its release group. CAA art is frequently attached
 * to the group rather than every individual release, so the release URL 404s for
 * many tracks — without the fallback a real album cover is missed and the
 * YouTube thumbnail is kept by default. Returns undefined when neither yields an
 * image. Stops at the first hit (the release).
 */
export async function fetchCoverArt(
  fetchImpl: typeof fetch,
  ids: { releaseId?: string | null; releaseGroupId?: string | null },
  log: TransformLog
): Promise<Buffer | undefined> {
  const candidates = [
    ids.releaseId
      ? { kind: 'release', url: `${CAA_BASE}/release/${ids.releaseId}/front-500` }
      : null,
    ids.releaseGroupId
      ? { kind: 'release-group', url: `${CAA_BASE}/release-group/${ids.releaseGroupId}/front-500` }
      : null
  ].filter((c): c is { kind: string; url: string } => c !== null)

  for (const { kind, url } of candidates) {
    try {
      const res = await fetchImpl(url)
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        log.debug(`fetched cover art (${buf.length} bytes) from ${kind}`)
        return buf
      }
      log.debug(`no cover art on Cover Art Archive ${kind} (HTTP ${res.status})`)
    } catch (err) {
      log.debug(`cover art ${kind} fetch failed:`, err)
    }
  }
  return undefined
}

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
  if (!config.enrichWithMusicBrainz) {
    services.log.debug('MusicBrainz enrichment disabled — using YouTube tags only')
    return { tags: {} }
  }
  const mb = new MusicBrainzClient(MUSICBRAINZ_CONTACT, { fetchImpl: services.fetch })
  const search = await mb.searchRecording(ytNorm.artist ?? null, ytNorm.title ?? '')
  const match = selectBestMatch(search, config.minMatchScore)
  if (!match) {
    services.log.info(
      `no MusicBrainz match above score ${config.minMatchScore} — keeping YouTube tags`
    )
    return { tags: {} }
  }
  services.log.info(`MusicBrainz match: "${match.artist ?? '?'} – ${match.title}"`)
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
  if (config.fetchCoverArt && (match.releaseId || match.releaseGroupId)) {
    cover = await fetchCoverArt(services.fetch, match, services.log)
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
      services.log.debug(`cache hit — reusing tags, skipping MusicBrainz lookup (${hash})`)
      services.reportProgress(0.9)
      return { tags: cached.mb, cover: services.cache.readCover(hash) ?? undefined }
    }
  }
  services.log.debug(`MusicBrainz lookup for "${ytNorm.artist ?? '?'} – ${ytNorm.title ?? '?'}"`)
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
    // A real album cover (MusicBrainz / Cover Art Archive) always replaces the
    // YouTube thumbnail, independent of `primarySource` — the thumbnail is only a
    // fallback when no other cover is available.
    if (cover) embedCover(ctx.workingFile, cover, 'image/jpeg')
    ctx.tags = mergeTags(ytNorm, mbTags, config.primarySource)
    services.log.info(
      `tagged "${ctx.tags.artist ?? '?'} – ${ctx.tags.title ?? '?'}"` +
        ` (primary=${config.primarySource}${ctx.tags.album ? `, album="${ctx.tags.album}"` : ''}` +
        `${ctx.tags.genre ? `, genre=${ctx.tags.genre}` : ''}${cover ? ', +cover' : ''})`
    )
  }
}
