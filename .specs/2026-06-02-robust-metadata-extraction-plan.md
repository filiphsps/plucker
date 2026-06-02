# Robust YouTube Metadata Extraction & Verified Matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reliably extract `{artist, title, album, year, trackNumber, genre, featured, version, cover}` from wildly varying YouTube videos, then let MusicBrainz override only when it provably matches the audio — otherwise keep honest, fully-populated local tags.

**Architecture:** A set of small pure modules (source capture → channel classification → title parsing → signal fusion → verified MB match) orchestrated by the existing `auto-tag` transform. The pipeline is changed only to pass the full `.info.json` through `TrackContext.info.source`. All new behavior is exposed through `auto-tag`'s `ConfigField` schema.

**Tech Stack:** TypeScript, Electron main process, vitest, node-id3, MusicBrainz WS/2 + Cover Art Archive.

**Commands:** `pnpm test <path>` (single file), `pnpm test`, `pnpm typecheck`, `pnpm lint`.

**Git rule for this work:** Never branch/stash/worktree. Each commit is exactly one `git add <files> && git commit` after confirming nothing is pre-staged (`git diff --cached --quiet`).

---

## File Structure

- Create `src/main/source-metadata.ts` (+ test) — `extractSourceMetadata`, `SourceMetadata`.
- Create `src/main/channel-classifier.ts` (+ test) — `classifySource`, `SourceKind`.
- Create `src/shared/string-similarity.ts` (+ test) — `normalizeName`, `tokenSetSimilarity`.
- Rewrite `src/main/title-parser.ts` (+ extend test) — richer `parseTitle`.
- Create `src/main/metadata-fusion.ts` (+ test) — `fuseMetadata`, `fusedToTags`, `FusedTags`.
- Create `src/main/mb-verify.ts` (+ test) — `verifyMatch`.
- Modify `src/shared/types.ts` — extend `ParsedTitle` with `featured`/`version`.
- Modify `src/main/musicbrainz.ts` — search `limit=10`, surface recording `length`.
- Modify `src/main/mb-select.ts` (+ test) — add `lengthMs` to `MbMatch`; add `selectVerifiedMatch`.
- Modify `src/main/transforms/types.ts` — add `info.source?: SourceMetadata`.
- Modify `src/main/pipeline.ts` — rich `readSidecar`, pass `source` into the chain.
- Modify `src/main/transforms/auto-tag.ts` (+ test) — expanded config + orchestration.
- Modify `src/renderer/src/i18n/locales/en.ts` + `de.ts` — new field/option labels.

---

## Task 1: `string-similarity.ts` (shared util)

**Files:**
- Create: `src/shared/string-similarity.ts`
- Test: `src/shared/string-similarity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/string-similarity.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeName, tokenSetSimilarity } from './string-similarity'

describe('normalizeName', () => {
  it('lowercases, strips diacritics and punctuation to single-spaced tokens', () => {
    expect(normalizeName('Beyoncé feat. Jay-Z!!')).toBe('beyonce feat jay z')
    expect(normalizeName('  The   Weeknd  ')).toBe('the weeknd')
  })
})

describe('tokenSetSimilarity', () => {
  it('is 1 for identical token sets regardless of order/case/punctuation', () => {
    expect(tokenSetSimilarity('Daft Punk', 'daft, punk')).toBe(1)
    expect(tokenSetSimilarity('Around the World', 'world the around')).toBe(1)
  })
  it('is 0 for fully disjoint strings', () => {
    expect(tokenSetSimilarity('abc', 'xyz')).toBe(0)
  })
  it('is a Jaccard ratio for partial overlap', () => {
    // sets {a,b} vs {b,c}: intersection 1, union 3
    expect(tokenSetSimilarity('a b', 'b c')).toBeCloseTo(1 / 3, 5)
  })
  it('treats empty inputs as 0 similarity', () => {
    expect(tokenSetSimilarity('', 'anything')).toBe(0)
    expect(tokenSetSimilarity('', '')).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/string-similarity.test.ts`
Expected: FAIL — cannot find module `./string-similarity`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/string-similarity.ts

/** Lowercase, strip diacritics, collapse non-alphanumerics to single spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Jaccard similarity (0..1) over the normalized token sets of two strings. */
export function tokenSetSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/string-similarity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet && git add src/shared/string-similarity.ts src/shared/string-similarity.test.ts && git commit -m "feat(metadata): add token-set string similarity util"
```

---

## Task 2: `source-metadata.ts`

**Files:**
- Create: `src/main/source-metadata.ts`
- Test: `src/main/source-metadata.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/source-metadata.test.ts
import { describe, it, expect } from 'vitest'
import { extractSourceMetadata } from './source-metadata'

