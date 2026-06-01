# Download Page Loading State — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Per project rule:
> work inline on the current branch, no new branches/worktrees. Commits are held
> until the whole plan is verified (single commit at the end, on request).

**Goal:** Show an instant, informative loading state on the download page during
the yt-dlp resolve phase — verbose console output + curated steps, skeleton
fallback, and inline error display.

**Architecture:** A parallel `job:status` IPC channel feeds a `statusLog` in
`App`, rendered by a new `ResolvePanel`. The download page shows the panel
whenever a job is resolving and no real `JobProgress` has arrived yet.

**Tech Stack:** Electron (main/preload/renderer), React 19, react-i18next,
Tailwind tokens, Vitest + `renderToStaticMarkup`.

## File map

- `src/shared/types.ts` — add `JobStatus`.
- `src/main/pipeline.ts` — `isRelevantStatusLine` helper; `resolvePlaylist`
  gains `--verbose` + `onLine`; `runJob` emits `onStatus`.
- `src/main/pipeline.test.ts` — tests for `isRelevantStatusLine`.
- `src/main/index.ts` — forward `onStatus` → `job:status`; emit error on throw.
- `src/preload/index.ts` — `onStatus` subscription.
- `src/renderer/src/resolve-panel.tsx` — new loading panel.
- `src/renderer/src/resolve-panel.test.tsx` — panel tests.
- `src/renderer/src/i18n/locales/en.ts` + `de.ts` — `resolve` namespace.
- `src/renderer/src/app.tsx` — `statusLog` state + wiring.
- `src/renderer/src/download-view.tsx` — `onStart`, `statusLog` prop, display
  priority.

---

### Task 1: `JobStatus` type

**Files:** Modify `src/shared/types.ts` (after `JobProgress`).

- [ ] **Step 1:** Add the interface:

```ts
/**
 * Lifecycle status emitted before the first JobProgress (and on a failed start),
 * driving the download view's loading panel during playlist/video resolution.
 */
export interface JobStatus {
  phase: 'resolving' | 'error'
  /** Curated, translatable step. Renderer maps via i18n `resolve.<key>`. */
  key?: 'launching' | 'resolving' | 'resolved'
  /** Interpolation params for `key` (e.g. { count }). */
  params?: Record<string, string | number>
  /** Raw yt-dlp stderr line, shown verbatim (untranslated). */
  line?: string
  /** Human-readable error message when phase === 'error'. */
  error?: string
}
```

- [ ] **Step 2:** Typecheck: `pnpm typecheck` → no errors.

---

### Task 2: `isRelevantStatusLine` filter (TDD)

**Files:** Modify `src/main/pipeline.ts`; Test `src/main/pipeline.test.ts`.

- [ ] **Step 1: Failing test** — append to `pipeline.test.ts`:

```ts
import { destFolderFor, parseEntries, isRelevantStatusLine } from './pipeline'

describe('isRelevantStatusLine', () => {
  it('keeps extraction/progress lines', () => {
    expect(isRelevantStatusLine('[youtube:tab] Downloading page 1')).toBe(true)
    expect(isRelevantStatusLine('[download] Downloading playlist: My Mix')).toBe(true)
  })
  it('drops the verbose [debug] environment dump', () => {
    expect(isRelevantStatusLine('[debug] yt-dlp version 2025.01.01')).toBe(false)
    expect(isRelevantStatusLine('[debug] Proxy map: {}')).toBe(false)
  })
  it('drops empty / whitespace-only lines', () => {
    expect(isRelevantStatusLine('')).toBe(false)
    expect(isRelevantStatusLine('   ')).toBe(false)
  })
})
```

(Replace the existing `import { destFolderFor, parseEntries } from './pipeline'`
line with the combined import above.)

- [ ] **Step 2:** Run: `pnpm test -- pipeline` → FAIL (`isRelevantStatusLine` not exported).

- [ ] **Step 3:** Add to `pipeline.ts` (near the top-level helpers, before `resolvePlaylist`):

