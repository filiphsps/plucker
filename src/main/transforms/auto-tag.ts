// src/main/transforms/auto-tag.ts
import type { TrackTags } from '@shared/types'
import type { ConfigField } from '@shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices, TransformLog } from './types'
import { parseTitle } from '@app/app/metadata/title-parser'
import { selectBestMatch, selectVerifiedMatch } from '@app/app/metadata/musicbrainz/mb-select'
import { MusicBrainzClient } from '@app/app/metadata/musicbrainz/musicbrainz'
import { readTrackTags, embedCover } from '@app/app/metadata/id3/tagger'
import { timed } from '@app/app/logging/bench'
import type { SourceMetadata } from '@app/app/metadata/source-metadata'
import { classifySource } from '@app/app/metadata/channel-classifier'
import { fuseMetadata, fusedToTags } from '@app/app/metadata/metadata-fusion'
import type { VerifyTarget } from '@app/app/metadata/musicbrainz/mb-verify'

export interface AutoTagConfig {
  primarySource: 'youtube' | 'musicbrainz'
  enrichWithMusicBrainz: boolean
  fetchCoverArt: boolean
  fetchGenre: boolean
  fetchTrackNumber: boolean
  minMatchScore: number
  // parsing / fusion
  useStructuredMetadata: boolean
  parseFeatured: boolean
  featuredHandling: 'keep-in-title' | 'append-to-artist' | 'drop'
  parseVersion: boolean
  stripNoiseTokens: boolean
  channelArtistFallback: 'official-only' | 'always' | 'never'
  // verification gate
  requireVerifiedMatch: boolean
  durationToleranceSec: number
  nameSimilarityThreshold: number
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

/**
 * source → classify → parse → fuse → flat TrackTags (the safe local baseline).
 * Pure: no I/O, so it works identically on the download path (rich info.json)
 * and the re-trigger path (source synthesized from the file's own tags).
 */
export function resolveLocalTags(
  src: SourceMetadata,
  rawTitle: string,
  config: Pick<
    AutoTagConfig,
    | 'useStructuredMetadata'
    | 'parseFeatured'
    | 'featuredHandling'
    | 'parseVersion'
    | 'stripNoiseTokens'
    | 'channelArtistFallback'
  >
): TrackTags {
  const kind = classifySource(src)
  const parsed = parseTitle(rawTitle, {
    kind,
    channelName: src.channel ?? src.uploader,
    parseFeatured: config.parseFeatured,
    parseVersion: config.parseVersion,
    stripNoiseTokens: config.stripNoiseTokens
  })
  const fused = fuseMetadata(src, parsed, kind, {
    useStructuredMetadata: config.useStructuredMetadata,
    channelArtistFallback: config.channelArtistFallback
  })
  const tags = fusedToTags(fused)
  // Featured-artist handling.
  if (config.parseFeatured && parsed.featured?.length) {
    if (config.featuredHandling === 'append-to-artist' && tags.artist) {
      tags.artist = `${tags.artist} feat. ${parsed.featured.join(' & ')}`
    } else if (config.featuredHandling === 'keep-in-title' && tags.title) {
      tags.title = `${tags.title} (feat. ${parsed.featured.join(' & ')})`
    } // 'drop' → leave them out
  }
  return tags
}

/** Look up MusicBrainz and return the enrichment tags + optional cover bytes. */
export async function enrich(
  ytNorm: TrackTags,
  config: AutoTagConfig,
  services: Pick<TransformServices, 'fetch' | 'log' | 'reportProgress'>,
  target: VerifyTarget = {}
): Promise<{ tags: TrackTags; cover?: Buffer }> {
  if (!config.enrichWithMusicBrainz) {
    services.log.debug('MusicBrainz enrichment disabled — using local tags only')
    return { tags: {} }
  }
  const mb = new MusicBrainzClient(MUSICBRAINZ_CONTACT, { fetchImpl: services.fetch })
  const search = await mb.searchRecording(ytNorm.artist ?? null, ytNorm.title ?? '')
  const match = config.requireVerifiedMatch
    ? selectVerifiedMatch(search, config.minMatchScore, target, {
        durationToleranceSec: config.durationToleranceSec,
        nameSimilarityThreshold: config.nameSimilarityThreshold
      })
    : selectBestMatch(search, config.minMatchScore)
  if (!match) {
    services.log.info(
      `no verified MusicBrainz match (min score ${config.minMatchScore}) — keeping local tags`
    )
    return { tags: {} }
  }
  services.log.info(
    `MusicBrainz match: "${match.artist ?? '?'} – ${match.title}" ` +
      `(score ${match.score}/100, min ${config.minMatchScore})`
  )
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
  hash: string | undefined,
  target: VerifyTarget = {}
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
  const result = await timed('auto-tag-enrich', 'transform', () =>
    enrich(ytNorm, config, services, target)
  )
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
  },
  {
    key: 'useStructuredMetadata',
    labelKey: 'transforms.autoTag.fields.useStructuredMetadata',
    type: 'boolean',
    default: true
  },
  {
    key: 'parseFeatured',
    labelKey: 'transforms.autoTag.fields.parseFeatured',
    type: 'boolean',
    default: true
  },
  {
    key: 'featuredHandling',
    labelKey: 'transforms.autoTag.fields.featuredHandling',
    type: 'enum',
    default: 'keep-in-title',
    options: [
      { value: 'keep-in-title', labelKey: 'transforms.autoTag.options.featKeep' },
      { value: 'append-to-artist', labelKey: 'transforms.autoTag.options.featArtist' },
      { value: 'drop', labelKey: 'transforms.autoTag.options.featDrop' }
    ]
  },
  {
    key: 'parseVersion',
    labelKey: 'transforms.autoTag.fields.parseVersion',
    type: 'boolean',
    default: true
  },
  {
    key: 'stripNoiseTokens',
    labelKey: 'transforms.autoTag.fields.stripNoiseTokens',
    type: 'boolean',
    default: true
  },
  {
    key: 'channelArtistFallback',
    labelKey: 'transforms.autoTag.fields.channelArtistFallback',
    type: 'enum',
    default: 'official-only',
    options: [
      { value: 'official-only', labelKey: 'transforms.autoTag.options.chanOfficial' },
      { value: 'always', labelKey: 'transforms.autoTag.options.chanAlways' },
      { value: 'never', labelKey: 'transforms.autoTag.options.chanNever' }
    ]
  },
  {
    key: 'requireVerifiedMatch',
    labelKey: 'transforms.autoTag.fields.requireVerifiedMatch',
    type: 'boolean',
    default: true
  },
  {
    key: 'durationToleranceSec',
    labelKey: 'transforms.autoTag.fields.durationToleranceSec',
    type: 'number',
    default: 5,
    min: 0,
    max: 30
  },
  {
    key: 'nameSimilarityThreshold',
    labelKey: 'transforms.autoTag.fields.nameSimilarityThreshold',
    type: 'number',
    default: 70,
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
  deterministicGivenInput: false,
  configSchema: CONFIG_SCHEMA,
  defaultConfig: {
    primarySource: 'youtube',
    enrichWithMusicBrainz: true,
    fetchCoverArt: true,
    fetchGenre: true,
    fetchTrackNumber: true,
    minMatchScore: 80,
    useStructuredMetadata: true,
    parseFeatured: true,
    featuredHandling: 'keep-in-title',
    parseVersion: true,
    stripNoiseTokens: true,
    channelArtistFallback: 'official-only',
    requireVerifiedMatch: true,
    durationToleranceSec: 5,
    nameSimilarityThreshold: 70
  },
  async run(ctx: TrackContext, config: AutoTagConfig, services: TransformServices): Promise<void> {
    const ytTags = services.media
      ? await services.media.readTags(ctx.workingFile)
      : readTrackTags(ctx.workingFile)
    // Prefer the info.json captured at download; on the re-trigger path (no
    // sidecar) synthesize a source from the file's own tags so the same
    // classify → parse → fuse pipeline still runs.
    const src: SourceMetadata = ctx.info.source ?? {
      artist: ytTags.artist,
      track: ytTags.title,
      album: ytTags.album
    }
    const local = resolveLocalTags(src, ctx.info.rawTitle || ytTags.title || '', config)
    // Set a safe baseline first so a skip-on-failure still yields good local tags.
    ctx.tags = { ...ytTags, ...local }

    const target: VerifyTarget = {
      durationSec: src.durationSec,
      artist: local.artist,
      title: local.title
    }
    const { tags: mbTags, cover } = await resolveAutoTag(
      local,
      config,
      services,
      ctx.info.contentHash,
      target
    )
    // A real album cover (MusicBrainz / Cover Art Archive) always replaces the
    // YouTube thumbnail, independent of `primarySource` — the thumbnail is only a
    // fallback when no other cover is available.
    if (cover) {
      if (services.media) await services.media.embedCover(ctx.workingFile, cover, 'image/jpeg')
      else embedCover(ctx.workingFile, cover, 'image/jpeg')
    }
    ctx.tags = mergeTags(local, mbTags, config.primarySource)
    logTagSummary(ctx.tags, !!cover, config.primarySource, services.log)
  }
}

/** ID3 text frames auto-tag populates, in the order shown in the log summary. */
const SUMMARY_FIELDS: { key: keyof TrackTags; label: string }[] = [
  { key: 'artist', label: 'artist' },
  { key: 'title', label: 'title' },
  { key: 'album', label: 'album' },
  { key: 'date', label: 'date' },
  { key: 'year', label: 'year' },
  { key: 'trackNumber', label: 'track' },
  { key: 'genre', label: 'genre' }
]

/**
 * Log exactly which tags ended up set (with their values) and which are still
 * missing, so a glance at the log shows what auto-tag achieved for the track.
 * Cover art is tracked alongside the text frames even though it isn't a tag.
 */
function logTagSummary(
  tags: TrackTags,
  hasCover: boolean,
  primarySource: 'youtube' | 'musicbrainz',
  log: TransformLog
): void {
  const set = SUMMARY_FIELDS.filter(({ key }) => tags[key]).map(
    ({ key, label }) => `${label}=${tags[key]}`
  )
  const missing = SUMMARY_FIELDS.filter(({ key }) => !tags[key]).map(({ label }) => label)
  if (hasCover) set.push('cover')
  else missing.push('cover')
  log.info(`tags set (primary=${primarySource}): ${set.length ? set.join(', ') : 'none'}`)
  if (missing.length) log.info(`tags missing: ${missing.join(', ')}`)
}
