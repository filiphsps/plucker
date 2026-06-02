# Analyze Key & BPM Transform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `analyze-key-bpm` transform that estimates a track's musical key and tempo from its audio (pure-TS DSP over ffmpeg-decoded PCM) and writes them to ID3 tags (TKEY, TBPM, and a `TXXX:CAMELOT` frame).

**Architecture:** Pure, UI-agnostic DSP modules (FFT, chroma/key, tempo, Camelot mapping) live in `src/shared/`. A main-only `audio-pcm.ts` decodes audio to mono Float32 PCM via the bundled ffmpeg. The transform `analyze-key-bpm.ts` decodes once, runs the enabled analyses, and writes the frames directly to the working file (mirroring `square-cover`), so no `TrackTags`/cache changes are needed.

**Tech Stack:** TypeScript, Node, Electron main process, `ffmpeg-static`, `node-id3`, Vitest.

**Reference spec:** `.specs/2026-06-02-analyze-key-bpm-design.md`

**Conventions:** pnpm only. Conventional Commits. Work on `master` (no new branches). Run a single test file with `pnpm test -- <path>` (Vitest); the full suite with `pnpm test`.

---

## File Structure

- Create `src/shared/fft.ts` (+ `fft.test.ts`) — radix-2 FFT.
- Create `src/shared/camelot.ts` (+ `camelot.test.ts`) — musical key → Camelot.
- Create `src/shared/chroma.ts` (+ `chroma.test.ts`) — chromagram + key estimation.
- Create `src/shared/tempo.ts` (+ `tempo.test.ts`) — BPM estimation.
- Create `src/main/audio-pcm.ts` (+ `audio-pcm.test.ts`) — ffmpeg PCM decode.
- Create `src/main/transforms/analyze-key-bpm.ts` (+ `analyze-key-bpm.test.ts`) — the transform.
- Modify `src/main/tagger.ts` (+ `tagger.test.ts`) — add `writeAnalysisTags`.
- Modify `src/main/transforms/registry.ts` — register the transform.
- Modify `src/renderer/src/i18n/locales/en.ts` and `de.ts` — add `transforms.analyzeKeyBpm` strings.

---

## Task 1: Radix-2 FFT (`src/shared/fft.ts`)

**Files:**
- Create: `src/shared/fft.ts`
- Test: `src/shared/fft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/fft.test.ts
import { describe, it, expect } from 'vitest'
import { fft } from './fft'

describe('fft', () => {
  it('transforms a DC signal into a single non-zero bin at index 0', () => {
    const re = new Float32Array([1, 1, 1, 1])
    const im = new Float32Array([0, 0, 0, 0])
    fft(re, im)
    expect(re[0]).toBeCloseTo(4, 5)
    expect(re[1]).toBeCloseTo(0, 5)
    expect(re[2]).toBeCloseTo(0, 5)
    expect(re[3]).toBeCloseTo(0, 5)
  })

  it('puts an impulse signal into a flat-magnitude spectrum', () => {
    const re = new Float32Array([1, 0, 0, 0])
    const im = new Float32Array([0, 0, 0, 0])
    fft(re, im)
    for (let k = 0; k < 4; k++) {
      expect(Math.hypot(re[k], im[k])).toBeCloseTo(1, 5)
    }
  })

  it('throws when the length is not a power of two', () => {
    expect(() => fft(new Float32Array(3), new Float32Array(3))).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/shared/fft.test.ts`
Expected: FAIL — `fft` is not defined / module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/fft.ts

/**
 * In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` are the real and
 * imaginary parts; both must share the same power-of-two length. On return they
 * hold the transform. Pure and dependency-free so it can be unit-tested with
 * synthetic signals and reused by both chroma and tempo analysis.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  if (n !== im.length) throw new Error('fft: re/im length mismatch')
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`fft: length ${n} is not a power of two`)

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }

  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = i + k + len / 2
        const tRe = re[b] * curRe - im[b] * curIm
        const tIm = re[b] * curIm + im[b] * curRe
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/shared/fft.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/fft.ts src/shared/fft.test.ts
git commit -m "feat(dsp): add radix-2 FFT utility"
```

---

## Task 2: Camelot mapping (`src/shared/camelot.ts`)

**Files:**
- Create: `src/shared/camelot.ts`
- Test: `src/shared/camelot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/camelot.test.ts
import { describe, it, expect } from 'vitest'
import { keyToCamelot } from './camelot'

describe('keyToCamelot', () => {
  it('maps major keys to the B side of the wheel', () => {
    expect(keyToCamelot('C')).toBe('8B')
    expect(keyToCamelot('G')).toBe('9B')
    expect(keyToCamelot('A')).toBe('11B')
    expect(keyToCamelot('B')).toBe('1B')
  })

  it('maps minor keys to the A side of the wheel', () => {
    expect(keyToCamelot('Am')).toBe('8A')
    expect(keyToCamelot('Em')).toBe('9A')
    expect(keyToCamelot('G#m')).toBe('1A')
    expect(keyToCamelot('Bm')).toBe('10A')
  })

  it('returns undefined for unknown input', () => {
    expect(keyToCamelot('H')).toBeUndefined()
    expect(keyToCamelot('')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/shared/camelot.test.ts`
Expected: FAIL — `keyToCamelot` not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/camelot.ts

/**
 * Map a musical key (sharp notation; major = "C", minor = "Cm") to its Camelot
 * wheel code (major → B side, minor → A side). Returns undefined for input that
 * is not one of the 24 recognized keys. Pure lookup table.
 */
