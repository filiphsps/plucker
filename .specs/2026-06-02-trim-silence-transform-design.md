# Trim-silence transform — design

**Date:** 2026-06-02
**Status:** Approved, ready for implementation plan

## Summary

Add a new audio transform that trims leading and/or trailing silence from a
downloaded track via ffmpeg's `silenceremove` filter. The threshold and minimum
silence duration are configurable, and the trim location (start, end, both, or
none) is selectable. **Multiple instances of this transform are allowed** in a
chain. It ships **enabled by default** trimming **both** ends, but with a
threshold tuned to true/100% digital silence so only genuinely silent regions are
removed.

This is the **first transform that rewrites the audio stream itself** — existing
transforms (`auto-tag`, `rename`, `square-cover`) only touch tags or the embedded
cover. `run-chain.ts` already supports reassigning `ctx.workingFile`, so the chain
runner needs no changes.

## Goals

- Trim leading/trailing silence with configurable threshold and min duration.
- Selectable mode: `start`, `end`, `both`, or `none`.
- Allow multiple instances in a single chain.
- Default-on (`both`), but only removing true/100% silence by default.
- Never degrade a track that has no trimmable silence (no needless re-encode).

## Non-goals

- Removing silence _within_ a track (only the very start/end are trimmed).
- Loudness normalization or any other audio processing.
- Per-format handling beyond mp3 (the working file is always mp3 in this pipeline).

## Modules

Following the existing `image-crop.ts` → `square-cover.ts` split (pure logic
separated from ffmpeg subprocess I/O):

### `src/shared/silence-filter.ts` (+ `silence-filter.test.ts`)

Pure, I/O-free. Builds the ffmpeg filtergraph string.

```ts
export type TrimMode = 'both' | 'start' | 'end' | 'none'

export interface SilenceFilterOpts {
  mode: TrimMode
  thresholdDb: number // e.g. -90
  minDurationSec: number // e.g. 0.1
}

/** Returns the ffmpeg -af filtergraph, or null when mode is 'none'. */
export function silenceRemoveFilter(opts: SilenceFilterOpts): string | null
```

`silenceremove` only trims _leading_ silence natively; trailing silence uses the
standard reverse-trim-reverse trick:

- **start** → `silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1`
- **end** → `areverse,silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,areverse`
- **both** → the start filter chained with the reversed end filter.
- **none** → returns `null` (caller short-circuits, no ffmpeg run).

`src/shared/` (not `src/main/`) because it is pure and plausibly reusable; it has
no Node/ffmpeg dependency.

### `src/main/audio-trim.ts` (+ `audio-trim.test.ts`)

Wraps the ffmpeg subprocess, mirroring `cropToSquare`'s `spawnManaged` pattern.

```ts
export interface TrimResult {
  /** Path to the trimmed file, or the original path when nothing was trimmed. */
  file: string
  trimmed: boolean
}

export function trimSilence(
  ffmpegPath: string,
  inputFile: string,
  opts: SilenceFilterOpts,
  signal?: AbortSignal
): Promise<TrimResult>
```

**Probe-first behavior (option A):** before re-encoding, run a quick
`silencedetect` pass to measure leading/trailing silence. If neither end has
silence longer than `minDurationSec`, **return the original file untouched**
(`trimmed: false`) — the track stays bit-identical, no lossy re-encode.

When there _is_ something to trim:

1. Probe the source bitrate (ffprobe / ffmpeg), falling back to `320k`.
2. Run ffmpeg with `-af <filtergraph>` re-encoding via `libmp3lame` at the source
   bitrate, writing to a sibling temp file (e.g. `<input>.trim.mp3`).
3. Return the temp path with `trimmed: true`.

ffprobe path comes from the same bundled-binaries set as ffmpeg
(`services.bin`); confirm the ffprobe binary is bundled during implementation and,
if not, derive silence bounds from `ffmpeg -af silencedetect -f null -` stderr
instead (no extra binary needed). The implementation plan resolves this.

### `src/main/transforms/trim-silence.ts` (+ `trim-silence.test.ts`)

The `TransformDefinition`.

```ts
export interface TrimSilenceConfig {
  mode: TrimMode
  thresholdDb: number
  minDurationSec: number
}
```

