# Trim-silence Transform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable transform that trims leading/trailing digital silence from a downloaded mp3 via ffmpeg, allowing multiple instances and shipping default-on for true silence at both ends.

**Architecture:** Three new modules mirroring the existing `image-crop.ts` → `square-cover.ts` split: a pure filtergraph builder (`silence-filter.ts`), pure ffmpeg-stderr parsers + a trim decision (`ffmpeg-output.ts`), and an injectable I/O orchestrator (`audio-trim.ts`) that the `trim-silence` transform drives. Probe-first: a `silencedetect` pass decides whether to re-encode at all, so tracks with no edge silence stay bit-identical. This is the first transform to rewrite the audio stream; `run-chain.ts` already supports it (the transform renames the trimmed temp over `ctx.workingFile`).

**Tech Stack:** TypeScript, Electron (main process), vitest, bundled ffmpeg (no ffprobe — silence/duration/bitrate are parsed from ffmpeg stderr), pnpm.

---

## File Structure

- **Create** `src/shared/silence-filter.ts` — pure `silenceRemoveFilter(opts)` filtergraph builder + `TrimMode`/`SilenceFilterOpts` types.
- **Create** `src/shared/silence-filter.test.ts`
- **Create** `src/shared/ffmpeg-output.ts` — pure parsers (`parseSilenceRegions`, `parseDurationSec`, `parseBitrateKbps`) + `hasTrimmableSilence` decision.
- **Create** `src/shared/ffmpeg-output.test.ts`
- **Create** `src/main/audio-trim.ts` — `trimSilence(file, opts, deps)` orchestrator, `detectArgs`/`encodeArgs` builders, `ffmpegTrimDeps` real-I/O factory.
- **Create** `src/main/audio-trim.test.ts`
- **Create** `src/main/transforms/trim-silence.ts` — the `TransformDefinition`.
- **Create** `src/main/transforms/trim-silence.test.ts`
- **Modify** `src/main/transforms/registry.ts` — register `trimSilenceTransform`.
- **Modify** `src/main/transforms/registry.test.ts` — assert it is registered with `allowMultiple: true`.
- **Modify** `src/shared/defaults.ts` — add `trim-silence` to `DEFAULT_TRANSFORMS` (second, after auto-tag).
- **Modify** `src/shared/defaults.test.ts` — assert the new default entry; keep the square-cover-last assertion true.
- **Modify** `src/renderer/src/i18n/locales/en.ts` — `transforms.trimSilence.*`.
- **Modify** `src/renderer/src/i18n/locales/de.ts` — `transforms.trimSilence.*`.

---

## Task 1: Pure silence filtergraph builder

**Files:**
- Create: `src/shared/silence-filter.ts`
- Test: `src/shared/silence-filter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/silence-filter.test.ts
import { describe, it, expect } from 'vitest'
import { silenceRemoveFilter } from './silence-filter'

describe('silenceRemoveFilter', () => {
  it('returns null for mode none', () => {
    expect(silenceRemoveFilter({ mode: 'none', thresholdDb: -90, minDurationSec: 0.1 })).toBeNull()
  })

  it('trims only the leading silence for mode start', () => {
    const f = silenceRemoveFilter({ mode: 'start', thresholdDb: -90, minDurationSec: 0.1 })
    expect(f).toBe('silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1')
  })

  it('reverses, trims, reverses back for mode end', () => {
    const f = silenceRemoveFilter({ mode: 'end', thresholdDb: -50, minDurationSec: 0.2 })
    expect(f).toBe(
      'areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.2,areverse'
    )
  })

  it('chains start then reversed end for mode both', () => {
    const f = silenceRemoveFilter({ mode: 'both', thresholdDb: -90, minDurationSec: 0.1 })
    expect(f).toBe(
      'silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,' +
        'areverse,silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,areverse'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/silence-filter.test.ts`
Expected: FAIL — "Cannot find module './silence-filter'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/silence-filter.ts

export type TrimMode = 'both' | 'start' | 'end' | 'none'

