# Robust YouTube Metadata Extraction & Verified Matching

**Date:** 2026-06-02
**Status:** Approved — ready for implementation planning

## Problem

Plucker downloads MP3s from an enormous variety of YouTube videos: some are
clean YouTube Music / "Topic" uploads with full structured metadata, some are
VEVO/label uploads titled `Artist - Title (Official Video)`, some are official
artist channels where the title is *just the song title*, and many are generic
uploads with only a free-form title (or `artist - song title` in any of a dozen
formats). The current extraction is too naive to handle this spread:

1. **The `.info.json` is thrown away.** The pipeline's `readSidecar`
   (`src/main/pipeline.ts`) reads only `id` and `title`, discarding yt-dlp's
   structured `artist` / `track` / `album` / `release_year` / `description` /
   `channel` / `uploader` / `duration` / `categories` — the single most reliable
   signal, especially for Topic / YT Music uploads.
2. **`parseTitle` is a one-trick split.** `src/main/title-parser.ts` splits on the
   first ` - ` and strips trailing `(...)`/`[...]`. It misses feat./remix
   handling, reversed order, multi-artist separators, alternate separators
   (`–`, `—`, `|`, `:`, CJK brackets), leading track indices, and the fact that
   on an official artist channel the title is often *only* the song title.
3. **MusicBrainz matching is unverified.** `auto-tag` searches
   `artist:"X" AND recording:"Y"` and accepts the highest *MB-reported* relevance
   score above a threshold, with no cross-check against the actual audio
   (duration) or against what we extracted (fuzzy artist/title). This produces
   confident-but-wrong overrides on common titles and has no graceful path for
   indie/custom tracks that exist on no external service.

## Goal

Reliably derive `{ artist, title, album, year, trackNumber, genre, feat,
version/remix, cover }` from wildly varying videos, then **verify and enrich
against MusicBrainz only when it is provably the same recording** — otherwise
keep honest, fully-populated best-effort local tags.

## Decisions (locked during brainstorming)

- **Match source:** MusicBrainz only — no new external services — but made
  *verified* (duration + name agreement) instead of trusting MB's raw score.
- **Architecture:** grown *inside* the existing `auto-tag` transform — no new
  transform stage or pre-transform layer. Pure logic is still factored into
  small, named, unit-tested modules (per `CLAUDE.md`), orchestrated by `auto-tag`.
- **Match gate:** an MB result may override locally-extracted artist/title/album
  **only if** the recording duration is within ~±5s of the downloaded audio
  **and** the artist/title fuzzily agree with the local extraction. Otherwise
  fall back to local tags.
- **Indie/custom fallback:** when nothing verifies, emit the fully-populated
  fused local result (cleaned title, extracted artist, feat./remix split out,
  YouTube thumbnail cover, channel/uploader as last-resort artist). Never leave a
  track mistagged from a bad match.