- `type: 'trim-silence'`
- `allowMultiple: true`
- `failureMode: 'skip'` (a trim failure should never lose the download)
- `run()`:
  - If `mode === 'none'` → return immediately.
  - Otherwise call `trimSilence(services.bin.ffmpeg, ctx.workingFile, config, services.signal)`.
  - If `result.trimmed`, atomically replace the working file with the trimmed
    temp (rename temp over `ctx.workingFile`, keeping the same path) **or** reassign
    `ctx.workingFile` to the temp path and remove the old one. Implementation plan
    picks whichever is cleanest; both are supported by `run-chain.ts`.

### Registration & defaults

- `src/main/transforms/registry.ts` — add `trimSilenceTransform` to `BUILTINS`.
- `src/shared/defaults.ts` — add to `DEFAULT_TRANSFORMS`. Placement: **before**
  `square-cover`/`rename` is irrelevant since it only rewrites audio; place it
  early (e.g. right after `auto-tag`) so later tag/cover steps act on the trimmed
  file. Default config:

  ```ts
  {
    instanceId: 'trim-silence-default',
    type: 'trim-silence',
    enabled: true,
    config: { mode: 'both', thresholdDb: -90, minDurationSec: 0.1 }
  }
  ```

### i18n

Add label/description/field strings to `src/renderer/src/i18n/locales/en.ts` and
`de.ts`, matching the `transforms.squareCover.*` / `transforms.rename.*` shape:

- `transforms.trimSilence.label`
- `transforms.trimSilence.description`
- `transforms.trimSilence.fields.mode` (+ option labels: both/start/end/none)
- `transforms.trimSilence.fields.thresholdDb`
- `transforms.trimSilence.fields.minDurationSec`
- stage/transform labels if a separate label map exists (mirror square-cover).

## Config schema (for the renderer form)

```ts
const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: 'mode',
    labelKey: 'transforms.trimSilence.fields.mode',
    type: 'enum',
    default: 'both',
    options: [
      { value: 'both', labelKey: 'transforms.trimSilence.modes.both' },
      { value: 'start', labelKey: 'transforms.trimSilence.modes.start' },
      { value: 'end', labelKey: 'transforms.trimSilence.modes.end' },
      { value: 'none', labelKey: 'transforms.trimSilence.modes.none' }
    ]
  },
  {
    key: 'thresholdDb',
    labelKey: 'transforms.trimSilence.fields.thresholdDb',
    type: 'number',
    default: -90,
    min: -120,
    max: 0
  },
  {
    key: 'minDurationSec',
    labelKey: 'transforms.trimSilence.fields.minDurationSec',
    type: 'number',
    default: 0.1,
    min: 0
  }
]
```

## Data flow

```
run-chain → trimSilenceTransform.run(ctx, config, services)
  └─ mode === 'none'? → return (no-op)
  └─ trimSilence(ffmpeg, ctx.workingFile, config, signal)
       ├─ probe silencedetect → leading/trailing silence durations
       ├─ none past minDurationSec? → return { file: input, trimmed: false }
       └─ else re-encode with silenceRemoveFilter(config) at source bitrate
            → { file: temp, trimmed: true }
  └─ trimmed? → working file becomes the trimmed file
```

## Error handling

- `failureMode: 'skip'` — any ffmpeg/probe error logs and leaves the download
  intact (original working file untouched).
- Abort via `services.signal` propagates to `spawnManaged` (SIGKILL), same as
  every other subprocess.
- Broken-pipe / early-exit handled like `cropToSquare`'s close handler.

## Testing

- `silence-filter.test.ts` — filtergraph string for each mode; `none` → null;
  threshold/duration interpolation.
- `audio-trim.test.ts` — probe-first skip path (no trim → original returned,
  `trimmed: false`); trim path builds correct argv (inject/spy on spawn);
  abort/error propagation. Mock the subprocess as the existing image-crop test does.
- `trim-silence.test.ts` — `mode: 'none'` short-circuits without calling ffmpeg;
  trimmed result reassigns the working file; failure is swallowed (skip).
- `registry.test.ts` — `trim-silence` present, `allowMultiple: true`.
- `defaults.test.ts` — default chain includes `trim-silence` with the documented
  config and ordering.

## Open implementation details (resolved in the plan)

- ffprobe availability vs. parsing `silencedetect` stderr from ffmpeg directly.
- Whether to rename temp over the working path or reassign `ctx.workingFile`.
- Exact placement in `DEFAULT_TRANSFORMS` ordering.