export interface SilenceFilterOpts {
  mode: TrimMode
  /** Anything quieter than this (dB, negative) counts as silence; -90 ≈ true silence. */
  thresholdDb: number
  /** Minimum silence length, in seconds, before a region is trimmed. */
  minDurationSec: number
}

/** The leading-silence half of a silenceremove filter. */
function startFilter(thresholdDb: number, minDurationSec: number): string {
  return `silenceremove=start_periods=1:start_threshold=${thresholdDb}dB:start_duration=${minDurationSec}`
}

/**
 * ffmpeg `-af` filtergraph that trims silence at the requested ends, or null for
 * mode 'none'. silenceremove only trims *leading* silence natively, so trailing
 * silence is removed by reversing the stream, trimming the now-leading silence,
 * and reversing back.
 */
export function silenceRemoveFilter(opts: SilenceFilterOpts): string | null {
  const { mode, thresholdDb, minDurationSec } = opts
  if (mode === 'none') return null
  const start = startFilter(thresholdDb, minDurationSec)
  const end = `areverse,${start},areverse`
  if (mode === 'start') return start
  if (mode === 'end') return end
  return `${start},${end}` // both
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/silence-filter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/silence-filter.ts src/shared/silence-filter.test.ts
git commit -m "feat(transforms): add silence filtergraph builder"
```

---

## Task 2: ffmpeg-stderr parsers and trim decision

**Files:**
- Create: `src/shared/ffmpeg-output.ts`
- Test: `src/shared/ffmpeg-output.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/ffmpeg-output.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseSilenceRegions,
  parseDurationSec,
  parseBitrateKbps,
  hasTrimmableSilence
} from './ffmpeg-output'

const SAMPLE = `
Input #0, mp3, from 'track.mp3':
  Duration: 00:03:21.20, start: 0.025057, bitrate: 320 kb/s
    Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
[silencedetect @ 0x55] silence_start: 0
[silencedetect @ 0x55] silence_end: 1.5 | silence_duration: 1.5
[silencedetect @ 0x55] silence_start: 199.9
[silencedetect @ 0x55] silence_end: 201.2 | silence_duration: 1.3
`

describe('parseSilenceRegions', () => {
  it('pairs each silence_start with its silence_end', () => {
    expect(parseSilenceRegions(SAMPLE)).toEqual([
      { start: 0, end: 1.5 },
      { start: 199.9, end: 201.2 }
    ])
  })

  it('returns an empty array when there is no silence', () => {
    expect(parseSilenceRegions('no silence here')).toEqual([])
  })
})

describe('parseDurationSec', () => {
  it('parses HH:MM:SS.ss into seconds', () => {
    expect(parseDurationSec(SAMPLE)).toBeCloseTo(201.2, 1)
  })

  it('returns null when no duration is present', () => {
    expect(parseDurationSec('nope')).toBeNull()
  })
})

describe('parseBitrateKbps', () => {
  it('prefers the audio stream bitrate', () => {
    expect(parseBitrateKbps(SAMPLE)).toBe(320)
  })

  it('returns null when no bitrate is present', () => {
    expect(parseBitrateKbps('nope')).toBeNull()
  })
})