```ts
/** Verbose yt-dlp stderr is noisy: drop the `[debug]` env dump and blank lines,
 *  keep extraction/progress/info/warning/error lines for the status panel. */
export function isRelevantStatusLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (t.startsWith('[debug] ')) return false
  return true
}
```

- [ ] **Step 4:** Run: `pnpm test -- pipeline` → PASS.

---

### Task 3: Stream stderr lines from `resolvePlaylist`

**Files:** Modify `src/main/pipeline.ts`.

- [ ] **Step 1:** Change the signature and spawn args, and stream lines. Replace
      the current `resolvePlaylist` body's spawn + stderr handling. New version:

```ts
export async function resolvePlaylist(
  ytdlpPath: string,
  url: string,
  onLine?: (line: string) => void
): Promise<ResolvedJob> {
  const { spawn } = await import('node:child_process')
  const { stdout, stderr, code, error } = await new Promise<{
    stdout: string
    stderr: string
    code: number
    error?: Error
  }>((resolve) => {
    // `--verbose` makes yt-dlp emit extraction progress on stderr; stdout stays
    // pure JSON. Lines are forwarded (filtered) to `onLine` for the status panel.
    const child = spawn(ytdlpPath, ['--verbose', '--flat-playlist', '--dump-single-json', url])
    let stdout = ''
    let stderr = ''
    let pending = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
      pending += d.toString()
      const parts = pending.split('\n')
      pending = parts.pop() ?? ''
      for (const ln of parts) if (onLine && isRelevantStatusLine(ln)) onLine(ln.trim())
    })
    child.on('error', (error) => resolve({ stdout, stderr, code: -1, error }))
    child.on('close', (c) => {
      if (onLine && isRelevantStatusLine(pending)) onLine(pending.trim())
      resolve({ stdout, stderr, code: c ?? -1 })
    })
  })
  if (error) throw new Error(`yt-dlp failed to start: ${error.message}`)
  if (code !== 0) throw new Error(stderr.slice(-2000) || `yt-dlp exited ${code}`)
  if (!stdout.trim()) throw new Error('yt-dlp returned no metadata')
  return parseEntries(JSON.parse(stdout))
}
```

- [ ] **Step 2:** Typecheck: `pnpm typecheck` → no errors. (Process-level
      streaming is verified in the manual run at the end; the pure filter is already
      unit-tested in Task 2.)

---

### Task 4: Emit `onStatus` from `runJob`

**Files:** Modify `src/main/pipeline.ts`.

- [ ] **Step 1:** Add `onStatus` to `RunJobDeps` (after `onProgress`):

```ts
  onProgress: (p: JobProgress) => void
  /** Pre-resolution lifecycle status (resolving phase + console lines). */
  onStatus?: (s: JobStatus) => void
```

- [ ] **Step 2:** Import the type — extend the existing types import at the top:

```ts
import type { Settings, JobProgress, JobStatus, TrackProgress, HistoryTrack } from '../shared/types'
```

- [ ] **Step 3:** In `runJob`, destructure and emit around `resolvePlaylist`.
      Replace the line `const job = await timed('resolve-playlist', ... )` with:

```ts
const { onStatus } = deps
onStatus?.({ phase: 'resolving', key: 'launching' })
const job = await timed('resolve-playlist', 'pipeline', () =>
  resolvePlaylist(bin.ytdlp, url, (line) => onStatus?.({ phase: 'resolving', line }))
)
onStatus?.({ phase: 'resolving', key: 'resolved', params: { count: job.entries.length } })
```

(`const { bin, settings, homeBase, onProgress, signal } = deps` stays as-is.)

- [ ] **Step 4:** Typecheck: `pnpm typecheck` → no errors.

---

### Task 5: Forward status over IPC + surface errors

**Files:** Modify `src/main/index.ts` (`job:start` handler, ~lines 131-164).