describe('extractSourceMetadata', () => {
  it('maps yt-dlp snake_case fields into a typed SourceMetadata', () => {
    const info = {
      id: 'abc',
      title: 'Some Title',
      artist: 'Daft Punk',
      track: 'Around the World',
      album: 'Homework',
      release_year: 1997,
      creator: 'Daft Punk',
      genre: 'House',
      track_number: 5,
      uploader: 'Daft Punk - Topic',
      channel: 'Daft Punk',
      description: 'Provided to YouTube by ...',
      categories: ['Music'],
      duration: 429.1
    }
    expect(extractSourceMetadata(info)).toEqual({
      artist: 'Daft Punk',
      track: 'Around the World',
      album: 'Homework',
      releaseYear: '1997',
      creator: 'Daft Punk',
      genre: 'House',
      trackNumber: '5',
      uploader: 'Daft Punk - Topic',
      channel: 'Daft Punk',
      description: 'Provided to YouTube by ...',
      categories: ['Music'],
      durationSec: 429
    })
  })
  it('tolerates a sparse/garbage object, returning only present fields', () => {
    expect(extractSourceMetadata({ title: 'x' })).toEqual({})
    expect(extractSourceMetadata(null)).toEqual({})
    expect(extractSourceMetadata({ artist: 42 })).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/source-metadata.test.ts`
Expected: FAIL — cannot find module `./source-metadata`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/source-metadata.ts

/** Structured + contextual metadata pulled from a yt-dlp `.info.json`. */
export interface SourceMetadata {
  artist?: string
  track?: string
  album?: string
  releaseYear?: string
  creator?: string
  genre?: string
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
  set('genre', str(o.genre))
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/source-metadata.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet && git add src/main/source-metadata.ts src/main/source-metadata.test.ts && git commit -m "feat(metadata): capture full info.json into SourceMetadata"
```

---

## Task 3: `channel-classifier.ts`

**Files:**
- Create: `src/main/channel-classifier.ts`
- Test: `src/main/channel-classifier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/channel-classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classifySource } from './channel-classifier'

describe('classifySource', () => {
  it('detects Topic channels by uploader suffix', () => {
    expect(classifySource({ uploader: 'Daft Punk - Topic' })).toBe('topic')
  })
  it('detects Topic by the "Provided to YouTube by" description marker', () => {
    expect(
      classifySource({ channel: 'Daft Punk', description: 'Provided to YouTube by Columbia' })
    ).toBe('topic')
  })
  it('detects VEVO channels', () => {
    expect(classifySource({ channel: 'TaylorSwiftVEVO' })).toBe('vevo')
  })
  it('detects record-label channels by name suffix', () => {
    expect(classifySource({ channel: 'Mad Decent Records' })).toBe('label')
    expect(classifySource({ uploader: 'Spinnin Recordings' })).toBe('label')
  })
  it('detects an official artist channel when channel ~= structured artist', () => {
    expect(classifySource({ channel: 'The Weeknd', artist: 'The Weeknd' })).toBe('official-artist')
  })
  it('falls back to generic', () => {
    expect(classifySource({ channel: 'Random Uploads 2009', uploader: 'xX_dj_Xx' })).toBe('generic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/channel-classifier.test.ts`
Expected: FAIL — cannot find module `./channel-classifier`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/channel-classifier.ts
import type { SourceMetadata } from './source-metadata'
import { tokenSetSimilarity } from '../shared/string-similarity'

export type SourceKind = 'topic' | 'vevo' | 'label' | 'official-artist' | 'generic'

const LABEL_SUFFIX = /\b(records|recordings|music group|label|entertainment)\b/i

/** Bucket a video by its channel/uploader so the parser can interpret the title. */
export function classifySource(src: SourceMetadata): SourceKind {
  const channel = src.channel ?? ''
  const uploader = src.uploader ?? ''
  const both = `${channel} ${uploader}`

  if (/ - topic$/i.test(uploader) || / - topic$/i.test(channel)) return 'topic'
  if (/provided to youtube by/i.test(src.description ?? '')) return 'topic'
  if (/vevo$/i.test(channel) || /vevo$/i.test(uploader)) return 'vevo'
  if (LABEL_SUFFIX.test(both)) return 'label'
  if (src.artist) {
    const name = channel || uploader
    if (name && tokenSetSimilarity(name, src.artist) >= 0.6) return 'official-artist'
  }
  return 'generic'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/channel-classifier.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet && git add src/main/channel-classifier.ts src/main/channel-classifier.test.ts && git commit -m "feat(metadata): classify video source by channel/uploader"
```

---

## Task 4: Rewrite `title-parser.ts`

**Files:**
- Modify: `src/shared/types.ts` (extend `ParsedTitle`)
- Modify: `src/main/title-parser.ts`
- Modify: `src/main/title-parser.test.ts`

- [ ] **Step 1: Extend the `ParsedTitle` type**

In `src/shared/types.ts`, replace the existing `ParsedTitle` interface:

```ts
export interface ParsedTitle {
  artist: string | null
  title: string
  /** Featured artists pulled out of the title (feat./ft./with), if any. */
  featured?: string[]
  /** Version/edit descriptor pulled out of the title, e.g. "Acoustic Remix". */
  version?: string
}
```

- [ ] **Step 2: Write the failing tests**

Replace the body of `src/main/title-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTitle } from './title-parser'

describe('parseTitle — separators & noise', () => {
  it('splits a plain "Artist - Title"', () => {
    expect(parseTitle('Daft Punk - Around the World')).toMatchObject({
      artist: 'Daft Punk',
      title: 'Around the World'
    })
  })
  it('handles en/em dashes and pipe separators', () => {
    expect(parseTitle('Artist – Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
    expect(parseTitle('Artist — Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
    expect(parseTitle('Artist | Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
  })
  it('strips noise tokens from the title', () => {
    expect(parseTitle('Artist - Song (Official Music Video)')).toMatchObject({ title: 'Song' })
    expect(parseTitle('Artist - Song [Lyric Video] (HD)')).toMatchObject({ title: 'Song' })
  })
  it('strips a leading track index', () => {
    expect(parseTitle('01. Artist - Song')).toMatchObject({ artist: 'Artist', title: 'Song' })
  })
  it('returns null artist for a bare title', () => {
    expect(parseTitle('Just A Title (Lyrics)')).toMatchObject({ artist: null, title: 'Just A Title' })
  })
})

describe('parseTitle — featured & version', () => {
  it('extracts featured artists and removes them from the title by default', () => {
    const r = parseTitle('Artist - Song (feat. Guest One & Guest Two)')
    expect(r.title).toBe('Song')
    expect(r.featured).toEqual(['Guest One', 'Guest Two'])
  })
  it('extracts an inline "ft." too', () => {
    const r = parseTitle('Artist - Song ft. Guest')
    expect(r.title).toBe('Song')
    expect(r.featured).toEqual(['Guest'])
  })
  it('keeps the featured tokens in the title when parseFeatured is false', () => {
    const r = parseTitle('Artist - Song (feat. Guest)', { parseFeatured: false })
    expect(r.featured).toBeUndefined()
    expect(r.title).toContain('feat. Guest')
  })
  it('extracts a version descriptor', () => {
    const r = parseTitle('Artist - Song (Acoustic Remix)')
    expect(r.version).toBe('Acoustic Remix')
    expect(r.title).toBe('Song')
  })
})

describe('parseTitle — source kind', () => {
  it('treats a title-only video on an official artist channel as title, artist = channel', () => {
    const r = parseTitle('Blinding Lights', { kind: 'official-artist', channelName: 'The Weeknd' })
    expect(r).toMatchObject({ artist: 'The Weeknd', title: 'Blinding Lights' })
  })
  it('does not invent an artist from the channel for a generic source', () => {
    expect(parseTitle('Blinding Lights', { kind: 'generic', channelName: 'Some Uploader' })).toMatchObject({
      artist: null,
      title: 'Blinding Lights'
    })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/main/title-parser.test.ts`
Expected: FAIL — new options/fields not implemented.

- [ ] **Step 4: Implement the richer parser**

Replace the entire contents of `src/main/title-parser.ts`:

```ts
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

  let work = raw.trim().replace(LEADING_INDEX, '')

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

  // 3. Inline "feat" inside the title text itself.
  const classify = (text: string): void => {
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
    // Unclassified group: keep it appended to the title (rare; e.g. subtitle).
    if (text) title = `${title} (${text})`.trim()
  }

  // 3a. Inline feat in the title base (no brackets): "Song feat. Guest"
  const inlineFeat = title.match(FEAT)
  if (parseFeatured && inlineFeat && inlineFeat.index !== undefined) {
    featured.push(...splitArtists(title.slice(inlineFeat.index + inlineFeat[0].length)))
    title = title.slice(0, inlineFeat.index).trim()
  }

  // 3b. Classify each bracketed group.
  for (const g of groups) classify(g)

  // 4. Re-attach featured to the title when NOT extracting (parseFeatured=false):
  //    handled implicitly because we never stripped them in that mode.

  // 5. Resolve artist from source kind when no separator was present.
  if (!artistSide) {
    if (opts.kind === 'official-artist' && opts.channelName) {
      artistSide = opts.channelName
    }
  }

  const result: ParsedTitle = {
    artist: artistSide && artistSide.length ? artistSide : null,
    title: title.replace(/\s+/g, ' ').trim()
  }
  if (featured.length) result.featured = featured
  if (version) result.version = version
  return result
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/main/title-parser.test.ts`
Expected: PASS (all describe blocks).

> If the `parseFeatured: false` case still strips text, confirm `FEAT`/`VERSION`
> branches are gated on their flags as written. Adjust only the failing assertion's
> code path; do not weaken other tests.

- [ ] **Step 6: Typecheck (ParsedTitle change ripples)**

Run: `pnpm typecheck`
Expected: PASS. (`auto-tag.ts` still compiles — it reads `.artist`/`.title` only.)

- [ ] **Step 7: Commit**

```bash
git diff --cached --quiet && git add src/shared/types.ts src/main/title-parser.ts src/main/title-parser.test.ts && git commit -m "feat(metadata): source-aware title parser with feat/version extraction"
```

---

## Task 5: `metadata-fusion.ts`

**Files:**
- Create: `src/main/metadata-fusion.ts`
- Test: `src/main/metadata-fusion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/metadata-fusion.test.ts
import { describe, it, expect } from 'vitest'
import { fuseMetadata, fusedToTags } from './metadata-fusion'

const empty = {}

describe('fuseMetadata', () => {
  it('prefers structured info.json fields for a Topic source', () => {
    const fused = fuseMetadata(
      { artist: 'Daft Punk', track: 'Da Funk', album: 'Homework', releaseYear: '1997' },
      { artist: 'wrong', title: 'wrong' },
      'topic',
      { useStructuredMetadata: true, channelArtistFallback: 'official-only' }
    )
    expect(fused.artist.value).toBe('Daft Punk')
    expect(fused.artist.source).toBe('structured')
    expect(fused.title.value).toBe('Da Funk')
    expect(fused.year.value).toBe('1997')
  })
  it('falls back to parsed title when no structured fields exist', () => {
    const fused = fuseMetadata(
      empty,
      { artist: 'Artist', title: 'Song' },
      'generic',
      { useStructuredMetadata: true, channelArtistFallback: 'official-only' }
    )
    expect(fused.artist).toMatchObject({ value: 'Artist', source: 'title' })
    expect(fused.title).toMatchObject({ value: 'Song', source: 'title' })
  })
  it('uses the channel as a last-resort artist only when allowed', () => {
    const offc = fuseMetadata(
      { channel: 'The Weeknd' },
      { artist: null, title: 'Blinding Lights' },
      'official-artist',
      { useStructuredMetadata: true, channelArtistFallback: 'official-only' }
    )
    expect(offc.artist).toMatchObject({ value: 'The Weeknd', source: 'channel' })

    const gen = fuseMetadata(
      { channel: 'Some Uploader' },
      { artist: null, title: 'Song' },
      'generic',
      { useStructuredMetadata: true, channelArtistFallback: 'official-only' }
    )
    expect(gen.artist.value).toBeUndefined()
  })
  it('ignores structured fields when useStructuredMetadata is false', () => {
    const fused = fuseMetadata(
      { artist: 'Structured', track: 'StructTrack' },
      { artist: 'Parsed', title: 'ParsedTrack' },
      'topic',
      { useStructuredMetadata: false, channelArtistFallback: 'official-only' }
    )
    expect(fused.artist.value).toBe('Parsed')
  })
})

describe('fusedToTags', () => {
  it('flattens to a plain TrackTags object', () => {
    const fused = fuseMetadata(
      { artist: 'A', track: 'T', album: 'Al', releaseYear: '2020', genre: 'Pop', trackNumber: '3' },
      { artist: null, title: 'T', featured: ['G'] },
      'topic',
      { useStructuredMetadata: true, channelArtistFallback: 'never' }
    )
    expect(fusedToTags(fused)).toEqual({
      artist: 'A',
      title: 'T',
      album: 'Al',
      year: '2020',
      genre: 'Pop',
      trackNumber: '3'
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/metadata-fusion.test.ts`
Expected: FAIL — cannot find module `./metadata-fusion`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
  genre: FusedField
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

  const artist = pick(fromStruct(src.artist ?? src.creator), fromTitle(parsed.artist), channelArtist)
  const title = pick(fromStruct(src.track), fromTitle(parsed.title))
  const album = pick(fromStruct(src.album))
  const year = pick(fromStruct(src.releaseYear))
  const trackNumber = pick(fromStruct(src.trackNumber))
  const genre = pick(fromStruct(src.genre))

  const fused: FusedTags = { artist, title, album, year, trackNumber, genre }
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
  if (f.genre.value) tags.genre = f.genre.value
  if (f.trackNumber.value) tags.trackNumber = f.trackNumber.value
  return tags
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/metadata-fusion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git diff --cached --quiet && git add src/main/metadata-fusion.ts src/main/metadata-fusion.test.ts && git commit -m "feat(metadata): fuse source + parsed signals with per-field confidence"
```

---

## Task 6: MusicBrainz length + verified selection

**Files:**
- Modify: `src/main/musicbrainz.ts`
- Modify: `src/main/mb-select.ts`
- Create: `src/main/mb-verify.ts`
- Test: `src/main/mb-verify.test.ts`
- Modify: `src/main/mb-select.test.ts`

- [ ] **Step 1: Write the failing `mb-verify` test**

```ts
// src/main/mb-verify.test.ts
import { describe, it, expect } from 'vitest'
import { verifyMatch } from './mb-verify'

const opts = { durationToleranceSec: 5, nameSimilarityThreshold: 70 }

describe('verifyMatch', () => {
  it('accepts when duration is within tolerance and names agree', () => {
    expect(
      verifyMatch(
        { lengthMs: 200000, artist: 'Daft Punk', title: 'Da Funk' },
        { durationSec: 202, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(true)
  })
  it('rejects when duration is too far off', () => {
    expect(
      verifyMatch(
        { lengthMs: 200000, artist: 'Daft Punk', title: 'Da Funk' },
        { durationSec: 240, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(false)
  })
  it('rejects when names disagree even if duration matches', () => {
    expect(
      verifyMatch(
        { lengthMs: 200000, artist: 'Someone Else', title: 'Other Song' },
        { durationSec: 200, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(false)
  })
  it('with no MB length, requires stronger name agreement (still accepts exact)', () => {
    expect(
      verifyMatch(
        { artist: 'Daft Punk', title: 'Da Funk' },
        { durationSec: 200, artist: 'Daft Punk', title: 'Da Funk' },
        opts
      ).ok
    ).toBe(true)
  })
  it('with no MB length, rejects a merely-similar name', () => {
    expect(
      verifyMatch(
        { artist: 'Daft Punk', title: 'Da Funk (Remix)' },
        { durationSec: 200, artist: 'Daft Punk', title: 'Around the World' },
        opts
      ).ok
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm test src/main/mb-verify.test.ts`
Expected: FAIL — cannot find module `./mb-verify`.

- [ ] **Step 3: Implement `mb-verify.ts`**

```ts
// src/main/mb-verify.ts
import { tokenSetSimilarity } from '../shared/string-similarity'

export interface VerifyTarget {
  durationSec?: number
  artist?: string
  title?: string
}

export interface VerifyCandidate {
  lengthMs?: number
  artist?: string | null
  title?: string
}

export interface VerifyOptions {
  durationToleranceSec: number
  nameSimilarityThreshold: number // 0..100
}

export interface VerifyResult {
  ok: boolean
  reason: string
}

/**
 * Accept a MusicBrainz recording as the same track as the downloaded audio only
 * when its duration is within tolerance AND artist+title fuzzily agree. When the
 * recording has no length we cannot duration-check, so require a stronger name
 * match instead of auto-rejecting.
 */
export function verifyMatch(
  cand: VerifyCandidate,
  target: VerifyTarget,
  opts: VerifyOptions
): VerifyResult {
  const threshold = opts.nameSimilarityThreshold / 100
  const artistSim = tokenSetSimilarity(cand.artist ?? '', target.artist ?? '')
  const titleSim = tokenSetSimilarity(cand.title ?? '', target.title ?? '')

  const hasLength = typeof cand.lengthMs === 'number' && typeof target.durationSec === 'number'
  if (hasLength) {
    const gap = Math.abs((cand.lengthMs as number) / 1000 - (target.durationSec as number))
    if (gap > opts.durationToleranceSec) return { ok: false, reason: `duration off by ${Math.round(gap)}s` }
    if (artistSim < threshold) return { ok: false, reason: `artist mismatch (${artistSim.toFixed(2)})` }
    if (titleSim < threshold) return { ok: false, reason: `title mismatch (${titleSim.toFixed(2)})` }
    return { ok: true, reason: 'duration + names agree' }
  }

  // No length: demand near-exact names (raise the bar to max(0.9, threshold)).
  const strong = Math.max(0.9, threshold)
  if (artistSim >= strong && titleSim >= strong) {
    return { ok: true, reason: 'no length; strong name agreement' }
  }
  return { ok: false, reason: 'no length; insufficient name agreement' }
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `pnpm test src/main/mb-verify.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Surface recording `length` from the MB client**

In `src/main/musicbrainz.ts`, change `searchRecording`'s limit from 5 to 10 (more candidates to verify against):

```ts
    return this.getJson(`${BASE}/recording?query=${q}&fmt=json&limit=10`)
```

(The MB recording search already includes a `length` field per result; no other client change is needed.)

- [ ] **Step 6: Add `lengthMs` to `MbMatch` and a `selectVerifiedMatch`**

In `src/main/mb-select.ts`, add `length?: number` to the `MbRecording` interface, add `lengthMs` to `MbMatch`, set it in `selectBestMatch`, and add `selectVerifiedMatch`:

```ts
// add to MbMatch:
  lengthMs: number | null
```

```ts
// add to MbRecording:
  length?: number
```

```ts
// in selectBestMatch's returned object, add:
    lengthMs: rec.length ?? null,
```

```ts
// new export at the bottom of mb-select.ts:
import { verifyMatch, type VerifyTarget, type VerifyOptions } from './mb-verify'

/**
 * Pick the best MusicBrainz recording that both clears `minScore` AND passes the
 * duration/name verification gate against the local target. Returns null when no
 * candidate verifies (the caller then keeps local tags).
 */
export function selectVerifiedMatch(
  json: unknown,
  minScore: number,
  target: VerifyTarget,
  opts: VerifyOptions
): MbMatch | null {
  const recs = (json as { recordings?: MbRecording[] })?.recordings ?? []
  const ranked = recs
    .filter((r) => (r.score ?? 0) >= minScore && r.id)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  for (const rec of ranked) {
    const verdict = verifyMatch(
      {
        lengthMs: rec.length,
        artist: rec['artist-credit']?.[0]?.artist?.name ?? null,
        title: rec.title
      },
      target,
      opts
    )
    if (!verdict.ok) continue
    const rel = pickRelease(rec.releases)
    return {
      score: rec.score ?? 0,
      recordingId: rec.id as string,
      artist: rec['artist-credit']?.[0]?.artist?.name ?? null,
      title: rec.title ?? '',
      album: rel?.title ?? null,
      date: rel?.date ?? null,
      year: year(rel?.date),
      releaseId: rel?.id ?? null,
      releaseGroupId: rel?.['release-group']?.id ?? null,
      lengthMs: rec.length ?? null
    }
  }
  return null
}
```

- [ ] **Step 7: Add a `selectVerifiedMatch` test + keep `selectBestMatch` green**

Append to `src/main/mb-select.test.ts`:

```ts
import { selectVerifiedMatch } from './mb-select'

describe('selectVerifiedMatch', () => {
  const target = { durationSec: 200, artist: 'Daft Punk', title: 'Da Funk' }
  const opts = { durationToleranceSec: 5, nameSimilarityThreshold: 70 }
  const json = {
    recordings: [
      { id: 'wrong', score: 100, title: 'Da Funk', length: 240000,
        'artist-credit': [{ artist: { name: 'Daft Punk' } }], releases: [] },
      { id: 'right', score: 95, title: 'Da Funk', length: 201000,
        'artist-credit': [{ artist: { name: 'Daft Punk' } }], releases: [] }
    ]
  }
  it('skips the high-score wrong-duration candidate and picks the verified one', () => {
    expect(selectVerifiedMatch(json, 80, target, opts)?.recordingId).toBe('right')
  })
  it('returns null when nothing verifies', () => {
    expect(selectVerifiedMatch(json, 80, { ...target, durationSec: 999 }, opts)).toBeNull()
  })
})
```

> If `mb-select.test.ts` lacks the `describe`/`it` imports at the top, add
> `import { describe, it, expect } from 'vitest'` (check the file first).

- [ ] **Step 8: Run the MB tests + typecheck**

Run: `pnpm test src/main/mb-select.test.ts src/main/mb-verify.test.ts`
Expected: PASS.
Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git diff --cached --quiet && git add src/main/musicbrainz.ts src/main/mb-select.ts src/main/mb-select.test.ts src/main/mb-verify.ts src/main/mb-verify.test.ts && git commit -m "feat(metadata): verified MusicBrainz selection via duration + name gate"
```

---

## Task 7: Thread `source` through the pipeline into the chain

**Files:**
- Modify: `src/main/transforms/types.ts`
- Modify: `src/main/pipeline.ts`

- [ ] **Step 1: Extend `TrackContext.info` with `source`**

In `src/main/transforms/types.ts`, add the import and field:

```ts
import type { SourceMetadata } from '../source-metadata'
```

```ts
  info: {
    videoId?: string
    rawTitle: string
    sourceFile: string
    index: number
    /** Tag-independent audio-content hash; cache key for skipping re-work. */
    contentHash?: string
    /** Full structured metadata captured from the yt-dlp `.info.json` sidecar. */
    source?: SourceMetadata
  }
```

- [ ] **Step 2: Make `readSidecar` return the rich source metadata**

In `src/main/pipeline.ts`, add the import:

```ts
import { extractSourceMetadata, type SourceMetadata } from './source-metadata'
```

Replace `readSidecar`:

```ts
/** Read a yt-dlp `.info.json` sidecar for the canonical id + title + full source metadata. */
function readSidecar(path: string): { id?: string; title?: string; source?: SourceMetadata } {
  if (!existsSync(path)) return {}
  try {
    const info = JSON.parse(readFileSync(path, 'utf8'))
    return {
      id: typeof info.id === 'string' ? info.id : undefined,
      title: typeof info.title === 'string' ? info.title : undefined,
      source: extractSourceMetadata(info)
    }
  } catch {
    return {}
  }
}
```

- [ ] **Step 3: Pass `source` into the transform chain**

In `src/main/pipeline.ts`, inside `finishTrack`, extend the `info` object passed to `runTransformChain` (currently `{ videoId, rawTitle, sourceFile, index, contentHash }`):

```ts
        {
          videoId: sidecar.id,
          rawTitle: sidecar.title ?? t.title,
          sourceFile: filePath,
          index: t.index,
          contentHash: hash,
          source: sidecar.source
        },
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Run the existing pipeline + run-chain tests (no behavior change yet)**

Run: `pnpm test src/main/pipeline.test.ts src/main/transforms/run-chain.test.ts`
Expected: PASS (new optional field is additive).

- [ ] **Step 6: Commit**

```bash
git diff --cached --quiet && git add src/main/transforms/types.ts src/main/pipeline.ts && git commit -m "feat(metadata): pass full info.json source metadata into transform chain"
```

---

## Task 8: Expand `AutoTagConfig` (schema + i18n)

**Files:**
- Modify: `src/main/transforms/auto-tag.ts`
- Modify: `src/renderer/src/i18n/locales/en.ts`
- Modify: `src/renderer/src/i18n/locales/de.ts`

- [ ] **Step 1: Inspect the existing i18n autoTag block**

Run: `grep -n "autoTag" src/renderer/src/i18n/locales/en.ts`
Read the surrounding `transforms.autoTag` object so new keys match its exact shape (`fields`, `options`). Do the same for `de.ts`.

- [ ] **Step 2: Extend the `AutoTagConfig` interface**

In `src/main/transforms/auto-tag.ts`, replace the `AutoTagConfig` interface:

```ts
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
```

- [ ] **Step 3: Extend `defaultConfig` and `CONFIG_SCHEMA`**

In the same file, update `defaultConfig` (inside `autoTagTransform`) to include the new defaults:

```ts
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
```

Append these fields to the `CONFIG_SCHEMA` array (before its closing `]`):

```ts
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
```

- [ ] **Step 4: Add the i18n labels (en)**

In `src/renderer/src/i18n/locales/en.ts`, inside `transforms.autoTag.fields`, add:

```ts
        useStructuredMetadata: 'Use structured metadata',
        parseFeatured: 'Extract featured artists',
        featuredHandling: 'Featured artists',
        parseVersion: 'Keep remix/version in title',
        stripNoiseTokens: 'Strip noise (Official Video, HD, …)',
        channelArtistFallback: 'Use channel as artist',
        requireVerifiedMatch: 'Require verified match',
        durationToleranceSec: 'Duration tolerance (s)',
        nameSimilarityThreshold: 'Name match threshold',
```

And inside `transforms.autoTag.options`, add:

```ts
        featKeep: 'Keep in title',
        featArtist: 'Append to artist',
        featDrop: 'Drop',
        chanOfficial: 'Official channels only',
        chanAlways: 'Whenever unknown',
        chanNever: 'Never',
```

- [ ] **Step 5: Add the same keys to `de.ts`**

In `src/renderer/src/i18n/locales/de.ts`, mirror the structure with German strings:

```ts
        useStructuredMetadata: 'Strukturierte Metadaten verwenden',
        parseFeatured: 'Gastkünstler extrahieren',
        featuredHandling: 'Gastkünstler',
        parseVersion: 'Remix/Version im Titel behalten',
        stripNoiseTokens: 'Rauschen entfernen (Official Video, HD, …)',
        channelArtistFallback: 'Kanal als Interpret verwenden',
        requireVerifiedMatch: 'Verifizierten Treffer verlangen',
        durationToleranceSec: 'Längentoleranz (s)',
        nameSimilarityThreshold: 'Namens-Schwellenwert',
```

```ts
        featKeep: 'Im Titel behalten',
        featArtist: 'An Interpret anhängen',
        featDrop: 'Verwerfen',
        chanOfficial: 'Nur offizielle Kanäle',
        chanAlways: 'Wenn unbekannt',
        chanNever: 'Nie',
```

- [ ] **Step 6: Typecheck (config type is consumed in Task 9; this step only verifies the schema/i18n compile)**

Run: `pnpm typecheck`
Expected: PASS. The `run()` body still uses the old fields — that's fine; Task 9 rewires it.

- [ ] **Step 7: Commit**

```bash
git diff --cached --quiet && git add src/main/transforms/auto-tag.ts src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts && git commit -m "feat(auto-tag): expose parsing/fusion/verification settings"
```

---

## Task 9: Rewire `auto-tag` orchestration

**Files:**
- Modify: `src/main/transforms/auto-tag.ts`
- Modify: `src/main/transforms/auto-tag.test.ts`

- [ ] **Step 1: Read the current auto-tag test to preserve existing coverage**

Run: `pnpm test src/main/transforms/auto-tag.test.ts`
Read `src/main/transforms/auto-tag.test.ts` fully. Existing tests for `mergeTags`/`fetchCoverArt`/`enrich` stay; you are adding orchestration tests and updating `enrich` to take a target + verified selection.

- [ ] **Step 2: Write failing orchestration tests**

Append to `src/main/transforms/auto-tag.test.ts`:

```ts
import { resolveLocalTags } from './auto-tag'

describe('resolveLocalTags (source → classify → parse → fuse)', () => {
  it('produces clean tags from a Topic source, ignoring the noisy raw title', () => {
    const tags = resolveLocalTags(
      { artist: 'Daft Punk', track: 'Da Funk', album: 'Homework', releaseYear: '1997',
        uploader: 'Daft Punk - Topic' },
      'Daft Punk - Da Funk (Official Video) [HD]',
      { useStructuredMetadata: true, parseFeatured: true, parseVersion: true,
        stripNoiseTokens: true, channelArtistFallback: 'official-only' } as never
    )
    expect(tags).toMatchObject({ artist: 'Daft Punk', title: 'Da Funk', album: 'Homework', year: '1997' })
  })
  it('parses a generic "Artist - Title (Official Video)" with no structured fields', () => {
    const tags = resolveLocalTags(
      { channel: 'Some Uploader' },
      'Some Artist - Cool Song (Official Music Video)',
      { useStructuredMetadata: true, parseFeatured: true, parseVersion: true,
        stripNoiseTokens: true, channelArtistFallback: 'official-only' } as never
    )
    expect(tags).toMatchObject({ artist: 'Some Artist', title: 'Cool Song' })
  })
  it('uses channel as artist for a title-only official-artist video', () => {
    const tags = resolveLocalTags(
      { channel: 'The Weeknd', artist: 'The Weeknd' },
      'Blinding Lights',
      { useStructuredMetadata: false, parseFeatured: true, parseVersion: true,
        stripNoiseTokens: true, channelArtistFallback: 'official-only' } as never
    )
    expect(tags).toMatchObject({ artist: 'The Weeknd', title: 'Blinding Lights' })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test src/main/transforms/auto-tag.test.ts`
Expected: FAIL — `resolveLocalTags` not exported.

- [ ] **Step 4: Implement `resolveLocalTags` and rewire `run()` + `enrich()`**

In `src/main/transforms/auto-tag.ts`:

Add imports:

```ts
import type { SourceMetadata } from '../source-metadata'
import { classifySource } from '../channel-classifier'
import { fuseMetadata, fusedToTags } from '../metadata-fusion'
import { selectVerifiedMatch } from '../mb-select'
import type { VerifyTarget } from '../mb-verify'
```

Add the new pure helper (export it):

```ts
/** source → classify → parse → fuse → flat TrackTags (the safe local baseline). */
export function resolveLocalTags(
  src: SourceMetadata,
  rawTitle: string,
  config: Pick<
    AutoTagConfig,
    | 'useStructuredMetadata'
    | 'parseFeatured'
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
```

> Note: `resolveLocalTags`'s `Pick` omits `featuredHandling` in the signature for
> the test's structural typing, but the body reads `config.featuredHandling`.
> Change the `Pick` union to also include `'featuredHandling'` so it typechecks:
> add `| 'featuredHandling'` to the `Pick`. (The test passes a full-ish object
> cast `as never`, so it stays green.)

Update `enrich` to accept a verify target + config and use `selectVerifiedMatch`
when `requireVerifiedMatch` is on (else keep `selectBestMatch`):

```ts
export async function enrich(
  ytNorm: TrackTags,
  config: AutoTagConfig,
  services: Pick<TransformServices, 'fetch' | 'log' | 'reportProgress'>,
  target: VerifyTarget
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
    `MusicBrainz match: "${match.artist ?? '?'} – ${match.title}" (score ${match.score}/100)`
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
```

Update `resolveAutoTag` to forward the new `target` argument (add `target: VerifyTarget` param and pass it to `enrich`), and update its call to `enrich(ytNorm, config, services)` → `enrich(ytNorm, config, services, target)`.

Rewrite `run()`:

```ts
  async run(ctx: TrackContext, config: AutoTagConfig, services: TransformServices): Promise<void> {
    const ytTags = readTrackTags(ctx.workingFile)
    // Build the source: prefer the info.json captured at download; on the
    // re-trigger path (no sidecar) synthesize one from the file's own tags.
    const src: SourceMetadata = ctx.info.source ?? {
      artist: ytTags.artist,
      track: ytTags.title,
      album: ytTags.album
    }
    const local = resolveLocalTags(src, ctx.info.rawTitle || ytTags.title || '', config)
    // Safe baseline first, so a skip-on-failure still yields good local tags.
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
    if (cover) embedCover(ctx.workingFile, cover, 'image/jpeg')
    ctx.tags = mergeTags(local, mbTags, config.primarySource)
    logTagSummary(ctx.tags, !!cover, config.primarySource, services.log)
  }
```

> `mergeTags` currently takes `(yt, mb, primarySource)`; pass `local` as the `yt`
> argument — its meaning is "the local/non-MB side". No signature change needed.

- [ ] **Step 5: Run the auto-tag tests**

Run: `pnpm test src/main/transforms/auto-tag.test.ts`
Expected: PASS (existing + 3 new orchestration tests).

> If an existing `enrich`/`resolveAutoTag` test breaks on the new required
> `target` arg, update that test to pass a target, e.g.
> `{ durationSec: 200, artist: 'X', title: 'Y' }`.

- [ ] **Step 6: Full typecheck + lint + test**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS across the board.

- [ ] **Step 7: Commit**

```bash
git diff --cached --quiet && git add src/main/transforms/auto-tag.ts src/main/transforms/auto-tag.test.ts && git commit -m "feat(auto-tag): orchestrate source-aware extraction with verified matching"
```

---

## Task 10: Robustness corpus (locks in real-world coverage)

**Files:**
- Create: `src/main/title-parser.corpus.test.ts`

- [ ] **Step 1: Write the corpus test**

```ts
// src/main/title-parser.corpus.test.ts
import { describe, it, expect } from 'vitest'
import { parseTitle } from './title-parser'
import type { SourceKind } from './channel-classifier'

interface Case {
  title: string
  kind?: SourceKind
  channel?: string
  artist: string | null
  expectTitle: string
  featured?: string[]
  version?: string
}

const CASES: Case[] = [
  { title: 'Daft Punk - Around the World', artist: 'Daft Punk', expectTitle: 'Around the World' },
  { title: 'Daft Punk – Around the World (Official Video)', artist: 'Daft Punk', expectTitle: 'Around the World' },
  { title: 'Adele - Hello [Official Music Video]', artist: 'Adele', expectTitle: 'Hello' },
  { title: '01. Tame Impala - The Less I Know The Better', artist: 'Tame Impala', expectTitle: 'The Less I Know The Better' },
  { title: 'Eminem - Stan ft. Dido', artist: 'Eminem', expectTitle: 'Stan', featured: ['Dido'] },
  { title: 'Calvin Harris - Feel So Close (feat. Example & Friend)', artist: 'Calvin Harris', expectTitle: 'Feel So Close', featured: ['Example', 'Friend'] },
  { title: 'Avicii - Levels (Skrillex Remix)', artist: 'Avicii', expectTitle: 'Levels', version: 'Skrillex Remix' },
  { title: 'Nirvana - Come As You Are (Live)', artist: 'Nirvana', expectTitle: 'Come As You Are', version: 'Live' },
  { title: 'The Weeknd | Blinding Lights', artist: 'The Weeknd', expectTitle: 'Blinding Lights' },
  { title: 'Blinding Lights', kind: 'official-artist', channel: 'The Weeknd', artist: 'The Weeknd', expectTitle: 'Blinding Lights' },
  { title: 'Just A Vibe (Lyrics)', kind: 'generic', artist: null, expectTitle: 'Just A Vibe' },
  { title: 'YOASOBI - アイドル', artist: 'YOASOBI', expectTitle: 'アイドル' }
]

describe('title parser corpus', () => {
  for (const c of CASES) {
    it(`parses: ${c.title}`, () => {
      const r = parseTitle(c.title, { kind: c.kind, channelName: c.channel })
      expect(r.artist).toBe(c.artist)
      expect(r.title).toBe(c.expectTitle)
      if (c.featured) expect(r.featured).toEqual(c.featured)
      if (c.version) expect(r.version).toBe(c.version)
    })
  }
})
```

- [ ] **Step 2: Run the corpus**

Run: `pnpm test src/main/title-parser.corpus.test.ts`
Expected: PASS. For any failing case, refine the regexes in `title-parser.ts`
(separators, NOISE, VERSION, FEAT) — do **not** weaken the assertion. Re-run until
green.

- [ ] **Step 3: Full suite + typecheck + lint**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git diff --cached --quiet && git add src/main/title-parser.corpus.test.ts && git commit -m "test(metadata): real-world title parser corpus"
```

---

## Self-Review Notes (already reconciled)

- **Spec coverage:** source capture (Task 2), classification (Task 3),
  similarity util (Task 1), rich parser (Task 4), fusion (Task 5),
  verified matching (Task 6), pipeline wiring (Task 7), expanded config +
  i18n (Task 8), orchestration + re-trigger fallback (Task 9), corpus (Task 10).
- **Type consistency:** `MbMatch.lengthMs`, `selectVerifiedMatch`, `VerifyTarget`,
  `FusedTags`/`fusedToTags`, `resolveLocalTags`, and `SourceMetadata` names are
  used identically across tasks. `enrich`/`resolveAutoTag` gain a `target` arg
  consistently.
- **Re-trigger path:** Task 9 `run()` synthesizes `src` from file tags when
  `ctx.info.source` is absent, so re-running transforms on a downloaded track
  works without a sidecar (duration-less verify → name-only gate).
- **Indie fallback:** baseline `ctx.tags` is set from local fusion before any
  network call; an unverified/failed MB lookup keeps it.