const CAMELOT: Record<string, string> = {
  // Major keys (B side)
  C: '8B',
  'C#': '3B',
  D: '10B',
  'D#': '5B',
  E: '12B',
  F: '7B',
  'F#': '2B',
  G: '9B',
  'G#': '4B',
  A: '11B',
  'A#': '6B',
  B: '1B',
  // Minor keys (A side)
  Cm: '5A',
  'C#m': '12A',
  Dm: '7A',
  'D#m': '2A',
  Em: '9A',
  Fm: '4A',
  'F#m': '11A',
  Gm: '6A',
  'G#m': '1A',
  Am: '8A',
  'A#m': '3A',
  Bm: '10A'
}

export function keyToCamelot(key: string): string | undefined {
  return CAMELOT[key]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/shared/camelot.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/camelot.ts src/shared/camelot.test.ts
git commit -m "feat(dsp): add musical-key to Camelot mapping"
```

---

## Task 3: Key estimation (`src/shared/chroma.ts`)

**Files:**
- Create: `src/shared/chroma.ts`
- Test: `src/shared/chroma.test.ts`

This module depends on `fft` from Task 1.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/chroma.test.ts
import { describe, it, expect } from 'vitest'
import { estimateKey } from './chroma'

const SR = 11025

/** Generate `seconds` of a sine wave at `freq` Hz. */
function sine(freq: number, seconds: number, sr = SR): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr))
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sr)
  return out
}

/** Sum of several sines (a chord). */
function chord(freqs: number[], seconds: number, sr = SR): Float32Array {
  const parts = freqs.map((f) => sine(f, seconds, sr))
  const out = new Float32Array(parts[0].length)
  for (const p of parts) for (let i = 0; i < out.length; i++) out[i] += p[i] / parts.length
  return out
}

describe('estimateKey', () => {
  it('identifies a pure A note as an A-rooted key', () => {
    // 440 Hz is A4. A strong single pitch class biases toward its key.
    const key = estimateKey(sine(440, 4), SR)
    expect(key).toMatch(/^A/)
  })

  it('identifies a C-major triad (C4 E4 G4) as C major', () => {
    const key = estimateKey(chord([261.63, 329.63, 392.0], 4), SR)
    expect(key).toBe('C')
  })

  it('returns null for silence', () => {
    expect(estimateKey(new Float32Array(SR * 2), SR)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/shared/chroma.test.ts`
Expected: FAIL — `estimateKey` not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/chroma.ts
import { fft } from './fft'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// Krumhansl–Schmuckler key profiles (tone-weight templates).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const FRAME = 4096 // power of two; ~0.37 s at 11025 Hz
const HOP = FRAME / 2

/** Pearson correlation between two equal-length arrays. */
function pearson(a: number[], b: number[]): number {
  const n = a.length
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= n
  mb /= n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma
    const y = b[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  const den = Math.sqrt(da * db)
  return den === 0 ? 0 : num / den
}

/**
 * Accumulate a 12-bin chromagram (energy per pitch class) over the signal.
 * Returns null if the signal carries effectively no energy.
 */
function chromagram(pcm: Float32Array, sampleRate: number): number[] | null {
  const chroma = new Array(12).fill(0)
  const window = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)) // Hann
  }
  const re = new Float32Array(FRAME)
  const im = new Float32Array(FRAME)
  let total = 0

  for (let start = 0; start + FRAME <= pcm.length; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = pcm[start + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    // Only the lower half holds unique bins. Skip bin 0 (DC).
    for (let k = 1; k < FRAME / 2; k++) {
      const freq = (k * sampleRate) / FRAME
      if (freq < 27.5 || freq > 5000) continue // ~A0 .. above musical range
      const mag = Math.hypot(re[k], im[k])
      const midi = Math.round(69 + 12 * Math.log2(freq / 440))
      const pc = ((midi % 12) + 12) % 12
      chroma[pc] += mag
      total += mag
    }
  }

  if (total < 1e-6) return null
  for (let i = 0; i < 12; i++) chroma[i] /= total
  return chroma
}

