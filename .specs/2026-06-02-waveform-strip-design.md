# Waveform strip in the expanded track panel — design

## Goal

Render a **real** audio waveform inside the expanded track-list item, under the
tags/source fields. The waveform is a **static visual** for now, but the data
shape and component API are structured so an interactive player (playhead +
click-to-seek + playback) can be added later without a rewrite.

Shows on **all row variants** (download, history, cache) wherever an on-disk
file exists. Skipped for failed/missing tracks and in cache tag-edit mode.

## npm investigation (why custom)

| Option | Real audio? | Verdict |
| --- | --- | --- |
| `wavesurfer.js` / `@wavesurfer/react` | Yes | Full player around an audio **URL** (canvas + WebAudio). Forcing it into the sandboxed renderer means piping the whole file across IPC + a custom protocol. Overkill for a static viz; revisit only if real playback is wanted. |
| `react-audio-visualize` | Yes | Takes a `Blob`, draws a static canvas waveform — still needs the file shipped into the renderer to decode. |
| `react-wavify` | **No** | Decorative animated sine wave, not the track's audio. |
| **Custom (ffmpeg peaks in main → tiny bar component)** | Yes | Matches the existing architecture: heavy work in main, cached by content hash, lightweight hand-rolled renderer (cf. the `Meter` component). No new dependency. |

**Decision: custom.** The npm players are built around *playing* audio from a
URL, which fights the sandboxed-renderer + main-does-the-heavy-lifting design
already used for cover art and audio metadata.

## Hard requirement: lazy, generate-once, cache

- **No eager generation.** Peaks are computed only inside the `waveform:get` IPC
  handler, which is only invoked by the `TrackRow` effect that fires **on first
  expand**. A row the user never expands never invokes ffmpeg.
- **Generate-once, then cache.** First expand → ffmpeg decode → store peaks in
  the existing hash-keyed metadata cache. Every later expand (same track, even
  across sessions) is a cache read — no ffmpeg.
- **No batch/preload pass.** Nothing walks the history/cache list generating
  waveforms ahead of time.

## Architecture

### 1. Peak generation — `src/main/waveform.ts` (+ `waveform.test.ts`)

Shells out to the bundled `ffmpeg-static` to decode audio to mono raw PCM
(`-f s16le -ac 1 -ar <low sample rate>`), then downsamples to a fixed
**N = 120** buckets. Each bucket is the normalized `0..1` max absolute amplitude
of its window.

The pure downsampling/normalization logic (PCM buffer → `number[]`) is split out
and unit-tested in isolation, mirroring how `audio-trim.ts` / `audio-meta.ts`
separate parse logic from the ffmpeg spawn. Any ffmpeg/decode error resolves to
`null`.

### 2. Types — `src/shared/types.ts`

```ts
export interface Waveform {
  /** Normalized 0..1 peaks, length N (120). */
  peaks: number[]
  /** Carried for a future playhead; maps playback time → bar index. */
  durationSec?: number
}
```

Storing `durationSec` + a normalized peaks array is the playback-ready hook: a
later interactive version derives the playhead bar from playback time with no
re-computation.

### 3. Cache — `src/main/metadata-cache.ts`

Add `readPeaks(hash)` / `writePeaks(hash, peaks)` alongside the existing
`readAudio` / `writeAudio`. Peaks are content-stable, so the audio content hash
is the natural key, identical to the audio-metadata caching already in place.

### 4. IPC — sibling of `metadata:get`

- Main: `ipcMain.handle('waveform:get', (_e, file, hash) => getWaveform(file, hash, forBinaries(currentBin(), getMetaCache())))`.
  Returns `Waveform | null` (`null` when the file is unreadable or decode fails).
- Preload: `getWaveform: (file: string, hash?: string): Promise<Waveform | null> => ipcRenderer.invoke('waveform:get', file, hash)`.
- `getWaveform(file, hash, deps)` checks the cache first (`deps.cache.readPeaks(key)`),
  otherwise generates, writes, and returns. Reuses the same hash-fallback
  (`hash ?? hashFile(file)`) pattern as `getTrackMetadata`.

### 5. Render component — `src/renderer/src/ui/meta/waveform-strip.tsx` (+ test)

