import type { ParsedTitle } from '../shared/types'
import type { SourceKind } from './channel-classifier'

export interface ParseOptions {
  kind?: SourceKind
  channelName?: string
  parseFeatured?: boolean
  parseVersion?: boolean
  stripNoiseTokens?: boolean
}

/** Bracketed phrases that are pure noise (not a version) — removed from titles. */
const NOISE = new RegExp(
  '\\b(' +
    [
      'official\\s+(music\\s+)?video',
      'official\\s+audio',
      'official\\s+lyric(s)?\\s+video',
      'lyric(s)?\\s+video',
      'lyric(s)?',
      'music\\s+video',
      'visuali[sz]er',
      'audio',
      'video',
      'hd',
      'hq',
      '4k',
      'mv',
      'm/v',
      'full\\s+album',
      'color\\s+coded',
      'colou?r\\s+coded'
    ].join('|') +
    ')\\b',
  'i'
)

/** Version/edit descriptors that should be PRESERVED (kept on the title). */
const VERSION =
  /\b([\w\s.'-]*?\b(remix|edit|version|mix|live|acoustic|instrumental|remaster(ed)?|sped\s*up|slowed|reverb|bootleg|vip|rework|cover))\b/i

const FEAT = /\b(feat\.?|ft\.?|featuring|with)\b\.?\s+/i
const LEADING_INDEX = /^\s*(\d{1,3}|#\d{1,3})[.)\-\s]+/
const SEPARATORS = /\s*[-–—|:~]\s+|\s+[-–—|:~]\s*/

/** Split a featured-artist blob like "A & B, C" into individual names. */
function splitArtists(blob: string): string[] {
  return blob
    .split(/\s*(?:,|&|\bx\b|\bvs\.?\b|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Pull `(...)`/`[...]` groups out of a string, returning the base + the groups. */
function extractGroups(s: string): { base: string; groups: string[] } {
  const groups: string[] = []
  const base = s
    .replace(/[([{]([^)\]}]*)[)\]}]/g, (_, inner) => {
      groups.push(String(inner).trim())
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { base, groups }
}

export function parseTitle(raw: string, opts: ParseOptions = {}): ParsedTitle {
  const parseFeatured = opts.parseFeatured !== false
  const parseVersion = opts.parseVersion !== false
  const stripNoise = opts.stripNoiseTokens !== false

  const work = raw.trim().replace(LEADING_INDEX, '')

  // 1. Pull bracketed groups so we can classify each as feat / version / noise.
  const { base, groups } = extractGroups(work)
  let title = base
  let artistSide: string | null = null

  // 2. Split artist - title on the first real separator (operate on the base).
  const sepMatch = title.match(SEPARATORS)
  if (sepMatch && sepMatch.index !== undefined) {
    artistSide = title.slice(0, sepMatch.index).trim()
    title = title.slice(sepMatch.index + sepMatch[0].length).trim()
  }

  const featured: string[] = []
  let version: string | undefined

  // 3a. Inline feat in the title base (no brackets): "Song feat. Guest"
  const inlineFeat = title.match(FEAT)
  if (parseFeatured && inlineFeat && inlineFeat.index !== undefined) {
    featured.push(...splitArtists(title.slice(inlineFeat.index + inlineFeat[0].length)))
    title = title.slice(0, inlineFeat.index).trim()
  }

  // 3b. Classify each bracketed group: feat → extract, version → keep, noise → drop.
  const classify = (text: string): void => {
    if (!text) return
    const featM = text.match(FEAT)
    if (parseFeatured && featM && featM.index !== undefined) {
      featured.push(...splitArtists(text.slice(featM.index + featM[0].length)))
      return
    }
    if (parseVersion && VERSION.test(text)) {
      version = version ?? text.trim()
      return
    }
    if (stripNoise && NOISE.test(text)) return
    if (!parseFeatured && FEAT.test(text)) {
      // Featured extraction off: preserve the feat group verbatim on the title.
      title = `${title} (${text})`.trim()
      return
    }
    if (!stripNoise) {
      // Noise stripping off: keep the group on the title.
      title = `${title} (${text})`.trim()
    }
  }
  for (const g of groups) classify(g)

  // 4. Resolve artist from source kind when no separator was present.
  if (!artistSide && opts.kind === 'official-artist' && opts.channelName) {
    artistSide = opts.channelName
  }

  const result: ParsedTitle = {
    artist: artistSide && artistSide.length ? artistSide : null,
    title: title.replace(/\s+/g, ' ').trim()
  }
  if (featured.length) result.featured = featured
  if (version) result.version = version
  return result
}