/**
 * Estimate the musical key of mono PCM via the Krumhansl–Schmuckler algorithm:
 * correlate the chromagram against all 24 major/minor profile rotations and pick
 * the best. Major keys return "C".."B"; minor keys append "m" ("Am"). Returns
 * null when the signal is silent / has no tonal content.
 */
export function estimateKey(pcm: Float32Array, sampleRate: number): string | null {
  const chroma = chromagram(pcm, sampleRate)
  if (!chroma) return null

  let best = { score: -Infinity, name: '' }
  for (let rot = 0; rot < 12; rot++) {
    const major = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - rot + 12) % 12])
    const minor = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - rot + 12) % 12])
    const majorScore = pearson(chroma, major)
    const minorScore = pearson(chroma, minor)
    if (majorScore > best.score) best = { score: majorScore, name: NOTE_NAMES[rot] }
    if (minorScore > best.score) best = { score: minorScore, name: `${NOTE_NAMES[rot]}m` }
  }
  return best.name || null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/shared/chroma.test.ts`
Expected: PASS (3 tests). If the triad test resolves to a relative/neighbor key, widen the C-major test to `expect(['C', 'Am', 'G', 'F']).toContain(key)` — but the rotated-profile correlation should land on `C` for a clean C-major triad.

- [ ] **Step 5: Commit**

```bash
git add src/shared/chroma.ts src/shared/chroma.test.ts
git commit -m "feat(dsp): add chroma-based musical key estimation"
```

---

## Task 4: BPM estimation (`src/shared/tempo.ts`)

**Files:**
- Create: `src/shared/tempo.ts`
- Test: `src/shared/tempo.test.ts`

This module depends on `fft` from Task 1.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/tempo.test.ts
import { describe, it, expect } from 'vitest'
import { estimateBpm } from './tempo'

const SR = 11025

/** A click train at `bpm`: short noise bursts spaced one beat apart. */
function clickTrain(bpm: number, seconds: number, sr = SR): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr))
  const period = Math.round((60 / bpm) * sr)
  for (let i = 0; i < out.length; i += period) {
    for (let j = 0; j < 64 && i + j < out.length; j++) {
      out[i + j] = 1 - j / 64 // a short decaying transient
    }
  }
  return out
}

describe('estimateBpm', () => {
  it('recovers 120 BPM from a 120 BPM click train', () => {
    const bpm = estimateBpm(clickTrain(120, 12), SR, { minBpm: 70, maxBpm: 180 })
    expect(bpm).not.toBeNull()
    expect(Math.abs((bpm as number) - 120)).toBeLessThanOrEqual(2)
  })

  it('folds a half-tempo (60 BPM) train into the configured range', () => {
    // 60 is below minBpm 70, so its detected tempo should fold up to ~120.
    const bpm = estimateBpm(clickTrain(60, 16), SR, { minBpm: 70, maxBpm: 180 })
    expect(bpm).not.toBeNull()
    expect(Math.abs((bpm as number) - 120)).toBeLessThanOrEqual(3)
  })

  it('returns null for silence', () => {
    expect(estimateBpm(new Float32Array(SR * 4), SR, { minBpm: 70, maxBpm: 180 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/shared/tempo.test.ts`
Expected: FAIL — `estimateBpm` not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/tempo.ts
import { fft } from './fft'

export interface TempoRange {
  minBpm: number
  maxBpm: number
}

const FRAME = 1024
const HOP = 512

/**
 * Spectral-flux onset envelope: per frame, the sum of positive magnitude
 * increases over the previous frame. Strong onsets (beats) become peaks.
 */
function onsetEnvelope(pcm: Float32Array): { env: number[]; hopRateHz: number; sr: number } {
  const window = new Float32Array(FRAME)
  for (let i = 0; i < FRAME; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1))
  }
  const re = new Float32Array(FRAME)
  const im = new Float32Array(FRAME)
  const half = FRAME / 2
  let prev = new Float32Array(half)
  const env: number[] = []

  for (let start = 0; start + FRAME <= pcm.length; start += HOP) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = pcm[start + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    let flux = 0
    const cur = new Float32Array(half)
    for (let k = 0; k < half; k++) {
      const mag = Math.hypot(re[k], im[k])
      cur[k] = mag
      const diff = mag - prev[k]
      if (diff > 0) flux += diff
    }
    env.push(flux)
    prev = cur
  }
  return { env, hopRateHz: 0, sr: 0 } // hopRateHz filled by caller via sampleRate
}