Presentational, sibling to `MetaStrip` / `MetaGrid`:

```ts
function WaveformStrip({
  peaks,         // number[] 0..1
  onContextMenu, // (e: React.MouseEvent) => void | undefined — opens the row menu
  progress,      // 0..1 | undefined — future playhead position
  onSeek,        // (fraction: number) => void | undefined — future
}): React.JSX.Element
```

- **Discrete vertical bars mirrored from a center baseline** (chosen style). One
  `<span>` per peak in a `flex` row with a small gap, height scaled by the peak,
  transform-origin center — the same hand-rolled approach as `Meter`, no canvas,
  no npm dep.
- Today all bars use a dimmed accent/ink color. When `progress` is set later,
  bars left of the playhead render in `accent`, the rest in `ink-faint` — the
  only thing playback adds is the color split; the geometry already exists.
- `onSeek` / `progress` are accepted now but unused; the bars container is a
  plain div today, trivially upgraded to a clickable seek surface later. This is
  the playback-ready seam.
- Empty/short `peaks` (e.g. `[]`) renders nothing (returns null / zero height),
  so callers need no guards.
- **Entry/exit animation.** Bars animate in on mount — a brief staggered
  grow-from-baseline (height/opacity, transform-origin center) so the waveform
  "rises" left-to-right when the row expands, and fades/collapses on unmount.
  CSS-only (Tailwind transition/keyframes + per-bar `animation-delay` by index);
  respects `prefers-reduced-motion` (renders at final state, no motion).
- **Tooltip + context menu integration.** The bars container forwards
  `onContextMenu` (so right-clicking the waveform opens the same row menu) and is
  wrapped in the shared `Tooltip` showing the track duration
  (`formatDuration(durationSec)`). Both reuse existing primitives — no new infra.

### 6. Wiring — `src/renderer/src/ui/meta/track-detail.tsx`

`TrackDetail` gains optional `waveform?: Waveform` and
`onContextMenu?: (e: React.MouseEvent) => void` props. When the waveform is
present and `state === 'ready'` and **not** `editing`, it renders
`<WaveformStrip peaks={waveform.peaks} durationSec={waveform.durationSec} onContextMenu={onContextMenu} />`
as the **last child of the flex column**, under the tags/source grid, separated
by the existing `gap-3.5`. `onContextMenu` is the same handler `TrackRow` already
builds for the row header (from `trackRowMenuItems`), now threaded through so a
right-click on the waveform opens the identical menu.

### 7. Lazy fetch — `src/renderer/src/track-row.tsx`

Add `const [waveform, setWaveform] = useState<{ file: string; data: Waveform } | null>(null)`
and a sibling `useEffect` modeled exactly on the existing metadata effect
(lines 117–127): on first expand (`isOpen`), guarded by `missing` / `!file` and
de-duped per file, call `window.plucker.getWaveform(file, hash)` and store the
result. Pass the resolved `Waveform` down to `TrackDetail`. Because peaks are
cached by hash in main, re-expanding is instant.

### 8. i18n

No new visible strings required. If a screen-reader `aria-label` ("waveform") is
added, it goes in both `en` and `de` locale files, matching the trim-silence
precedent.

## Failure handling

Any ffmpeg/decode error → `null` → strip silently omitted; never blocks the
panel. Generation is async and off the metadata render path, so it never delays
the existing expanded-panel content.

## Tests

- `waveform.test.ts` — PCM-bucket downsampling/normalization math (deterministic
  input → expected normalized peaks).
- `waveform-strip.test.tsx` — renders the correct number of bars; renders
  nothing for empty peaks; forwards `onContextMenu`; shows the duration tooltip.
- `track-detail.test.tsx` — waveform appears when provided; absent in edit mode.
- `track-row.test.tsx` — waveform fetched on expand; not fetched for
  missing/no-file rows.

## Out of scope (deferred)

- Actual audio playback, playhead animation, click-to-seek (data/API hooks are
  in place; behavior is not built).
- A position-aware tooltip showing the timestamp under the cursor — the shared
  `Tooltip` shows a single static label; this lands with the playback work.
- Any eager/background peak generation.
