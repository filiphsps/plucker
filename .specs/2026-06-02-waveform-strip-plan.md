# Waveform Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a real, static audio waveform under the tags/source fields in the expanded track panel, generated lazily on first expand and cached by content hash.

**Architecture:** The bundled `ffmpeg-static` decodes the file to low-rate mono PCM in the main process; a pure helper downsamples it to 120 normalized peaks. The result (peaks + duration) is cached per content-hash in the existing metadata cache and served over a new `waveform:get` IPC channel. A small presentational `WaveformStrip` draws mirrored vertical bars (no canvas, no npm dependency), with a staggered entry animation, a duration tooltip, and the row's context menu forwarded onto it.

**Tech Stack:** Electron (main + sandboxed renderer), TypeScript, React 19, Tailwind v4, Vitest (`renderToStaticMarkup` SSR tests), `ffmpeg-static`.

---

## File Structure

- Create `src/main/waveform.ts` — PCM downsampling (`pcmToPeaks`), ffmpeg decode, `getWaveform` orchestration, `forWaveform` real-deps factory.
- Create `src/main/waveform.test.ts` — `pcmToPeaks` + `getWaveform` (injected deps).
- Modify `src/shared/types.ts` — add `Waveform` interface.
- Modify `src/main/metadata-cache.ts` — add `waveform?` to `CacheEntry` + `writeWaveform`.
- Modify `src/main/metadata-cache.test.ts` *(create if absent)* — cover `writeWaveform`.
- Modify `src/main/index.ts` — register `waveform:get` handler.
- Modify `src/preload/index.ts` — add `getWaveform` to the bridge.
- Create `src/renderer/src/ui/meta/waveform-strip.tsx` — the bar renderer.
- Create `src/renderer/src/ui/meta/waveform-strip.test.tsx` — bar count / empty.
- Modify `src/renderer/src/index.css` — `wave-rise` keyframes + reduced-motion.
- Modify `src/renderer/src/ui/meta/track-detail.tsx` — `waveform` + `onContextMenu` props, render the strip.
- Modify `src/renderer/src/ui/meta/track-detail.test.tsx` — strip shown / hidden in edit mode.
- Modify `src/renderer/src/track-row.tsx` — lazy fetch on expand, pass down.
- Modify `src/renderer/src/track-row.test.tsx` — collapsed row renders no waveform.

---

## Task 1: `Waveform` type + cache support

**Files:**
- Modify: `src/shared/types.ts` (append near `AudioMeta`/`TrackMetadata`, ~line 247)
- Modify: `src/main/metadata-cache.ts:5-17` (`CacheEntry`) and `:24-34` (`MetadataCache` interface) and the returned object (~`:79`)
- Create: `src/main/metadata-cache.test.ts`

- [ ] **Step 1: Add the `Waveform` type**

In `src/shared/types.ts`, after the `TrackMetadata` interface (line ~247):

```ts
/** Precomputed waveform peaks for the expanded-panel visualization. */
export interface Waveform {
  /** Normalized 0..1 peaks, one per rendered bar (length {@link WAVEFORM_BARS}). */
  peaks: number[]
  /** Total duration in seconds, carried for a future playhead + the tooltip. */
  durationSec?: number
}
```

- [ ] **Step 2: Extend the cache entry + interface**

In `src/main/metadata-cache.ts`, add the import and field. Change the import on line 3:

```ts
import type { TrackTags, AudioMeta, CacheTrackIdentity, Waveform } from '../shared/types'
```

Add to `CacheEntry` (after the `audio?` field, ~line 9):

```ts
  /** Precomputed waveform peaks + duration, generated lazily on first expand. */
  waveform?: Waveform
```

Add to the `MetadataCache` interface (after `writeAudio`, ~line 27):

```ts
  writeWaveform(hash: string, waveform: Waveform): void
```

Add to the returned object (after `writeAudio:` line, ~line 80):

```ts
    writeWaveform: (hash, waveform) => merge(hash, { waveform }),
```

- [ ] **Step 3: Write the failing cache test**