- [ ] **Step 1:** Pass `onStatus` into `runJob` deps and wrap in try/catch.
      Replace the handler body so it reads:

```ts
ipcMain.handle('job:start', async (_e, url: string, folderOverride?: string) => {
  const settings = loadSettings()
  abort = new AbortController()
  try {
    const result = await runJob(url, {
      bin: currentBin(),
      settings,
      homeBase: expandHome(settings.downloads.baseFolder),
      cache: getMetaCache(),
      onProgress: (p) => {
        const win = getWindow()
        win?.webContents.send('job:progress', p)
        win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
      },
      onStatus: (s) => getWindow()?.webContents.send('job:status', s),
      signal: abort.signal,
      folderOverride
    })
    getWindow()?.setProgressBar(-1)

    // Record to history (re-load fresh so we don't clobber edits made during the run).
    if (result.tracks.length > 0) {
      const entry: HistoryEntry = {
        id: randomUUID(),
        url: result.url,
        title: result.title,
        folder: result.folder,
        kind: result.kind,
        completedAt: new Date().toISOString(),
        tracks: result.tracks
      }
      const fresh = loadSettings()
      saveSettings(settingsPath(), { ...fresh, history: addEntry(fresh.history, entry) })
      getWindow()?.webContents.send('history:changed')
    }
  } catch (err) {
    getWindow()?.setProgressBar(-1)
    getWindow()?.webContents.send('job:status', {
      phase: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
    throw err
  }
})
```

- [ ] **Step 2:** Typecheck: `pnpm typecheck` → no errors.

---

### Task 6: Preload `onStatus`

**Files:** Modify `src/preload/index.ts`.

- [ ] **Step 1:** Add `JobStatus` to the types import:

```ts
import type {
  Settings,
  JobProgress,
  JobStatus,
  HistoryEntry,
  MenuNavTarget,
  TrackMetadata,
  CachedTrack,
  TrackTags
} from '../shared/types'
```

- [ ] **Step 2:** Add the subscription right after `onProgress`:

```ts
  onStatus: (cb: (s: JobStatus) => void): (() => void) => {
    const fn = (_: unknown, s: JobStatus): void => cb(s)
    ipcRenderer.on('job:status', fn)
    return () => ipcRenderer.removeListener('job:status', fn)
  },
```

- [ ] **Step 3:** Typecheck: `pnpm typecheck` → no errors. (`window.plucker`
      picks up `onStatus` automatically via `PluckerApi = typeof api`.)

---

### Task 7: i18n `resolve` namespace

**Files:** Modify `src/renderer/src/i18n/locales/en.ts` and `de.ts`.

- [ ] **Step 1:** In `en.ts`, add after the `download: { … },` block:

```ts
  resolve: {
    title: 'Starting download',
    launching: 'Launched yt-dlp',
    resolving: 'Resolving playlist…',
    resolved_one: 'Found {{count}} track',
    resolved_other: 'Found {{count}} tracks',
    errorTitle: 'Couldn’t start download'
  },
```

- [ ] **Step 2:** In `de.ts`, add after its `download: { … },` block:

```ts
  resolve: {
    title: 'Download wird gestartet',
    launching: 'yt-dlp gestartet',
    resolving: 'Playlist wird aufgelöst…',
    resolved_one: '{{count}} Titel gefunden',
    resolved_other: '{{count}} Titel gefunden',
    errorTitle: 'Download konnte nicht gestartet werden'
  },
```

- [ ] **Step 3:** Typecheck: `pnpm typecheck` → no errors (the i18n resource
      type is inferred from `en.ts`; keep key parity in `de.ts`).

---

### Task 8: `ResolvePanel` component (TDD)

**Files:** Create `src/renderer/src/resolve-panel.tsx`; Test
`src/renderer/src/resolve-panel.test.tsx`.