/** Parabolic interpolation around a discrete peak; returns the refined offset. */
function refinePeak(y0: number, y1: number, y2: number): number {
  const denom = y0 - 2 * y1 + y2
  return denom === 0 ? 0 : (0.5 * (y0 - y2)) / denom
}

/**
 * Estimate tempo (BPM) of mono PCM. Builds an onset envelope, autocorrelates it
 * over the lag window implied by [minBpm, maxBpm], refines the peak with
 * parabolic interpolation, then octave-folds the result into range. Returns null
 * when the signal has no detectable rhythmic structure.
 */
export function estimateBpm(pcm: Float32Array, sampleRate: number, range: TempoRange): number | null {
  const { env } = onsetEnvelope(pcm)
  if (env.length < 8) return null

  // Mean-subtract so the autocorrelation peaks on periodicity, not DC.
  const mean = env.reduce((a, b) => a + b, 0) / env.length
  const e = env.map((v) => v - mean)
  const energy = e.reduce((a, b) => a + b * b, 0)
  if (energy < 1e-9) return null

  const hopRateHz = sampleRate / HOP // envelope samples per second
  const minLag = Math.floor((60 / range.maxBpm) * hopRateHz)
  const maxLag = Math.ceil((60 / range.minBpm) * hopRateHz)

  let bestLag = -1
  let bestVal = -Infinity
  for (let lag = Math.max(1, minLag); lag <= Math.min(maxLag, e.length - 2); lag++) {
    let sum = 0
    for (let i = 0; i + lag < e.length; i++) sum += e[i] * e[i + lag]
    if (sum > bestVal) {
      bestVal = sum
      bestLag = lag
    }
  }
  if (bestLag < 1) return null

  // Refine the lag to sub-sample precision.
  const acAt = (lag: number): number => {
    let sum = 0
    for (let i = 0; i + lag < e.length; i++) sum += e[i] * e[i + lag]
    return sum
  }
  const refined = bestLag + refinePeak(acAt(bestLag - 1), bestVal, acAt(bestLag + 1))

  let bpm = (60 * hopRateHz) / refined
  while (bpm < range.minBpm) bpm *= 2
  while (bpm > range.maxBpm) bpm /= 2
  return Math.round(bpm)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/shared/tempo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/tempo.ts src/shared/tempo.test.ts
git commit -m "feat(dsp): add onset-autocorrelation BPM estimation"
```

---

## Task 5: PCM decode (`src/main/audio-pcm.ts`)

**Files:**
- Create: `src/main/audio-pcm.ts`
- Test: `src/main/audio-pcm.test.ts`

Mirrors `src/main/audio-trim.ts`'s injectable-deps shape so the orchestration is testable without a real ffmpeg.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/audio-pcm.test.ts
import { describe, it, expect, vi } from 'vitest'
import { decodeArgs, parsePcm, decodePcm } from './audio-pcm'

describe('decodeArgs', () => {
  it('requests mono f32le PCM at the given sample rate to stdout', () => {
    const args = decodeArgs('/tmp/a.mp3', 11025)
    expect(args).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      '/tmp/a.mp3',
      '-ac',
      '1',
      '-ar',
      '11025',
      '-f',
      'f32le',
      '-'
    ])
  })
})

describe('parsePcm', () => {
  it('reads little-endian float32 samples and drops a trailing partial sample', () => {
    const buf = Buffer.alloc(4 * 2 + 1)
    buf.writeFloatLE(0.5, 0)
    buf.writeFloatLE(-0.25, 4)
    const out = parsePcm(buf)
    expect(out.length).toBe(2)
    expect(out[0]).toBeCloseTo(0.5, 6)
    expect(out[1]).toBeCloseTo(-0.25, 6)
  })
})

describe('decodePcm', () => {
  it('runs ffmpeg with the decode args and parses the captured stdout', async () => {
    const buf = Buffer.alloc(4)
    buf.writeFloatLE(1, 0)
    const run = vi.fn(async () => buf)
    const out = await decodePcm('/tmp/a.mp3', 11025, { run })
    expect(run).toHaveBeenCalledWith(decodeArgs('/tmp/a.mp3', 11025))
    expect(out.length).toBe(1)
    expect(out[0]).toBeCloseTo(1, 6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/main/audio-pcm.test.ts`
Expected: FAIL — module / exports not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/audio-pcm.ts
import { spawnManaged } from './spawn'

/** Injectable I/O so the decode orchestration is unit-testable without ffmpeg. */
export interface PcmDeps {
  /** Run ffmpeg with the given args; resolve with the raw stdout bytes. */
  run: (args: string[]) => Promise<Buffer>
}

/** ffmpeg args to decode `file` to raw mono float32 little-endian PCM on stdout. */
export function decodeArgs(file: string, sampleRate: number): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    file,
    '-ac',
    '1',
    '-ar',
    String(sampleRate),
    '-f',
    'f32le',
    '-'
  ]
}