Create `src/main/metadata-cache.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMetadataCache } from './metadata-cache'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'meta-cache-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('metadata cache waveform', () => {
  it('persists and reads back a waveform without clobbering audio', () => {
    const cache = createMetadataCache(tmp())
    cache.writeAudio('abc', { durationSec: 100 })
    cache.writeWaveform('abc', { peaks: [0, 0.5, 1], durationSec: 100 })
    const entry = cache.read('abc')
    expect(entry?.waveform).toEqual({ peaks: [0, 0.5, 1], durationSec: 100 })
    expect(entry?.audio?.durationSec).toBe(100)
  })
})
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/main/metadata-cache.test.ts`
Expected: PASS (the implementation from Step 2 is already in place).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/metadata-cache.ts src/main/metadata-cache.test.ts
git commit -m "feat(waveform): add Waveform type and metadata-cache support"
```

---

## Task 2: Pure PCM → peaks downsampling

**Files:**
- Create: `src/main/waveform.ts`
- Create: `src/main/waveform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/waveform.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pcmToPeaks, WAVEFORM_BARS } from './waveform'

describe('pcmToPeaks', () => {
  it('returns exactly WAVEFORM_BARS peaks', () => {
    const samples = new Int16Array(1000).fill(1000)
    expect(pcmToPeaks(samples, WAVEFORM_BARS)).toHaveLength(WAVEFORM_BARS)
  })

  it('normalizes the loudest bucket to 1', () => {
    // Two buckets: first quiet, second loud.
    const samples = new Int16Array([100, 100, 16000, 16000])
    const peaks = pcmToPeaks(samples, 2)
    expect(peaks[1]).toBeCloseTo(1, 5)
    expect(peaks[0]).toBeCloseTo(100 / 16000, 5)
  })

  it('returns an all-zero array for silence (no divide-by-zero)', () => {
    const peaks = pcmToPeaks(new Int16Array(64), 8)
    expect(peaks).toHaveLength(8)
    expect(peaks.every((p) => p === 0)).toBe(true)
  })

  it('returns an empty array when there are no samples', () => {
    expect(pcmToPeaks(new Int16Array(0), 8)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/main/waveform.test.ts`
Expected: FAIL — `Cannot find module './waveform'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/main/waveform.ts` (downsampling section only for now):

```ts
/** Number of bars (and peaks) rendered for a waveform. */
export const WAVEFORM_BARS = 120

/**
 * Downsample 16-bit mono PCM to `buckets` normalized peaks. Each bucket is the
 * max absolute amplitude over its slice; the whole set is then scaled so the
 * loudest bucket is 1 (so quiet tracks still fill the strip). Returns `[]` for
 * empty input.
 */
export function pcmToPeaks(samples: Int16Array, buckets: number): number[] {
  if (samples.length === 0) return []
  const out = new Array<number>(buckets).fill(0)
  const per = samples.length / buckets
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * per)
    const end = Math.min(samples.length, Math.floor((b + 1) * per))
    let max = 0
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i])
      if (v > max) max = v
    }
    out[b] = max
  }
  const peak = Math.max(...out)
  if (peak === 0) return out
  return out.map((v) => v / peak)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/main/waveform.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/waveform.ts src/main/waveform.test.ts
git commit -m "feat(waveform): add pure PCM-to-peaks downsampling"
```

---

## Task 3: `getWaveform` orchestration (cache-first)

**Files:**
- Modify: `src/main/waveform.ts`
- Modify: `src/main/waveform.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/main/waveform.test.ts`:

```ts
import { getWaveform, type WaveformDeps } from './waveform'

function deps(over: Partial<WaveformDeps> = {}): WaveformDeps {
  return {
    cache: { read: () => null, writeWaveform: () => {} },
    decode: async () => ({ samples: new Int16Array([16000, 16000]), sampleRate: 8000 }),
    hashFile: async () => 'HASH',
    ...over
  }
}

describe('getWaveform', () => {
  it('returns the cached waveform without decoding', async () => {
    let decoded = false
    const cached = { peaks: [0.1, 0.2], durationSec: 5 }
    const wf = await getWaveform('/a.mp3', 'H', deps({
      cache: { read: () => ({ waveform: cached }), writeWaveform: () => {} },
      decode: async () => {
        decoded = true
        return { samples: new Int16Array([1]), sampleRate: 8000 }
      }
    }))
    expect(wf).toEqual(cached)
    expect(decoded).toBe(false)
  })

  it('decodes, derives duration, and writes to the cache on a miss', async () => {
    const writes: Array<[string, unknown]> = []
    const wf = await getWaveform('/a.mp3', 'H', deps({
      decode: async () => ({ samples: new Int16Array(8000).fill(16000), sampleRate: 8000 }),
      cache: { read: () => null, writeWaveform: (h, w) => writes.push([h, w]) }
    }))
    expect(wf?.peaks).toHaveLength(WAVEFORM_BARS)
    expect(wf?.durationSec).toBeCloseTo(1, 5) // 8000 samples / 8000 Hz
    expect(writes).toEqual([['H', wf]])
  })

  it('falls back to hashing the file when no hash is supplied', async () => {
    const writes: string[] = []
    await getWaveform('/a.mp3', undefined, deps({
      hashFile: async () => 'DERIVED',
      cache: { read: () => null, writeWaveform: (h) => writes.push(h) }
    }))
    expect(writes).toEqual(['DERIVED'])
  })

  it('returns null when decoding fails', async () => {
    const wf = await getWaveform('/a.mp3', 'H', deps({ decode: async () => null }))
    expect(wf).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/main/waveform.test.ts`
Expected: FAIL — `getWaveform`/`WaveformDeps` not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/main/waveform.ts`:

```ts
import { spawnManaged } from './spawn'
import { hashAudioFile } from './audio-hash'
import type { MetadataCache } from './metadata-cache'
import type { BinaryPaths } from './binaries'
import type { Waveform } from '../shared/types'

/** Decode sample rate — low enough to keep the PCM small, ample for 120 bars. */
const DECODE_HZ = 8000

/** Injectable I/O for {@link getWaveform} (real impls in {@link forWaveform}). */
export interface WaveformDeps {
  cache: Pick<MetadataCache, 'read'> & { writeWaveform: MetadataCache['writeWaveform'] }
  /** Decode a file to mono 16-bit PCM, or null if it can't be read/decoded. */
  decode: (file: string) => Promise<{ samples: Int16Array; sampleRate: number } | null>
  /** Derive the content hash from the file (to backfill tracks with no hash). */
  hashFile: (file: string) => Promise<string | undefined>
}

/**
 * Resolve the waveform for a file: cache-first, otherwise decode → downsample →
 * cache. Never throws — a decode failure resolves to null so the UI omits the
 * strip. Called only from the `waveform:get` IPC handler (lazy, on first expand).
 */
export async function getWaveform(
  file: string,
  hash: string | undefined,
  deps: WaveformDeps
): Promise<Waveform | null> {
  const key = hash ?? (await deps.hashFile(file))
  const cached = key ? deps.cache.read(key)?.waveform : undefined
  if (cached) return cached

  const decoded = await deps.decode(file)
  if (!decoded) return null

  const waveform: Waveform = {
    peaks: pcmToPeaks(decoded.samples, WAVEFORM_BARS),
    durationSec: decoded.samples.length / decoded.sampleRate
  }
  if (key) deps.cache.writeWaveform(key, waveform)
  return waveform
}

/** Decode a media file to mono 16-bit little-endian PCM via the bundled ffmpeg. */
function decodePcm(
  ffmpegPath: string,
  file: string
): Promise<{ samples: Int16Array; sampleRate: number } | null> {
  return new Promise((resolve) => {
    const child = spawnManaged(ffmpegPath, [
      '-hide_banner',
      '-i', file,
      '-ac', '1',
      '-ar', String(DECODE_HZ),
      '-f', 's16le',
      'pipe:1'
    ])
    const chunks: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) return resolve(null)
      const buf = Buffer.concat(chunks)
      const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2))
      resolve({ samples, sampleRate: DECODE_HZ })
    })
  })
}

/** Build real {@link WaveformDeps} backed by the bundled ffmpeg + on-disk cache. */
export function forWaveform(bin: BinaryPaths, cache: MetadataCache): WaveformDeps {
  return {
    cache,
    decode: (file) => decodePcm(bin.ffmpeg, file),
    hashFile: async (file) => {
      try {
        return await hashAudioFile(file)
      } catch {
        return undefined
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/main/waveform.test.ts`
Expected: PASS (all tests, including Task 2's).

- [ ] **Step 5: Commit**

```bash
git add src/main/waveform.ts src/main/waveform.test.ts
git commit -m "feat(waveform): add cache-first getWaveform orchestration and ffmpeg decode"
```

---

## Task 4: IPC channel + preload bridge

**Files:**
- Modify: `src/main/index.ts` (imports near line 23; handler near line 112)
- Modify: `src/preload/index.ts` (near line 55)

- [ ] **Step 1: Add the main import**

In `src/main/index.ts`, alongside the metadata import (line 23):

```ts
import { getWaveform, forWaveform } from './waveform'
```

- [ ] **Step 2: Register the handler**

In `src/main/index.ts`, immediately after the `metadata:get` handler (after line 112):

```ts
  // Waveform peaks for the expanded panel — generated lazily on first expand,
  // cached per content hash, returns null when the file can't be decoded.
  ipcMain.handle('waveform:get', (_e, file: string, hash?: string) =>
    getWaveform(file, hash, forWaveform(currentBin(), getMetaCache()))
  )
```

- [ ] **Step 3: Expose it on the preload bridge**

In `src/preload/index.ts`, add the `Waveform` type to the existing shared-types import, then add the method after `getTrackMetadata` (line 55):

```ts
  getWaveform: (file: string, hash?: string): Promise<Waveform | null> =>
    ipcRenderer.invoke('waveform:get', file, hash),
```

(`PluckerApi` is `typeof api`, so the renderer type updates automatically — no `.d.ts` edit needed.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors). If `Waveform` is reported missing in `src/preload/index.ts`, confirm it was added to that file's `../shared/types` import.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(waveform): expose waveform:get over IPC"
```

---

## Task 5: `WaveformStrip` component

**Files:**
- Create: `src/renderer/src/ui/meta/waveform-strip.tsx`
- Create: `src/renderer/src/ui/meta/waveform-strip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/ui/meta/waveform-strip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WaveformStrip } from './waveform-strip'

const peaks = Array.from({ length: 120 }, (_, i) => (i % 10) / 10)

describe('WaveformStrip', () => {
  it('renders one bar per peak', () => {
    const html = renderToStaticMarkup(<WaveformStrip peaks={peaks} />)
    expect(html.split('data-wave-bar').length - 1).toBe(120)
  })

  it('renders nothing when there are no peaks', () => {
    const html = renderToStaticMarkup(<WaveformStrip peaks={[]} />)
    expect(html).toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/ui/meta/waveform-strip.test.tsx`
Expected: FAIL — `Cannot find module './waveform-strip'`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/src/ui/meta/waveform-strip.tsx`:

```tsx
import React from 'react'
import { Tooltip } from '../tooltip'
import { formatDuration } from './format'

/**
 * A static waveform: mirrored vertical bars drawn from a center baseline (one
 * per peak). Purely presentational and hand-rolled (no canvas, no dependency),
 * matching the existing `Meter`. Bars animate in with a left-to-right stagger
 * (see `wave-rise` in index.css; disabled under prefers-reduced-motion).
 *
 * `progress`/`onSeek` are accepted but unused today — the playback-ready seam:
 * a future interactive version color-splits bars at `progress` and seeks on
 * click without changing geometry.
 */
export function WaveformStrip({
  peaks,
  durationSec,
  onContextMenu,
  progress,
  onSeek
}: {
  peaks: number[]
  durationSec?: number
  onContextMenu?: (e: React.MouseEvent) => void
  /** 0..1 playhead position (future). */
  progress?: number
  /** Seek callback, fraction 0..1 (future). */
  onSeek?: (fraction: number) => void
}): React.JSX.Element | null {
  void progress
  void onSeek
  if (peaks.length === 0) return null

  const bars = (
    <div
      className="flex h-9 w-full items-center gap-px"
      onContextMenu={onContextMenu}
      aria-hidden
    >
      {peaks.map((p, i) => (
        <span
          key={i}
          data-wave-bar
          className="wave-bar flex-1 rounded-[1px] bg-ink-faint/60"
          style={{
            height: `${Math.max(2, p * 100)}%`,
            animationDelay: `${i * 6}ms`
          }}
        />
      ))}
    </div>
  )

  return (
    <Tooltip label={formatDuration(durationSec)} className="w-full">
      {bars}
    </Tooltip>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/src/ui/meta/waveform-strip.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/meta/waveform-strip.tsx src/renderer/src/ui/meta/waveform-strip.test.tsx
git commit -m "feat(waveform): add WaveformStrip bar renderer"
```

---

## Task 6: Entry animation (keyframes + reduced-motion)

**Files:**
- Modify: `src/renderer/src/index.css` (append after the existing rules, end of file)

- [ ] **Step 1: Add the keyframes and reduced-motion guard**

Append to `src/renderer/src/index.css`:

```css
/* Waveform bars rise from the baseline with a per-bar stagger on mount. */
@keyframes wave-rise {
  from {
    transform: scaleY(0);
    opacity: 0;
  }
  to {
    transform: scaleY(1);
    opacity: 1;
  }
}

.wave-bar {
  transform-origin: center;
  animation: wave-rise 260ms ease-out both;
}

@media (prefers-reduced-motion: reduce) {
  .wave-bar {
    animation: none;
  }
}
```

- [ ] **Step 2: Verify the bar markup still renders**

Run: `pnpm vitest run src/renderer/src/ui/meta/waveform-strip.test.tsx`
Expected: PASS (CSS is non-breaking; markup unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "feat(waveform): add staggered bar entry animation"
```

---

## Task 7: Render the strip inside `TrackDetail`

**Files:**
- Modify: `src/renderer/src/ui/meta/track-detail.tsx` (imports ~line 5; props ~line 48-67; view-mode return ~line 154-186)
- Modify: `src/renderer/src/ui/meta/track-detail.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/src/ui/meta/track-detail.test.tsx`:

```tsx
import { WaveformStrip } from './waveform-strip' // ensure component resolves
import type { Waveform } from '../../../../shared/types'

const WF: Waveform = { peaks: Array.from({ length: 120 }, () => 0.5), durationSec: 243 }

describe('TrackDetail waveform', () => {
  it('renders the waveform strip when a waveform is provided', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={META} waveform={WF} />)
    expect(html).toContain('data-wave-bar')
  })

  it('omits the waveform in tag-edit mode', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={META} waveform={WF} editing />)
    expect(html).not.toContain('data-wave-bar')
  })

  it('omits the waveform when none is provided', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={META} />)
    expect(html).not.toContain('data-wave-bar')
  })
})

void WaveformStrip
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/renderer/src/ui/meta/track-detail.test.tsx`
Expected: FAIL — `TrackDetail` has no `waveform` prop / no bars rendered.

- [ ] **Step 3: Add the import**

In `src/renderer/src/ui/meta/track-detail.tsx`, after the `MetaGrid` import (line 7):

```ts
import { WaveformStrip } from './waveform-strip'
```

And extend the shared-types import (line 3) to include `Waveform`:

```ts
import type { TrackMetadata, TrackTags, Waveform } from '../../../../shared/types'
```

- [ ] **Step 4: Add the props**

In the `TrackDetail` prop list (the object after the destructure, ~line 57-67), add `waveform` and `onContextMenu` to both the destructure and the type:

Destructure (after `onCancel`, ~line 65):

```ts
  onOpenExternal,
  waveform,
  onContextMenu
```

Type block (after `onCancel?: () => void`, ~line 65):

```ts
  /** Precomputed peaks; when present (and not editing) the strip is shown. */
  waveform?: Waveform
  /** Row context-menu handler, forwarded onto the waveform. */
  onContextMenu?: (e: React.MouseEvent) => void
```

- [ ] **Step 5: Render the strip as the last child of the view-mode panel**

In the view-mode `return` (the final `return` of the component, ~line 154-187), add the strip after the closing `</div>` of the `grid grid-cols-2` block but still inside the `wrapper` div:

```tsx
      </div>

      {waveform && (
        <WaveformStrip
          peaks={waveform.peaks}
          durationSec={waveform.durationSec}
          onContextMenu={onContextMenu}
        />
      )}
    </div>
  )
```

(The edit-mode return is left unchanged, so the strip never appears in edit mode.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run src/renderer/src/ui/meta/track-detail.test.tsx`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/ui/meta/track-detail.tsx src/renderer/src/ui/meta/track-detail.test.tsx
git commit -m "feat(waveform): render waveform strip in the expanded panel"
```

---

## Task 8: Lazy fetch on expand in `TrackRow`

**Files:**
- Modify: `src/renderer/src/track-row.tsx` (imports ~line 4; state ~line 95-96; new effect after line 127; `TrackDetail` usage ~line 337-346)
- Modify: `src/renderer/src/track-row.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/src/track-row.test.tsx`:

```tsx
it('does not render a waveform while the row is collapsed', () => {
  const html = renderToStaticMarkup(
    <TrackRow
      variant="history"
      index={1}
      track={{ title: 'Stratus', file: '/a.mp3', duration: '9:49' }}
    />
  )
  // Collapsed by default → TrackDetail (and its waveform) is not mounted.
  expect(html).not.toContain('data-wave-bar')
})
```

- [ ] **Step 2: Run the test to verify it passes (guards the wiring)**

Run: `pnpm vitest run src/renderer/src/track-row.test.tsx`
Expected: PASS — confirms the row stays inert until expanded (effects don't run in SSR, and the panel is collapsed). This test locks in the "no eager generation" requirement.

- [ ] **Step 3: Add the type import**

In `src/renderer/src/track-row.tsx`, extend the shared-types import (line 4):

```ts
import type { TrackStatus, TrackMetadata, TrackTags, Waveform } from '../../shared/types'
```

- [ ] **Step 4: Add waveform state**

After the `fetched` state (line 96):

```ts
  const [waveform, setWaveform] = useState<{ file: string; data: Waveform } | null>(null)
```

- [ ] **Step 5: Add the lazy-fetch effect**

Immediately after the metadata `useEffect` (after line 127), modeled on it:

```ts
  // Lazily fetch the waveform the first time the row is expanded (per file).
  // Peaks are generated in main on the first call and cached by hash, so
  // re-expanding is instant. A row that is never expanded never generates one.
  useEffect(() => {
    const file = track.file
    if (!isOpen || missing || !file || waveform?.file === file) return
    let live = true
    window.plucker.getWaveform(file, track.hash).then((data) => {
      if (live && data) setWaveform({ file, data })
    })
    return () => {
      live = false
    }
  }, [isOpen, track.file, track.hash, missing, waveform?.file])
```

- [ ] **Step 6: Pass the waveform + context menu down to `TrackDetail`**

In the `TrackDetail` usage (~line 337-346), add the two props:

```tsx
          <TrackDetail
            key={editing ? 'edit' : 'view'}
            meta={resolvedMeta}
            source={source}
            file={track.file}
            state={detailState}
            editing={editing}
            onSave={onSaveTags}
            onCancel={onCancelEdit}
            waveform={waveform && waveform.file === track.file ? waveform.data : undefined}
            onContextMenu={onContextMenu}
          />
```

- [ ] **Step 7: Run the tests + typecheck**

Run: `pnpm vitest run src/renderer/src/track-row.test.tsx && pnpm typecheck`
Expected: PASS — all track-row tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/track-row.tsx src/renderer/src/track-row.test.tsx
git commit -m "feat(waveform): lazily fetch the waveform on first row expand"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test` (or `pnpm vitest run`)
Expected: PASS — all tests green.

- [ ] **Step 2: Lint + typecheck + build**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: all succeed.

- [ ] **Step 3: Manual smoke (real ffmpeg path)**

Run: `pnpm dev`, download or open a history/cache track, expand a row. Confirm: bars appear under the tags/source fields and animate in; hovering shows the duration tooltip; right-clicking the waveform opens the same menu as the row; collapsing and re-expanding is instant (cache hit).

- [ ] **Step 4: Final commit (if any lint autofixes)**

```bash
git add -A
git commit -m "chore(waveform): lint and verification fixups" || echo "nothing to commit"
```

---

## Deferred / Optional follow-up

### Exit animation (optional Task 10)

The expanded panel — like every collapsible panel in the app — **unmounts instantly** on collapse (`{isOpen && <TrackDetail … />}` in `track-row.tsx:317`), so there is no exit transition to hook into. A faithful exit animation requires deferring that unmount:

- Introduce a small `useDelayedUnmount(isOpen, 220)` hook (keep rendering for the animation duration after `isOpen` flips false), and add a `.wave-bar--leaving` class (reverse of `wave-rise`) applied during the leaving window.
- This touches `TrackRow`'s collapse mechanics and affects the whole expanded panel, not just the waveform — hence it is scoped separately. Confirm desired behavior with the user before building, since animating only the waveform out while the rest of the panel vanishes instantly would look inconsistent.

Entry animation (Task 6) is fully covered above and is the high-value part.

### Position-aware tooltip + playback

`WaveformStrip` already accepts `progress`/`onSeek`. A later interactive version adds a moving playhead (color-split bars at `progress`), click-to-seek (`onSeek(fraction)`), audio playback, and a cursor-position timestamp tooltip (replacing the static duration tooltip, which the shared `Tooltip` can't do position-aware).