- [ ] **Step 1: Failing test** — create `resolve-panel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { ResolvePanel } from './resolve-panel'

describe('ResolvePanel', () => {
  it('shows a skeleton (no log lines) when no events have arrived', () => {
    const html = renderToStaticMarkup(<ResolvePanel events={[]} />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('Starting download')
  })

  it('renders a curated step and a raw yt-dlp line', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel
        events={[
          { phase: 'resolving', key: 'launching' },
          { phase: 'resolving', line: '[youtube:tab] Downloading page 1' }
        ]}
      />
    )
    expect(html).toContain('Launched yt-dlp')
    expect(html).toContain('[youtube:tab] Downloading page 1')
    expect(html).not.toContain('animate-pulse')
  })

  it('renders the resolved count via pluralized i18n', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel events={[{ phase: 'resolving', key: 'resolved', params: { count: 24 } }]} />
    )
    expect(html).toContain('Found 24 tracks')
  })

  it('surfaces an error event with the error title and message', () => {
    const html = renderToStaticMarkup(
      <ResolvePanel events={[{ phase: 'error', error: 'yt-dlp exited 1' }]} />
    )
    expect(html).toContain('Couldn’t start download')
    expect(html).toContain('yt-dlp exited 1')
  })
})
```

- [ ] **Step 2:** Run: `pnpm test -- resolve-panel` → FAIL (module not found).

- [ ] **Step 3:** Create `resolve-panel.tsx`:

```tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { JobStatus } from '../../shared/types'

/** Loading panel shown on the download page during the yt-dlp resolve phase:
 *  curated i18n steps + live (verbose) console lines, skeleton before anything
 *  streams in, and an inline error block on a failed start. */
export function ResolvePanel({ events }: { events: JobStatus[] }): React.JSX.Element {
  const { t } = useTranslation()
  const errored = events.some((e) => e.phase === 'error')

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-6">
      <div className="flex items-center gap-2.5">
        {!errored && <Loader2 size={15} className="animate-spin text-accent" />}
        <span className={`text-[13px] font-semibold ${errored ? 'text-bad' : 'text-ink'}`}>
          {errored ? t('resolve.errorTitle') : t('resolve.title')}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col gap-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-line" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-line" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-line" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-[7px] border border-line bg-[#0a0b0e] p-3 font-mono text-[11px] leading-relaxed">
          {events.map((e, i) => (
            <div
              key={i}
              className={e.phase === 'error' ? 'text-bad' : e.key ? 'text-ink' : 'text-ink-faint'}
            >
              {e.phase === 'error' ? e.error : e.key ? t(`resolve.${e.key}`, e.params) : e.line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4:** Run: `pnpm test -- resolve-panel` → PASS.

---

### Task 9: Wire into `App` and `DownloadView`

**Files:** Modify `src/renderer/src/app.tsx`, `src/renderer/src/download-view.tsx`.

- [ ] **Step 1:** `app.tsx` — import the type and add state. After
      `const [progress, setProgress] = useState<JobProgress | null>(null)` add:

```ts
const [statusLog, setStatusLog] = useState<JobStatus[] | null>(null)
```

Extend the import on line 10:

```ts
import type { JobProgress, JobStatus } from '../../shared/types'
```

- [ ] **Step 2:** `app.tsx` — replace the progress subscription
      (`useEffect(() => window.plucker.onProgress(setProgress), [])`) with one that
      also clears the status log, and add the status subscription:

```ts
useEffect(
  () =>
    window.plucker.onProgress((p) => {
      setProgress(p)
      setStatusLog(null) // real track list takes over
    }),
  []
)

useEffect(
  () =>
    window.plucker.onStatus((s) => setStatusLog((prev) => (prev ? [...prev, s].slice(-60) : [s]))),
  []
)
```

- [ ] **Step 3:** `app.tsx` — pass `statusLog` and an `onStart` that resets
      state synchronously to `DownloadView`. Replace the `<DownloadView … />` line:

```tsx
<DownloadView
  progress={progress}
  statusLog={statusLog}
  onRunningChange={setRunning}
  onStart={() => {
    setProgress(null)
    setStatusLog([])
  }}
