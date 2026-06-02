# Design: "Analyze key & BPM" transform

Date: 2026-06-02
Status: Approved

## Goal

Add a transform that analyzes a track's audio to estimate the musical **key**
and **tempo (BPM)** it is (mostly) in, and writes those values to the file's ID3
tags. Estimation is "mostly right" — strong on clear tonal / steady-tempo
material, weaker on ambiguous tracks — which matches the intended use.

## Decisions (locked during brainstorming)

- **Detection method:** pure-TypeScript DSP run over PCM decoded by the
  already-bundled `ffmpeg` (`ffmpeg-static`). No new native binary, cross-platform
  for free, fully unit-testable, consistent with the existing ffmpeg-only pipeline.
- **Packaging:** a single transform (`analyze-key-bpm`) with per-feature toggles.
  One PCM decode is shared between the key and BPM analyses.
- **Key notation:** both **musical** (`Am`, `F#`) and **Camelot** (`8A`, `11B`).
- **Existing tags:** **always overwrite** with freshly analyzed values.
- **Camelot placement:** a dedicated `TXXX:CAMELOT` user-defined frame (not the
  comment field).

## Architecture

Small, isolated, independently testable units. Pure UI-agnostic math lives in
`src/shared/`; ffmpeg / I/O lives in `src/main/` (per `CLAUDE.md`). Each module
gets a colocated `*.test.ts`.

### Pure / shared (`src/shared/`)

- **`fft.ts`** — radix-2 Cooley–Tukey FFT over a `Float32Array`. Pure, reusable.
  Tested against known transforms (DC, single bin, impulse).
- **`chroma.ts`** — windowed PCM → 12-bin chromagram, then key estimation by
  correlating the averaged chroma against Krumhansl–Schmuckler major/minor
  profiles across all 24 keys. Exports `estimateKey(pcm, sampleRate): string`
  returning e.g. `"Am"` / `"C"`. Pure (operates on the decoded sample array).
- **`tempo.ts`** — spectral-flux onset envelope → autocorrelation over the
  configured tempo range → octave-fold to BPM. Exports
  `estimateBpm(pcm, sampleRate, { minBpm, maxBpm }): number` returning a rounded
  integer. Pure.
- **`camelot.ts`** — pure `keyToCamelot(key: string): string | undefined`
  lookup (e.g. `"Am" → "8A"`, `"C" → "8B"`). Full 24-key table.

### Main / I/O (`src/main/`)

- **`audio-pcm.ts`** — ffmpeg-backed decode of a media file to a mono
  `Float32Array` at a low analysis sample rate (default **11025 Hz**) via
  `-ac 1 -ar 11025 -f f32le -`, collecting stdout. Injectable deps mirror
  `audio-trim.ts`'s testable shape (the orchestration is unit-tested without a
  real ffmpeg; the real implementation is a thin `spawnManaged` wrapper).
- **`transforms/analyze-key-bpm.ts`** — the transform definition. `run()`
  decodes the working file once, runs the enabled analyses, and writes the tags.
  Injectable deps (decode / estimateKey / estimateBpm / writeTags) so the
  orchestration is testable with fakes.
- **`tagger.ts`** — add `writeAnalysisTags(file, { key?, camelot?, bpm? })`: a
  single `NodeID3.update` writing `initialKey` (TKEY), `bpm` (TBPM, integer
  string), and a `userDefinedText` TXXX frame with description `"CAMELOT"`.
  Only writes the fields that are present.

### Registration & UI wiring

- Register `analyzeKeyBpmTransform` in `src/main/transforms/registry.ts`.
- Add i18n strings under `transforms.analyzeKeyBpm` in
  `src/renderer/src/i18n/locales/en.ts` and `de.ts` (label, description, field
  labels). The generic config form renders from the manifest's `configSchema`.

## Data flow

```
run(ctx, config, services)
  pcm = decodePcm(services.bin.ffmpeg, ctx.workingFile, 11025)   // once
  if config.detectKey:
      key     = estimateKey(pcm, 11025)        // "Am"
      camelot = keyToCamelot(key)              // "8A"
  if config.detectBpm:
      bpm = estimateBpm(pcm, 11025, { minBpm, maxBpm })  // 124
  writeAnalysisTags(ctx.workingFile, { key, camelot, bpm })  // direct, like square-cover
```

Tags are written **directly to the working file** (mirroring how `square-cover`
embeds the cover). The chain's later `tryFlushTags` does a *partial*
`NodeID3.update` of the standard `TrackTags` fields, which does not include
`TKEY` / `TBPM` / `TXXX`, so it will not clobber the analysis frames. As a
result **no changes to `TrackTags`, the metadata cache, or `mergeTags` are
needed**.

## Tag mapping

| Value        | Frame              | Example |
| ------------ | ------------------ | ------- |
| Musical key  | `TKEY` / `initialKey` | `Am`, `F#` |
| Camelot key  | `TXXX:CAMELOT`     | `8A`, `11B` |
| Tempo (BPM)  | `TBPM` / `bpm`     | `124` |

## Config (manifest)

| Key        | Type    | Default | Notes |
| ---------- | ------- | ------- | ----- |
| `detectKey`| boolean | `true`  | Estimate + write musical & Camelot key. |
| `detectBpm`| boolean | `true`  | Estimate + write BPM. |
| `minBpm`   | number  | `70`    | Lower bound of the octave-fold range. |
| `maxBpm`   | number  | `180`   | Upper bound of the octave-fold range. |

Transform flags: `apiVersion: 1`, `allowMultiple: false`, `failureMode: 'skip'`
(a failed analysis must not abort the chain or lose other tags).

## Testing

- **`fft.ts`** — DC, single-frequency bin, impulse → flat spectrum.
- **`chroma.ts`** — synthesized sine/triad at a known pitch resolves to the
  expected key; silence/noise returns a defined fallback.
- **`tempo.ts`** — synthesized click train at a known interval (e.g. 120 BPM)
  resolves within ±1 BPM; the fold range pulls a half/double-tempo estimate back
  into range.
- **`camelot.ts`** — full 24-key round-trip table; unknown input → `undefined`.
- **`tagger.test.ts`** — write then read back `initialKey`, `bpm`, and the
  `CAMELOT` TXXX frame.
- **`audio-pcm.test.ts`** — correct ffmpeg args; stdout bytes parsed into the
  expected `Float32Array`.
- **`analyze-key-bpm.test.ts`** — with injected fakes: respects `detectKey` /
  `detectBpm` toggles; passes the BPM range through; tolerates decode/estimate
  failures without throwing (skip semantics).

## Out of scope

- Surfacing key/BPM in the track-detail panel or metadata-cache UI.
- Studio-grade accuracy / multiple-candidate key results.
- Non-mp3 tag containers (the chain is mp3-oriented today).