- **Expanded configuration:** `auto-tag` becomes meaningfully more configurable.
  The new parse/fusion/verification behavior is exposed through the existing
  transform config-schema mechanism (so it renders in the transform settings UI
  and persists per-instance), not hidden behind internal constants. See
  [Configuration](#configuration).

## Core idea

Stop treating the title as the primary signal. Instead:

```
classify the source  →  interpret every other signal accordingly
                      →  fuse into a confidence-scored local candidate (safe baseline)
                      →  let MusicBrainz override only when it provably matches
                      →  else keep the fused local candidate
```

### The signal hierarchy

`classifySource()` buckets each video; the bucket sets both the parse strategy
and the per-field trust used during fusion:

| Source kind | How detected | What the title means | Trust |
|---|---|---|---|
| **topic** (Topic / YT Music) | uploader ends ` - Topic`; "Provided to YouTube by" in description | ignore title; yt-dlp's structured `artist`/`track`/`album`/`release_year` are clean | highest |
| **vevo** / **label** | uploader/channel matches VEVO or known-label patterns | `Artist - Title (Official …)` | high |
| **official-artist** | `channel`/`uploader` ≈ the artist name | title is often *just the Title* → artist = channel name | high for artist, medium for title |
| **generic** (incl. compilation) | none of the above | pure title parsing; both artist/title orders possible | low |

## Components

All new modules are pure where possible, kebab-case filenames, camelCase exports,
each with a colocated `*.test.ts`. They are **orchestrated by `auto-tag`** — no new
transform.

1. **`src/main/source-metadata.ts`** — `extractSourceMetadata(infoJson) → SourceMetadata`.
   Pulls the full useful field set out of the yt-dlp `.info.json`:
   - structured: `artist`, `track`, `album`, `release_year`, `creator`/`composer`,
     `genre`, `track_number`
   - context: `uploader`, `channel`, `channelId`/`uploaderId`, `description`,
     `categories`, `tags`, `duration`
   Tolerant of missing fields; every field optional.

2. **`src/main/channel-classifier.ts`** — `classifySource(src) → SourceKind`
   (`'topic' | 'vevo' | 'label' | 'official-artist' | 'generic'`), per the table
   above.

3. **`src/main/title-parser.ts`** (rewritten in place) —
   `parseTitle(title, { kind, channelName }) → ParsedTitle`:
   - normalize separators: `-`, `–`, `—`, `|`, `:`, `~`, `「」`, `【】`, `《》`, quotes
   - strip a noise-token list: Official Video/Audio/Music Video, Lyric(s)/Lyric
     Video, Visualizer, HD/4K, MV, Full Album, Color Coded, Audio, etc.
   - extract `featured: string[]` from feat./ft./featuring/`(with X)`
   - extract `version` from `(… Remix)`/`(… Edit)`/`(Live)`/`(Acoustic)`/
     `(Sped Up)`/`(Slowed)` and `- … Remix`
   - strip leading track indices: `01.`, `1)`, `#3`, `1 -`
   - split multi-artist on `,`, `&`, `x`, `vs`, plus the extracted feats
   - resolve which side is artist using `kind`/`channelName` (e.g. official-artist
     → title-only, artist = channel)
   `ParsedTitle` grows to carry `featured` and `version` (extends the existing
   `{ artist, title }` shape in `src/shared/types.ts`).

4. **`src/shared/string-similarity.ts`** — normalized token-set similarity
   (lowercase, strip punctuation/diacritics, compare token sets) returning 0..1.
   Shared util reused by fusion and verification. Colocated test.

5. **`src/main/metadata-fusion.ts`** — `fuseMetadata(src, parsed, kind) → FusedTags`,
   where each field carries `{ value, source, confidence }`. Precedence per field:
   trustworthy structured info.json field (gated by `kind`) > title-parse result
   (weighted by `kind`) > channel/uploader (artist only, last resort). Produces the
   safe local baseline plus the confidence used by the match gate.

6. **`src/main/mb-verify.ts`** — `verifyMatch(mbRecording, { durationSec, artist,
   title }) → boolean`. Accept only if recording length is within ±5s of
   `durationSec` **and** `string-similarity` of artist and title both clear a
   threshold. When the MB recording has no `length`, the duration check is
   inconclusive → require a *stronger* name-agreement threshold instead of
   auto-rejecting. MB search is widened to fetch the top N recordings; we pick the
   best *verified* candidate rather than the first above `minMatchScore`.

## Configuration

`AutoTagConfig` is expanded so the new behavior is user-tunable through the
existing `ConfigField` schema (`src/shared/transforms.ts`) — every field renders
generically in the transform settings UI and persists per-instance. All new
fields need matching `labelKey` entries in the `transforms.autoTag.fields.*` /
`transforms.autoTag.options.*` i18n namespaces (en + de).

**Existing fields (kept):** `primarySource` (enum youtube/musicbrainz),
`enrichWithMusicBrainz` (bool), `fetchCoverArt` (bool), `fetchGenre` (bool),
`fetchTrackNumber` (bool), `minMatchScore` (number 0–100).

**New — parsing / fusion:**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `useStructuredMetadata` | bool | `true` | Trust yt-dlp structured `artist`/`track`/`album` from info.json (Topic/YT-Music) over title parsing. |
| `parseFeatured` | bool | `true` | Split `feat.`/`ft.`/`with` artists out of the title. |
| `featuredHandling` | enum | `keep-in-title` | What to do with featured artists: `keep-in-title` \| `append-to-artist` \| `drop`. |
| `parseVersion` | bool | `true` | Detect Remix/Edit/Live/Acoustic/Sped-Up and keep it in the title (vs strip as noise). |
| `stripNoiseTokens` | bool | `true` | Remove Official Video/Audio, Lyrics, Visualizer, HD/4K, MV, etc. |
| `channelArtistFallback` | enum | `official-only` | When to use channel/uploader as the artist: `official-only` (just official-artist channels) \| `always` (any time artist is unknown) \| `never`. |

**New — verification gate:**

| Field | Type | Default | Purpose |
|---|---|---|---|
| `requireVerifiedMatch` | bool | `true` | Gate MB override on the duration + name check. Off = legacy score-only behavior. |
| `durationToleranceSec` | number | `5` (0–30) | Max allowed gap between MB recording length and the audio. |
| `nameSimilarityThreshold` | number | `70` (0–100) | Minimum fuzzy artist+title agreement to accept a match. |

Defaults reproduce the recommended behavior from the brainstorming decisions, so
an untouched config "just works"; power users can loosen the gate, change
featured-artist handling, or fall back to legacy matching. `auto-tag`'s
`defaultConfig` and `CONFIG_SCHEMA` are extended accordingly, and the modules
(`title-parser`, `metadata-fusion`, `mb-verify`) take the relevant options as
parameters so they stay pure and unit-testable.

## Data-flow change in the pipeline

- **`readSidecar` (`src/main/pipeline.ts`)** reads the rich `.info.json` object
  (via `extractSourceMetadata`) instead of just `{ id, title }`.
- **`TrackContext.info` (`src/main/transforms/types.ts`)** gains an optional
  `source?: SourceMetadata` (carrying `duration` for the verification gate). The
  existing `rawTitle`/`videoId` stay for backward compatibility and for the
  re-trigger path, which has no fresh sidecar.
- **Re-trigger path** (re-running transforms on an already-downloaded track):
  there is no `.info.json` to read, so `source` is absent. `auto-tag` must degrade
  gracefully — fall back to reading the file's existing ID3 tags + `rawTitle`,
  classify as `generic`, and still parse/fuse. Duration for verification then
  comes from probing the file (already available in that flow) when present, else
  the gate falls back to name-only agreement.
- **Output filename template** (`%(artist,uploader)s - %(track,title)s`) is
  unchanged; the rename transform derives the final name from the resolved tags as
  it does today.

## `auto-tag` orchestration (the only behavioral rewire)

```
read source (info.json or, on re-trigger, file tags + rawTitle)
  → classifySource
  → parseTitle(title, { kind, channelName })
  → fuseMetadata  → fully-populated local candidate (the safe baseline; set ctx.tags)
  → if enrichWithMusicBrainz:
        search MB (top N) with fused artist/title
        → verifyMatch each against duration + fused name
        → pick best verified
        → if verified: MB fills gaps / overrides per existing `primarySource`
          else:        keep fused local candidate
  → cover: real Cover Art Archive art only on a verified match, else YouTube thumbnail
  → log tag summary (unchanged shape)
```

The cache-first wrapper (`resolveAutoTag`) and the content-hash cache are
preserved; only the inputs to the MB lookup and the accept/reject logic change.

## Error handling

- Every new module tolerates absent/garbage input and returns a usable partial
  result rather than throwing — `auto-tag`'s `failureMode: 'skip'` already keeps a
  transform failure from killing the download, and the fused local baseline is set
  on `ctx.tags` *before* any network call so a thrown MB lookup still yields good
  tags.
- MB network/HTTP failures keep the fused local candidate (current behavior).

## Testing — what proves "robust"

The heart of this work is a **fixture corpus** of ~40–60 real-world
title/channel/source combinations → expected classification + parse + fusion,
covering at minimum:

- Topic / "Provided to YouTube by" uploads (structured fields win)
- VEVO and label `Artist - Title (Official Video)`
- Official artist channel with **title-only** video (artist = channel)
- `feat.` / `ft.` / `featuring` / `(with X)` in title and in parens
- Remix / Edit / Live / Acoustic / Sped Up / Slowed versions
- `Title by Artist`, `Artist: Title`, `Artist 'Title'`
- Reversed order (`Title - Artist`)
- Alternate separators incl. CJK brackets `【】「」《》` and `|` `~`
- Leading track indices `01. `, `1) `, `#3`
- Multi-artist (`A, B & C`, `A x B`, `A vs B`)
- Lyric/visualizer/HD noise tokens
- Indie one-offs with no plausible MB match (must keep clean local tags)

Each pure module is TDD'd against the corpus. `mb-verify` is unit-tested with
synthetic MB recordings (matching/mismatched duration, near/far names, missing
length). `auto-tag` integration tests cover: verified override, unverified →
local fallback, MB network failure → local, and the re-trigger (no-sidecar) path.

## Out of scope (YAGNI)

- Additional external services (iTunes/Deezer/Spotify).
- Surfacing the computed source-kind / per-field confidence in the UI (the new
  settings are user inputs; the internal confidence stays internal).
- Changing the download format/quality pipeline or the rename template.