/>
```

- [ ] **Step 4:** `download-view.tsx` — update imports and props:

```ts
import type { JobProgress, JobStatus } from '../../shared/types'
import { TrackRow } from './track-row'
import { ResolvePanel } from './resolve-panel'
```

```ts
export function DownloadView({
  progress,
  statusLog,
  onRunningChange,
  onStart
}: {
  progress: JobProgress | null
  statusLog: JobStatus[] | null
  onRunningChange: (running: boolean) => void
  onStart: () => void
}): React.JSX.Element {
```

- [ ] **Step 5:** `download-view.tsx` — call `onStart()` and guard against
      unhandled rejection in `start()`:

```ts
async function start(): Promise<void> {
  if (!url.trim()) return
  setBusy(true)
  onRunningChange(true)
  onStart()
  try {
    await window.plucker.startDownload(url.trim())
  } catch {
    // Resolve/start errors are surfaced in the ResolvePanel via job:status.
  } finally {
    setBusy(false)
    onRunningChange(false)
  }
}
```

- [ ] **Step 6:** `download-view.tsx` — update the display priority. Replace the
      `{progress && ( … )}` / `{!progress && ( … )}` block at the bottom with:

```tsx
{
  progress ? (
    <>
      {/* column header */}
      <div className="flex items-center gap-3 border-b border-line py-[7px] pl-[42px] pr-4 font-mono text-[9.5px] uppercase tracking-[1px] text-ink-faint">
        <span className="w-[22px]">#</span>
        <span className="flex-1">{t('download.colTrack')}</span>
        <span className="w-[64px]" />
        <span className="w-[188px]">{t('download.colProgress')}</span>
        <span className="w-16 text-right">{t('download.colStatus')}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {progress.tracks.map((tr) => (
          <TrackRow
            key={tr.index}
            variant="download"
            index={tr.index}
            track={tr}
            active={tr.index === activeIndex}
            source={{ videoId: tr.videoId }}
          />
        ))}
      </div>
    </>
  ) : statusLog !== null ? (
    <ResolvePanel events={statusLog} />
  ) : (
    <div className="flex flex-1 items-center justify-center text-ink-faint">
      {t('download.emptyHint')}
    </div>
  )
}
```

- [ ] **Step 7:** Typecheck: `pnpm typecheck` → no errors.

---

### Task 10: Full verification

- [ ] **Step 1:** `pnpm lint` → clean.
- [ ] **Step 2:** `pnpm typecheck` → clean.
- [ ] **Step 3:** `pnpm test` → all pass.
- [ ] **Step 4:** `pnpm build` → succeeds.
- [ ] **Step 5: Manual run** (`pnpm dev`): paste a playlist URL, press Pluck.
      Verify: skeleton appears instantly → "Launched yt-dlp" → live `[youtube…]` /
      `[download]` lines → "Found N tracks" → track list replaces the panel. Paste a
      bogus URL → error title + yt-dlp message render in red. Switch tabs mid-resolve
      and back → panel state preserved (Activity freeze).
- [ ] **Step 6:** Commit (only after explicit go-ahead) — single conventional
      commit, e.g. `feat(download): add resolve-phase loading state with live yt-dlp output`.

## Self-review notes

- **Spec coverage:** instant skeleton (Task 9 onStart → `[]`), live verbose
  output (Tasks 3-4 + filter Task 2), curated i18n steps (Tasks 4, 7, 8),
  skeleton fallback (Task 8), inline errors (Tasks 5, 8, 9). All covered.
- **Type consistency:** `JobStatus` shape identical across types/pipeline/
  preload/panel; `onStatus`/`onStart`/`statusLog` names consistent across
  app/download-view; i18n keys (`launching`/`resolving`/`resolved`/`title`/
  `errorTitle`) match the `key` union and panel lookups.
- **No placeholders:** every step shows full code/commands.