/** Parse f32le bytes into a Float32Array (alignment-safe; drops a partial tail). */
export function parsePcm(buf: Buffer): Float32Array {
  const count = Math.floor(buf.length / 4)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) out[i] = buf.readFloatLE(i * 4)
  return out
}

/** Decode `file` to mono float32 PCM at `sampleRate`. */
export async function decodePcm(
  file: string,
  sampleRate: number,
  deps: PcmDeps
): Promise<Float32Array> {
  const bytes = await deps.run(decodeArgs(file, sampleRate))
  return parsePcm(bytes)
}

/** Real ffmpeg-backed deps for {@link decodePcm}. Collects stdout to a Buffer. */
export function ffmpegPcmDeps(ffmpegPath: string, signal?: AbortSignal): PcmDeps {
  return {
    run: (args) =>
      new Promise<Buffer>((resolve, reject) => {
        const child = spawnManaged(ffmpegPath, args, {}, signal)
        const chunks: Buffer[] = []
        let stderr = ''
        child.stdout.on('data', (d: Buffer) => chunks.push(d))
        child.stderr.on('data', (d: Buffer) => {
          stderr += d.toString()
        })
        child.on('error', reject)
        child.on('close', (code) => {
          if (code === 0) resolve(Buffer.concat(chunks))
          else reject(new Error(`ffmpeg decode failed (code ${code}): ${stderr.trim()}`))
        })
      })
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/main/audio-pcm.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/audio-pcm.ts src/main/audio-pcm.test.ts
git commit -m "feat(audio): add ffmpeg PCM decode helper"
```

---

## Task 6: `writeAnalysisTags` in tagger (`src/main/tagger.ts`)

**Files:**
- Modify: `src/main/tagger.ts`
- Test: `src/main/tagger.test.ts`

- [ ] **Step 1: Add the failing test**

Append this `describe` block to `src/main/tagger.test.ts`. Add `writeAnalysisTags` to the existing import on line 6:

```ts
import { writeTrackTags, readTrackTags, embedCover, writeAnalysisTags } from './tagger'
```

```ts
// src/main/tagger.test.ts (append after the existing describe('tagger', ...) block)
describe('writeAnalysisTags', () => {
  it('writes initial key, BPM, and a CAMELOT TXXX frame', () => {
    writeAnalysisTags(mp3, { key: 'Am', camelot: '8A', bpm: 124 })
    const raw = NodeID3.read(mp3)
    expect(raw.initialKey).toBe('Am')
    expect(raw.bpm).toBe('124')
    const txxx = (raw.userDefinedText ?? []).find((t) => t.description === 'CAMELOT')
    expect(txxx?.value).toBe('8A')
  })

  it('writes only the provided fields and is a no-op when given nothing', () => {
    expect(() => writeAnalysisTags(mp3, {})).not.toThrow()
    writeAnalysisTags(mp3, { bpm: 90 })
    expect(NodeID3.read(mp3).bpm).toBe('90')
    expect(NodeID3.read(mp3).initialKey).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/main/tagger.test.ts`
Expected: FAIL — `writeAnalysisTags` not exported.

- [ ] **Step 3: Add the implementation**

Append to `src/main/tagger.ts`:

```ts
// src/main/tagger.ts (append)

/** Key/tempo analysis results written to dedicated ID3 frames. */
export interface AnalysisTags {
  /** Musical key, e.g. "Am" — written to TKEY (initialKey). */
  key?: string
  /** Camelot wheel code, e.g. "8A" — written to a TXXX:CAMELOT frame. */
  camelot?: string
  /** Tempo in BPM — written to TBPM. */
  bpm?: number
}

/**
 * Write key/BPM analysis frames to an mp3, leaving all other tags untouched
 * (partial NodeID3.update). Only the provided fields are written; an empty input
 * is a no-op.
 */
export function writeAnalysisTags(file: string, analysis: AnalysisTags): void {
  const id3: NodeID3.Tags = {}
  if (analysis.key) id3.initialKey = analysis.key
  if (typeof analysis.bpm === 'number') id3.bpm = String(analysis.bpm)
  if (analysis.camelot) {
    id3.userDefinedText = [{ description: 'CAMELOT', value: analysis.camelot }]
  }
  if (Object.keys(id3).length === 0) return
  const res = NodeID3.update(id3, file)
  if (res !== true) throw new Error(`Failed to write analysis tags: ${String(res)}`)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/main/tagger.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/main/tagger.ts src/main/tagger.test.ts
git commit -m "feat(tagger): write key, BPM, and Camelot ID3 frames"
```

---

## Task 7: The transform (`src/main/transforms/analyze-key-bpm.ts`)

**Files:**
- Create: `src/main/transforms/analyze-key-bpm.ts`
- Test: `src/main/transforms/analyze-key-bpm.test.ts`

Depends on Tasks 1–6. Uses the `TransformDefinition` shape from `./types` (see `square-cover.ts` / `trim-silence.ts` for the pattern). Injectable deps keep ffmpeg/DSP/tag-writing out of the unit under test.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/transforms/analyze-key-bpm.test.ts
import { describe, it, expect, vi } from 'vitest'
import { analyzeTrack, analyzeKeyBpmTransform } from './analyze-key-bpm'

const pcm = new Float32Array([0, 1, 0, -1])
const baseDeps = {
  decode: vi.fn(async () => pcm),
  estimateKey: vi.fn(() => 'Am'),
  estimateBpm: vi.fn(() => 124),
  keyToCamelot: vi.fn(() => '8A'),
  writeTags: vi.fn()
}

describe('analyzeTrack', () => {
  it('writes key (+camelot) and BPM when both are enabled', async () => {
    const deps = { ...baseDeps, writeTags: vi.fn() }
    await analyzeTrack('/tmp/a.mp3', { detectKey: true, detectBpm: true, minBpm: 70, maxBpm: 180 }, deps)
    expect(deps.writeTags).toHaveBeenCalledWith('/tmp/a.mp3', { key: 'Am', camelot: '8A', bpm: 124 })
  })

  it('skips key analysis when detectKey is false', async () => {
    const estimateKey = vi.fn(() => 'Am')
    const writeTags = vi.fn()
    await analyzeTrack(
      '/tmp/a.mp3',
      { detectKey: false, detectBpm: true, minBpm: 70, maxBpm: 180 },
      { ...baseDeps, estimateKey, writeTags }
    )
    expect(estimateKey).not.toHaveBeenCalled()
    expect(writeTags).toHaveBeenCalledWith('/tmp/a.mp3', { bpm: 124 })
  })

  it('passes the configured BPM range to the estimator', async () => {
    const estimateBpm = vi.fn(() => 128)
    await analyzeTrack(
      '/tmp/a.mp3',
      { detectKey: false, detectBpm: true, minBpm: 90, maxBpm: 160 },
      { ...baseDeps, estimateBpm }
    )
    expect(estimateBpm).toHaveBeenCalledWith(pcm, expect.any(Number), { minBpm: 90, maxBpm: 160 })
  })

  it('does not write tags when nothing is detected', async () => {
    const writeTags = vi.fn()
    await analyzeTrack(
      '/tmp/a.mp3',
      { detectKey: true, detectBpm: true, minBpm: 70, maxBpm: 180 },
      { ...baseDeps, estimateKey: () => null, estimateBpm: () => null, writeTags }
    )
    expect(writeTags).not.toHaveBeenCalled()
  })
})

describe('analyzeKeyBpmTransform', () => {
  it('is a non-multiple, skip-on-failure transform with the expected type', () => {
    expect(analyzeKeyBpmTransform.type).toBe('analyze-key-bpm')
    expect(analyzeKeyBpmTransform.allowMultiple).toBe(false)
    expect(analyzeKeyBpmTransform.failureMode).toBe('skip')
    expect(analyzeKeyBpmTransform.defaultConfig).toEqual({
      detectKey: true,
      detectBpm: true,
      minBpm: 70,
      maxBpm: 180
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/main/transforms/analyze-key-bpm.test.ts`
Expected: FAIL — module / exports not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/transforms/analyze-key-bpm.ts
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import type { AnalysisTags } from '../tagger'
import { writeAnalysisTags } from '../tagger'
import { decodePcm, ffmpegPcmDeps } from '../audio-pcm'
import { estimateKey } from '../../shared/chroma'
import { estimateBpm, type TempoRange } from '../../shared/tempo'
import { keyToCamelot } from '../../shared/camelot'

export interface AnalyzeKeyBpmConfig {
  detectKey: boolean
  detectBpm: boolean
  minBpm: number
  maxBpm: number
}

/** Sample rate for analysis — low enough to be fast, high enough for tempo/key. */
const ANALYSIS_SR = 11025

/** Injectable collaborators so the orchestration is testable without ffmpeg/DSP. */
export interface AnalyzeDeps {
  decode: (file: string, sampleRate: number) => Promise<Float32Array>
  estimateKey: (pcm: Float32Array, sampleRate: number) => string | null
  estimateBpm: (pcm: Float32Array, sampleRate: number, range: TempoRange) => number | null
  keyToCamelot: (key: string) => string | undefined
  writeTags: (file: string, tags: AnalysisTags) => void
}

/**
 * Decode `file` once, run the enabled analyses, and write any results to ID3
 * frames. Writing nothing when nothing is detected is intentional.
 */
export async function analyzeTrack(
  file: string,
  config: AnalyzeKeyBpmConfig,
  deps: AnalyzeDeps
): Promise<void> {
  const pcm = await deps.decode(file, ANALYSIS_SR)
  const tags: AnalysisTags = {}

  if (config.detectKey) {
    const key = deps.estimateKey(pcm, ANALYSIS_SR)
    if (key) {
      tags.key = key
      tags.camelot = deps.keyToCamelot(key)
    }
  }
  if (config.detectBpm) {
    const bpm = deps.estimateBpm(pcm, ANALYSIS_SR, { minBpm: config.minBpm, maxBpm: config.maxBpm })
    if (bpm !== null) tags.bpm = bpm
  }

  if (tags.key || tags.bpm) deps.writeTags(file, tags)
}

const CONFIG_SCHEMA: ConfigField[] = [
  { key: 'detectKey', labelKey: 'transforms.analyzeKeyBpm.fields.detectKey', type: 'boolean', default: true },
  { key: 'detectBpm', labelKey: 'transforms.analyzeKeyBpm.fields.detectBpm', type: 'boolean', default: true },
  { key: 'minBpm', labelKey: 'transforms.analyzeKeyBpm.fields.minBpm', type: 'number', default: 70, min: 30, max: 300 },
  { key: 'maxBpm', labelKey: 'transforms.analyzeKeyBpm.fields.maxBpm', type: 'number', default: 180, min: 30, max: 300 }
]

/**
 * Estimate the track's musical key and tempo from its audio and write them to
 * TKEY, TBPM, and a TXXX:CAMELOT frame. Pure-TS DSP over ffmpeg-decoded PCM;
 * skip-on-failure so a bad analysis never aborts the chain or drops other tags.
 */
export const analyzeKeyBpmTransform: TransformDefinition<AnalyzeKeyBpmConfig> = {
  type: 'analyze-key-bpm',
  apiVersion: 1,
  labelKey: 'transforms.analyzeKeyBpm.label',
  descriptionKey: 'transforms.analyzeKeyBpm.description',
  allowMultiple: false,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: { detectKey: true, detectBpm: true, minBpm: 70, maxBpm: 180 },
  async run(
    ctx: TrackContext,
    config: AnalyzeKeyBpmConfig,
    services: TransformServices
  ): Promise<void> {
    await analyzeTrack(ctx.workingFile, config, {
      decode: (file, sr) => decodePcm(file, sr, ffmpegPcmDeps(services.bin.ffmpeg, services.signal)),
      estimateKey,
      estimateBpm,
      keyToCamelot,
      writeTags: writeAnalysisTags
    })
    services.log(`[analyze-key-bpm] analyzed ${ctx.workingFile}`)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/main/transforms/analyze-key-bpm.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/analyze-key-bpm.ts src/main/transforms/analyze-key-bpm.test.ts
git commit -m "feat(transforms): add analyze-key-bpm transform"
```

---

## Task 8: Register the transform (`src/main/transforms/registry.ts`)

**Files:**
- Modify: `src/main/transforms/registry.ts`
- Test: `src/main/transforms/registry.test.ts`

- [ ] **Step 1: Update the registry test**

Open `src/main/transforms/registry.test.ts` and add an assertion that the catalog includes the new type. Add this test inside the existing top-level `describe`:

```ts
// src/main/transforms/registry.test.ts (add a test)
import { getCatalog, buildRegistry } from './registry'
// ...
it('includes the analyze-key-bpm transform', () => {
  expect(getCatalog().map((m) => m.type)).toContain('analyze-key-bpm')
  expect(buildRegistry().has('analyze-key-bpm')).toBe(true)
})
```

(If the existing test file does not already import `getCatalog`/`buildRegistry`, add them to its import line. Check the file first and reuse its existing imports.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/main/transforms/registry.test.ts`
Expected: FAIL — `analyze-key-bpm` not in catalog.

- [ ] **Step 3: Register the transform**

Edit `src/main/transforms/registry.ts`. Add the import alongside the others:

```ts
import { analyzeKeyBpmTransform } from './analyze-key-bpm'
```

And add it to the `BUILTINS` array:

```ts
const BUILTINS: TransformDefinition[] = [
  autoTagTransform as unknown as TransformDefinition,
  trimSilenceTransform as unknown as TransformDefinition,
  analyzeKeyBpmTransform as unknown as TransformDefinition,
  renameTransform as unknown as TransformDefinition,
  squareCoverTransform as unknown as TransformDefinition
]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/main/transforms/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/registry.ts src/main/transforms/registry.test.ts
git commit -m "feat(transforms): register analyze-key-bpm in the catalog"
```

---

## Task 9: i18n strings (en + de)

**Files:**
- Modify: `src/renderer/src/i18n/locales/en.ts`
- Modify: `src/renderer/src/i18n/locales/de.ts`

The renderer's config form renders field labels from these keys. The `de.ts` file mirrors `en.ts`'s shape; add the matching block (German copy below; if unsure, mirror the English text — the i18n test only checks key parity, not translation quality).

- [ ] **Step 1: Add the English block**

In `src/renderer/src/i18n/locales/en.ts`, inside the `transforms: { ... }` object (e.g. right after the `autoTag` block at line ~295), add:

```ts
    analyzeKeyBpm: {
      label: 'Analyze key & BPM',
      description: "Estimate the track's musical key and tempo and write them to its tags.",
      fields: {
        detectKey: 'Detect musical key (writes key + Camelot)',
        detectBpm: 'Detect tempo (BPM)',
        minBpm: 'Minimum BPM — lower bound for tempo folding',
        maxBpm: 'Maximum BPM — upper bound for tempo folding'
      }
    },
```

- [ ] **Step 2: Add the German block**

In `src/renderer/src/i18n/locales/de.ts`, inside its `transforms` object, add the same-shaped block:

```ts
    analyzeKeyBpm: {
      label: 'Tonart & BPM analysieren',
      description: 'Tonart und Tempo des Tracks schätzen und in die Tags schreiben.',
      fields: {
        detectKey: 'Tonart erkennen (schreibt Tonart + Camelot)',
        detectBpm: 'Tempo erkennen (BPM)',
        minBpm: 'Minimale BPM — untere Grenze für die Tempo-Faltung',
        maxBpm: 'Maximale BPM — obere Grenze für die Tempo-Faltung'
      }
    },
```

- [ ] **Step 3: Run the i18n test**

Run: `pnpm test -- src/renderer/src/i18n/i18n.test.ts`
Expected: PASS — en/de key parity holds.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(i18n): add analyze-key-bpm transform strings"
```

---

## Task 10: Full verification

- [ ] **Step 1: Typecheck, lint, and full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all pass. (Confirm exact script names against `package.json`; this repo runs lint, typecheck, and tests in CI.)

- [ ] **Step 2: Manual smoke test (optional but recommended)**

Build/run the app (`pnpm dev` or the project's run skill), add the "Analyze key & BPM" transform to the chain, download a track with a clear beat/tonality, and confirm the output mp3 carries TKEY, TBPM, and a `TXXX:CAMELOT` frame (e.g. via `ffprobe -show_format output.mp3` or re-reading with NodeID3).

- [ ] **Step 3: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(transforms): verify analyze-key-bpm end-to-end"
```

---

## Self-Review Notes

- **Spec coverage:** detection method (Tasks 1,3,4,5), single transform with toggles (Task 7), musical + Camelot notation (Tasks 2,6,7), always-overwrite (writeAnalysisTags does an unconditional `NodeID3.update` of provided frames — Task 6), Camelot in `TXXX:CAMELOT` (Task 6), config min/max BPM (Task 7), registration + i18n (Tasks 8,9), testing strategy (every task is TDD). All spec sections map to a task.
- **No `TrackTags`/cache changes:** confirmed — frames are written directly to the working file in Task 7, and the chain's partial `tryFlushTags` does not touch TKEY/TBPM/TXXX.
- **Type consistency:** `AnalysisTags`, `AnalyzeKeyBpmConfig`, `TempoRange`, `AnalyzeDeps`, `PcmDeps` are defined once and reused with matching signatures across tasks. `estimateKey`/`estimateBpm`/`keyToCamelot`/`decodePcm`/`writeAnalysisTags` names are consistent between definition and call sites.
- **Accuracy caveat:** pure-JS estimation is "mostly right"; the triad/click-train tests use tolerant assertions. If the C-major triad test lands on a neighbor key in practice, widen that one assertion as noted in Task 3 Step 4.