describe('hasTrimmableSilence', () => {
  const dur = 201.2
  const leading = [{ start: 0, end: 1.5 }]
  const trailing = [{ start: 199.9, end: 201.2 }]
  const mid = [{ start: 90, end: 92 }]

  it('detects leading silence for mode start', () => {
    expect(hasTrimmableSilence(leading, dur, 'start')).toBe(true)
    expect(hasTrimmableSilence(trailing, dur, 'start')).toBe(false)
  })

  it('detects trailing silence for mode end', () => {
    expect(hasTrimmableSilence(trailing, dur, 'end')).toBe(true)
    expect(hasTrimmableSilence(leading, dur, 'end')).toBe(false)
  })

  it('ignores mid-track silence', () => {
    expect(hasTrimmableSilence(mid, dur, 'both')).toBe(false)
  })

  it('mode both accepts either end', () => {
    expect(hasTrimmableSilence(leading, dur, 'both')).toBe(true)
    expect(hasTrimmableSilence(trailing, dur, 'both')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/ffmpeg-output.test.ts`
Expected: FAIL — "Cannot find module './ffmpeg-output'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/ffmpeg-output.ts
import type { TrimMode } from './silence-filter'

export interface SilenceRegion {
  start: number
  end: number
}

/** Pair `silence_start`/`silence_end` lines from ffmpeg silencedetect stderr. */
export function parseSilenceRegions(stderr: string): SilenceRegion[] {
  const regions: SilenceRegion[] = []
  let pendingStart: number | null = null
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/)
    if (s) {
      pendingStart = parseFloat(s[1])
      continue
    }
    const e = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/)
    if (e && pendingStart !== null) {
      regions.push({ start: pendingStart, end: parseFloat(e[1]) })
      pendingStart = null
    }
  }
  return regions
}

/** Parse the input `Duration: HH:MM:SS.ss` line into seconds, or null. */
export function parseDurationSec(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** Parse an audio bitrate in kb/s (stream line preferred, container fallback). */
export function parseBitrateKbps(stderr: string): number | null {
  const stream = stderr.match(/Audio:.*?(\d+)\s*kb\/s/)
  if (stream) return Number(stream[1])
  const container = stderr.match(/bitrate:\s*(\d+)\s*kb\/s/)
  return container ? Number(container[1]) : null
}

/** How close to an edge (seconds) a region must be to count as leading/trailing. */
const EDGE_EPS = 0.5

/**
 * Whether the requested mode has edge silence to trim. silencedetect only reports
 * regions already at least `minDurationSec` long, so any region starting at the
 * very beginning (leading) or ending at the very end (trailing) counts; mid-track
 * silence is ignored.
 */
export function hasTrimmableSilence(
  regions: SilenceRegion[],
  durationSec: number | null,
  mode: TrimMode
): boolean {
  const hasLeading = regions.some((r) => r.start <= EDGE_EPS)
  const hasTrailing =
    durationSec !== null && regions.some((r) => r.end >= durationSec - EDGE_EPS)
  if (mode === 'start') return hasLeading
  if (mode === 'end') return hasTrailing
  if (mode === 'both') return hasLeading || hasTrailing
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/ffmpeg-output.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/shared/ffmpeg-output.ts src/shared/ffmpeg-output.test.ts
git commit -m "feat(transforms): parse ffmpeg silence/duration/bitrate output"
```

---

## Task 3: Audio-trim orchestrator (probe-first)

**Files:**
- Create: `src/main/audio-trim.ts`
- Test: `src/main/audio-trim.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/audio-trim.test.ts
import { describe, it, expect, vi } from 'vitest'
import { trimSilence, detectArgs, encodeArgs, type TrimDeps } from './audio-trim'
import type { SilenceFilterOpts } from '../shared/silence-filter'

const BOTH: SilenceFilterOpts = { mode: 'both', thresholdDb: -90, minDurationSec: 0.1 }

const WITH_EDGE_SILENCE = `
  Duration: 00:03:21.20, start: 0.0, bitrate: 256 kb/s
    Stream #0:0: Audio: mp3, 44100 Hz, stereo, 256 kb/s
[silencedetect] silence_start: 0
[silencedetect] silence_end: 1.2 | silence_duration: 1.2
`

const NO_SILENCE = `
  Duration: 00:03:21.20, start: 0.0, bitrate: 320 kb/s
    Stream #0:0: Audio: mp3, 44100 Hz, stereo, 320 kb/s
`

describe('trimSilence', () => {
  it('returns the original file without encoding for mode none', async () => {
    const encode = vi.fn()
    const detect = vi.fn()
    const result = await trimSilence('/tmp/t.mp3', { ...BOTH, mode: 'none' }, { detect, encode })
    expect(result).toEqual({ file: '/tmp/t.mp3', trimmed: false })
    expect(detect).not.toHaveBeenCalled()
    expect(encode).not.toHaveBeenCalled()
  })

  it('skips encoding when there is no edge silence', async () => {
    const encode = vi.fn()
    const deps: TrimDeps = { detect: vi.fn(async () => NO_SILENCE), encode }
    const result = await trimSilence('/tmp/t.mp3', BOTH, deps)
    expect(result).toEqual({ file: '/tmp/t.mp3', trimmed: false })
    expect(encode).not.toHaveBeenCalled()
  })

  it('encodes to a sibling temp at the source bitrate when there is edge silence', async () => {
    const encode = vi.fn(async () => {})
    const deps: TrimDeps = { detect: vi.fn(async () => WITH_EDGE_SILENCE), encode }
    const result = await trimSilence('/tmp/t.mp3', BOTH, deps)
    expect(result).toEqual({ file: '/tmp/t.mp3.trim.mp3', trimmed: true })
    expect(encode).toHaveBeenCalledWith(
      '/tmp/t.mp3',
      '/tmp/t.mp3.trim.mp3',
      'silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,' +
        'areverse,silenceremove=start_periods=1:start_threshold=-90dB:start_duration=0.1,areverse',
      256
    )
  })
})

describe('detectArgs', () => {
  it('builds a silencedetect probe to the null muxer', () => {
    const args = detectArgs('/tmp/t.mp3', BOTH)
    expect(args).toEqual([
      '-hide_banner',
      '-i',
      '/tmp/t.mp3',
      '-af',
      'silencedetect=noise=-90dB:d=0.1',
      '-f',
      'null',
      '-'
    ])
  })
})

describe('encodeArgs', () => {
  it('re-encodes audio with the filter while copying cover and metadata', () => {
    const args = encodeArgs('/in.mp3', '/out.mp3', 'silenceremove=...', 256)
    expect(args).toContain('-map')
    expect(args).toContain('libmp3lame')
    expect(args[args.indexOf('-b:a') + 1]).toBe('256k')
    expect(args[args.indexOf('-af') + 1]).toBe('silenceremove=...')
    expect(args[args.length - 1]).toBe('/out.mp3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/audio-trim.test.ts`
Expected: FAIL — "Cannot find module './audio-trim'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/audio-trim.ts
import { spawnManaged } from './spawn'
import { silenceRemoveFilter, type SilenceFilterOpts } from '../shared/silence-filter'
import {
  parseSilenceRegions,
  parseDurationSec,
  parseBitrateKbps,
  hasTrimmableSilence
} from '../shared/ffmpeg-output'

export interface TrimResult {
  /** Path to the trimmed file, or the original path when nothing was trimmed. */
  file: string
  trimmed: boolean
}

/** Injectable I/O so the orchestration is unit-testable without a real ffmpeg. */
export interface TrimDeps {
  /** Run the silencedetect probe; resolve with the combined ffmpeg stderr. */
  detect: (file: string, opts: SilenceFilterOpts) => Promise<string>
  /** Re-encode `input` to `output`, applying `filter` at `bitrateKbps`. */
  encode: (input: string, output: string, filter: string, bitrateKbps: number) => Promise<void>
}

const FALLBACK_BITRATE_KBPS = 320

/** Args for the probe pass — stderr carries silence regions, duration and bitrate. */
export function detectArgs(file: string, opts: SilenceFilterOpts): string[] {
  return [
    '-hide_banner',
    '-i',
    file,
    '-af',
    `silencedetect=noise=${opts.thresholdDb}dB:d=${opts.minDurationSec}`,
    '-f',
    'null',
    '-'
  ]
}

/** Args for the re-encode pass — trims audio, copies the cover and tags through. */
export function encodeArgs(
  input: string,
  output: string,
  filter: string,
  bitrateKbps: number
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-map',
    '0',
    '-map_metadata',
    '0',
    '-af',
    filter,
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${bitrateKbps}k`,
    '-c:v',
    'copy',
    output
  ]
}

/**
 * Trim edge silence from `file`. Probe-first: when the requested ends have no
 * silence, the original file is returned untouched (no lossy re-encode). When
 * they do, the audio is re-encoded at the source bitrate to a sibling temp.
 */
export async function trimSilence(
  file: string,
  opts: SilenceFilterOpts,
  deps: TrimDeps
): Promise<TrimResult> {
  const filter = silenceRemoveFilter(opts)
  if (filter === null) return { file, trimmed: false } // mode 'none'

  const stderr = await deps.detect(file, opts)
  const regions = parseSilenceRegions(stderr)
  if (regions.length === 0) return { file, trimmed: false }

  const duration = parseDurationSec(stderr)
  const shouldTrim = duration === null ? true : hasTrimmableSilence(regions, duration, opts.mode)
  if (!shouldTrim) return { file, trimmed: false }

  const bitrate = parseBitrateKbps(stderr) ?? FALLBACK_BITRATE_KBPS
  const output = `${file}.trim.mp3`
  await deps.encode(file, output, filter, bitrate)
  return { file: output, trimmed: true }
}

/** Run ffmpeg, collecting stderr; resolves on close (callers check the code). */
function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  signal?: AbortSignal
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnManaged(ffmpegPath, args, {}, signal)
    let stderr = ''
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stderr }))
  })
}

/** Real ffmpeg-backed deps for {@link trimSilence}. */
export function ffmpegTrimDeps(ffmpegPath: string, signal?: AbortSignal): TrimDeps {
  return {
    detect: async (file, opts) => {
      const { stderr } = await runFfmpeg(ffmpegPath, detectArgs(file, opts), signal)
      return stderr
    },
    encode: async (input, output, filter, bitrateKbps) => {
      const { code, stderr } = await runFfmpeg(
        ffmpegPath,
        encodeArgs(input, output, filter, bitrateKbps),
        signal
      )
      if (code !== 0) throw new Error(`ffmpeg trim failed (code ${code}): ${stderr.trim()}`)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/audio-trim.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/main/audio-trim.ts src/main/audio-trim.test.ts
git commit -m "feat(transforms): add probe-first audio silence trimmer"
```

---

## Task 4: The trim-silence transform

**Files:**
- Create: `src/main/transforms/trim-silence.ts`
- Test: `src/main/transforms/trim-silence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/transforms/trim-silence.test.ts
import { describe, it, expect } from 'vitest'
import { trimSilenceTransform } from './trim-silence'

describe('trimSilenceTransform', () => {
  it('is a multiple-allowed, skip-on-failure transform with the expected type', () => {
    expect(trimSilenceTransform.type).toBe('trim-silence')
    expect(trimSilenceTransform.allowMultiple).toBe(true)
    expect(trimSilenceTransform.failureMode).toBe('skip')
  })

  it('defaults to trimming both ends at true silence', () => {
    expect(trimSilenceTransform.defaultConfig).toEqual({
      mode: 'both',
      thresholdDb: -90,
      minDurationSec: 0.1
    })
  })

  it('exposes mode, threshold and min-duration config fields', () => {
    const keys = trimSilenceTransform.configSchema.map((f) => f.key)
    expect(keys).toEqual(['mode', 'thresholdDb', 'minDurationSec'])
    const mode = trimSilenceTransform.configSchema.find((f) => f.key === 'mode')!
    expect(mode.type).toBe('enum')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/transforms/trim-silence.test.ts`
Expected: FAIL — "Cannot find module './trim-silence'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/transforms/trim-silence.ts
import { renameSync } from 'node:fs'
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import type { TrimMode } from '../../shared/silence-filter'
import { trimSilence, ffmpegTrimDeps } from '../audio-trim'

export interface TrimSilenceConfig {
  mode: TrimMode
  thresholdDb: number
  minDurationSec: number
}

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

/**
 * Trim leading/trailing silence from the working audio file. Re-encodes only
 * when there is edge silence to remove (see trimSilence), then replaces the
 * working file in place. Multiple instances are allowed (e.g. a strict pass plus
 * a looser one).
 */
export const trimSilenceTransform: TransformDefinition<TrimSilenceConfig> = {
  type: 'trim-silence',
  apiVersion: 1,
  labelKey: 'transforms.trimSilence.label',
  descriptionKey: 'transforms.trimSilence.description',
  allowMultiple: true,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: { mode: 'both', thresholdDb: -90, minDurationSec: 0.1 },
  async run(
    ctx: TrackContext,
    config: TrimSilenceConfig,
    services: TransformServices
  ): Promise<void> {
    if (config.mode === 'none') return
    const result = await trimSilence(
      ctx.workingFile,
      config,
      ffmpegTrimDeps(services.bin.ffmpeg, services.signal)
    )
    if (result.trimmed) {
      renameSync(result.file, ctx.workingFile)
      services.log(`[trim-silence] trimmed ${config.mode}`)
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/transforms/trim-silence.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/trim-silence.ts src/main/transforms/trim-silence.test.ts
git commit -m "feat(transforms): add trim-silence transform"
```

---

## Task 5: Register the transform

**Files:**
- Modify: `src/main/transforms/registry.ts`
- Test: `src/main/transforms/registry.test.ts`

- [ ] **Step 1: Update the test to expect registration**

Add to the first `it` block in `src/main/transforms/registry.test.ts`, after the `square-cover` assertion (line 10):

```ts
    expect(r.get('trim-silence')?.type).toBe('trim-silence')
    expect(r.get('trim-silence')?.allowMultiple).toBe(true)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/main/transforms/registry.test.ts`
Expected: FAIL — `r.get('trim-silence')` is undefined.

- [ ] **Step 3: Register the transform**

In `src/main/transforms/registry.ts`, add the import beside the others:

```ts
import { trimSilenceTransform } from './trim-silence'
```

and add it to `BUILTINS`:

```ts
const BUILTINS: TransformDefinition[] = [
  autoTagTransform as unknown as TransformDefinition,
  trimSilenceTransform as unknown as TransformDefinition,
  renameTransform as unknown as TransformDefinition,
  squareCoverTransform as unknown as TransformDefinition
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/main/transforms/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/registry.ts src/main/transforms/registry.test.ts
git commit -m "feat(transforms): register trim-silence in the catalog"
```

---

## Task 6: Add to the default chain

**Files:**
- Modify: `src/shared/defaults.ts`
- Test: `src/shared/defaults.test.ts`

- [ ] **Step 1: Add the default-chain test**

Add this `it` block inside the `describe('DEFAULT_TRANSFORMS', ...)` in `src/shared/defaults.test.ts`:

```ts
  it('includes trim-silence (both ends, true silence) right after auto-tag', () => {
    const entry = DEFAULT_TRANSFORMS[1]
    expect(entry.type).toBe('trim-silence')
    expect(entry.enabled).toBe(true)
    expect(entry.config).toEqual({ mode: 'both', thresholdDb: -90, minDurationSec: 0.1 })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shared/defaults.test.ts`
Expected: FAIL — `DEFAULT_TRANSFORMS[1].type` is `'rename'`, not `'trim-silence'`.

- [ ] **Step 3: Insert the default entry**

In `src/shared/defaults.ts`, insert this object into `DEFAULT_TRANSFORMS` between the `auto-tag-default` entry and the `rename-default` entry (i.e. as the new second element):

```ts
  {
    instanceId: 'trim-silence-default',
    type: 'trim-silence',
    enabled: true,
    config: { mode: 'both', thresholdDb: -90, minDurationSec: 0.1 }
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shared/defaults.test.ts`
Expected: PASS — both the new test and the existing "square-cover last" test (square-cover is still the final element).

- [ ] **Step 5: Commit**

```bash
git add src/shared/defaults.ts src/shared/defaults.test.ts
git commit -m "feat(transforms): trim silence by default on new downloads"
```

---

## Task 7: Localized labels (English + German)

**Files:**
- Modify: `src/renderer/src/i18n/locales/en.ts`
- Modify: `src/renderer/src/i18n/locales/de.ts`

No new test — i18n locales are plain data; the transform tests already reference the keys. Type-check (Task 8) confirms both locales stay structurally identical.

- [ ] **Step 1: Add the English strings**

In `src/renderer/src/i18n/locales/en.ts`, inside the `transforms:` object (the one starting at line 266), replace the `squareCover` block (lines 287–290) so `trimSilence` is added after it:

```ts
    squareCover: {
      label: 'Square cover art',
      description: 'Center-crop the embedded cover to a square, trimming the longer side.'
    },
    trimSilence: {
      label: 'Trim silence',
      description: 'Remove silent audio from the start and/or end of the track.',
      fields: {
        mode: 'Trim',
        thresholdDb: 'Silence threshold (dB) — lower is stricter; -90 ≈ true silence',
        minDurationSec: 'Minimum silence (seconds)'
      },
      modes: {
        both: 'Start and end',
        start: 'Start only',
        end: 'End only',
        none: 'Disabled'
      }
    }
```

- [ ] **Step 2: Add the German strings**

In `src/renderer/src/i18n/locales/de.ts`, inside its `transforms:` object, replace the `squareCover` block (lines 289–293) so `trimSilence` is added after it:

```ts
    squareCover: {
      label: 'Cover quadratisch zuschneiden',
      description:
        'Eingebettetes Cover mittig auf ein Quadrat zuschneiden und die längere Seite kürzen.'
    },
    trimSilence: {
      label: 'Stille entfernen',
      description: 'Stille am Anfang und/oder Ende des Titels entfernen.',
      fields: {
        mode: 'Entfernen',
        thresholdDb: 'Stille-Schwelle (dB) — niedriger ist strenger; -90 ≈ echte Stille',
        minDurationSec: 'Mindeststille (Sekunden)'
      },
      modes: {
        both: 'Anfang und Ende',
        start: 'Nur Anfang',
        end: 'Nur Ende',
        none: 'Deaktiviert'
      }
    }
```

- [ ] **Step 3: Type-check to confirm both locales match**

Run: `pnpm typecheck`
Expected: PASS — no missing-key errors between `en` and `de`.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(i18n): add trim-silence transform labels (en, de)"
```

---

## Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: PASS, no errors or warnings in the new/modified files.

- [ ] **Step 2: Type-check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS — all prior tests plus the new `silence-filter`, `ffmpeg-output`, `audio-trim`, and `trim-silence` suites; updated `registry` and `defaults` suites green.

- [ ] **Step 4: Update CHANGELOG (if the project maintains one by hand)**

Check whether `CHANGELOG.md` is hand-maintained or release-please-generated. Per `CLAUDE.md` the changelog is generated from commit titles, so **do not** edit it manually — the `feat:` commits already drive the entry. Skip if so.

- [ ] **Step 5: Final commit (only if anything remains uncommitted)**

```bash
git status --short
# If clean, nothing to do — every task committed its own work.
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task — `silence-filter.ts` (T1), `ffmpeg-output.ts` parsers + probe-first decision (T2), `audio-trim.ts` orchestrator (T3), transform with `allowMultiple: true` (T4), registration (T5), default-on `both`/true-silence (T6), i18n (T7), verification (T8).
- **Resolved open detail (no ffprobe):** the spec's "ffprobe vs silencedetect stderr" question is resolved to **parse ffmpeg stderr** — `BinaryPaths` bundles only ffmpeg, and one silencedetect pass yields silence regions, duration, and bitrate together.
- **Resolved open detail (working file):** the transform **renames the temp over `ctx.workingFile`** (same path, same dir/filesystem → atomic) rather than reassigning the path.
- **Resolved open detail (ordering):** `trim-silence` is placed **second** (after `auto-tag`, before `rename`/`square-cover`); square-cover remains last so the existing assertion holds.
- **Type consistency:** `TrimMode`/`SilenceFilterOpts` (T1) are reused unchanged in T2/T3/T4; `TrimResult`/`TrimDeps` (T3) are consumed by T4; config keys `mode`/`thresholdDb`/`minDurationSec` are identical across schema, defaults, defaults-test, and i18n.
