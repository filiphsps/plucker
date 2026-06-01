# Plucker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Plucker — a self-contained macOS (Ventura+, x86 & ARM) Electron app that downloads a YouTube playlist or video as tagged MP3s, bundling yt-dlp + ffmpeg so nothing external is required.

**Architecture:** Electron three-part split — a Node/TS main process owns the download→tag→rename pipeline and spawns bundled binaries; a React+TS+Tailwind renderer is UI-only; a typed contextBridge preload exposes safe IPC. Pure logic (parsing, match selection, templating, settings) lives in standalone testable modules.

**Tech Stack:** pnpm, electron-vite, Electron, React, TypeScript, Tailwind CSS, vitest, node-id3, bundled `yt-dlp_macos` (universal) + static `ffmpeg` (per-arch), electron-builder.

**Source spec:** `.specs/2026-06-01-plucker-design.md`

---

## File Structure

| File                                                                                                   | Responsibility                                         |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `tailwind.config.ts`, `postcss.config.js` | Project config / build                                 |
| `electron-builder.yml`                                                                                 | Packaging into two arch-specific DMGs                  |
| `vitest.config.ts`                                                                                     | Test runner config                                     |
| `scripts/fetch-binaries.ts`                                                                            | Download yt-dlp + ffmpeg into `resources/bin/`         |
| `resources/bin/universal/yt-dlp`, `resources/bin/{arm64,x64}/ffmpeg`                                   | Bundled binaries (git-ignored)                         |
| `src/shared/types.ts`                                                                                  | Shared TS types across main/preload/renderer           |
| `src/shared/defaults.ts`                                                                               | `DEFAULT_SETTINGS` constant                            |
| `src/main/settings.ts`                                                                                 | Load/validate/migrate/save `~/.plucker.json`           |
| `src/main/title-parser.ts`                                                                             | Parse a YouTube title into `{artist, title}`           |
| `src/main/rename.ts`                                                                                   | Filename template + sanitization                       |
| `src/main/mb-select.ts`                                                                                | Pure: pick best MusicBrainz match from JSON            |
| `src/main/musicbrainz.ts`                                                                              | MB HTTP client: throttle, cache, search/release/genre  |
| `src/main/tagger.ts`                                                                                   | node-id3 read/write + cover-art embedding              |
| `src/main/ytdlp.ts`                                                                                    | Build yt-dlp args, spawn, parse progress lines         |
| `src/main/binaries.ts`                                                                                 | Resolve bundled binary paths (dev vs packaged)         |
| `src/main/pipeline.ts`                                                                                 | Orchestrate resolve→download→tag→rename, emit progress |
| `src/main/index.ts`                                                                                    | App lifecycle, window, IPC registration                |
| `src/preload/index.ts`                                                                                 | contextBridge `window.plucker` API                     |
| `src/renderer/src/App.tsx`                                                                             | Root; switches main view / settings                    |
| `src/renderer/src/DownloadView.tsx`                                                                    | URL input + per-track progress list                    |
| `src/renderer/src/SettingsPanel.tsx`                                                                   | Settings form bound to schema                          |
| `src/renderer/src/main.tsx`, `index.css`                                                               | React entry + Tailwind                                 |

Tests live next to the unit under test as `*.test.ts` (e.g. `src/main/title-parser.test.ts`).

---

## Task 1: Scaffold project + window

**Files:**

- Create: `package.json`, `electron.vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/{main.tsx,App.tsx,index.css}`, `.gitignore`

- [ ] **Step 1: Scaffold with electron-vite**

Run (interactively select **React** + **TypeScript**, project name `.`/`plucker`):

```bash
cd /Users/filiphsandstrom/pl-dl
pnpm create @quick-start/electron plucker -- --template react-ts
```

If the directory must be the current one, scaffold into `plucker/` then move files up, or accept the `plucker/` subdir and treat it as project root for all later paths.

- [ ] **Step 2: Install dependencies**

```bash
cd plucker
pnpm install
pnpm add node-id3
pnpm add -D vitest tailwindcss postcss autoprefixer @types/node
```

- [ ] **Step 3: Configure Tailwind**

Create `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: []
} satisfies Config
```

Create `postcss.config.js`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

Replace `src/renderer/src/index.css` (first lines) with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Minimal dark window**

Set `src/renderer/src/App.tsx`:

```tsx
export default function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
      <h1 className="text-2xl font-semibold">🎵 Plucker</h1>
    </div>
  )
}
```

- [ ] **Step 5: Configure vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
})
```

Add to `package.json` `scripts`: `"test": "vitest run"`.

- [ ] **Step 6: Init git + ignore binaries/artifacts**

Create `.gitignore` (append):

```
node_modules
dist
out
release
resources/bin
.DS_Store
```

```bash
git init && git add -A && git commit -m "chore: scaffold electron-vite + react + tailwind + vitest"
```

- [ ] **Step 7: Verify dev run**

Run: `pnpm dev`
Expected: an Electron window opens showing "🎵 Plucker" on a dark background. Close it. (Manual check.)

- [ ] **Step 8: Verify tests run**

Run: `pnpm test`
Expected: vitest reports "No test files found" (exit 0) — confirms the runner works.

---

## Task 2: Shared types

**Files:**

- Create: `src/shared/types.ts`

- [ ] **Step 1: Define shared types**

Create `src/shared/types.ts`:

```ts
export type CookieSource = 'auto' | 'none' | 'chrome' | 'edge' | 'safari' | 'firefox' | 'brave'

export type Bitrate = 320 | 256 | 192 | 128 // MP3 re-encode target
export type MinBitrate = 64 | 96 | 128 | 160 // source-audio floor

export interface Settings {
  version: number
  downloads: { baseFolder: string; perPlaylistSubfolder: boolean }
  audio: { format: 'mp3'; preferredBitrate: Bitrate; minBitrate: MinBitrate | null }
  cookies: { source: CookieSource }
  tagging: {
    enabled: boolean
    primarySource: 'youtube' | 'musicbrainz'
    enrichWithMusicBrainz: boolean
    fetchCoverArt: boolean
    fetchGenre: boolean
    fetchTrackNumber: boolean
    minMatchScore: number
    userAgentEmail: string
  }
  rename: { enabled: boolean; template: string }
  performance: { parallel: number }
}

export type TrackStatus = 'queued' | 'downloading' | 'tagging' | 'done' | 'failed' | 'skipped'

export interface TrackProgress {
  index: number
  title: string
  status: TrackStatus
  percent?: number
  reason?: string
}

export interface JobProgress {
  jobTitle: string
  total: number
  tracks: TrackProgress[]
}

export interface ParsedTitle {
  artist: string | null
  title: string
}

export interface TrackTags {
  artist?: string
  title?: string
  album?: string
  date?: string
  year?: string
  trackNumber?: string
  genre?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts && git commit -m "feat: shared types"
```

---

## Task 3: Settings module

**Files:**

- Create: `src/shared/defaults.ts`, `src/main/settings.ts`, `src/main/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSettings, saveSettings, expandHome } from './settings'
import { DEFAULT_SETTINGS } from '../shared/defaults'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-'))
  file = join(dir, '.plucker.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('loadSettings', () => {
  it('writes defaults when file is missing', () => {
    const s = loadSettings(file)
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(existsSync(file)).toBe(true)
  })

  it('merges partial settings onto defaults', () => {
    writeFileSync(file, JSON.stringify({ audio: { preferredBitrate: 192 } }))
    const s = loadSettings(file)
    expect(s.audio.preferredBitrate).toBe(192)
    expect(s.audio.format).toBe('mp3') // default preserved
    expect(s.performance.parallel).toBe(DEFAULT_SETTINGS.performance.parallel)
  })

  it('recreates defaults on corrupt JSON', () => {
    writeFileSync(file, '{ not valid json')
    const s = loadSettings(file)
    expect(s).toEqual(DEFAULT_SETTINGS)
  })
})

describe('saveSettings', () => {
  it('round-trips', () => {
    const next = { ...DEFAULT_SETTINGS, performance: { parallel: 8 } }
    saveSettings(file, next)
    expect(JSON.parse(readFileSync(file, 'utf8')).performance.parallel).toBe(8)
  })
})

describe('expandHome', () => {
  it('expands leading ~', () => {
    expect(expandHome('~/Music/Plucker', '/Users/x')).toBe('/Users/x/Music/Plucker')
  })
  it('leaves absolute paths untouched', () => {
    expect(expandHome('/tmp/a', '/Users/x')).toBe('/tmp/a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/settings.test.ts`
Expected: FAIL — cannot resolve `./settings` / `../shared/defaults`.

- [ ] **Step 3: Implement defaults**

Create `src/shared/defaults.ts`:

```ts
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  downloads: { baseFolder: '~/Music/Plucker', perPlaylistSubfolder: true },
  audio: { format: 'mp3', preferredBitrate: 320, minBitrate: null },
  cookies: { source: 'auto' },
  tagging: {
    enabled: true,
    primarySource: 'youtube',
    enrichWithMusicBrainz: true,
    fetchCoverArt: true,
    fetchGenre: true,
    fetchTrackNumber: true,
    minMatchScore: 80,
    userAgentEmail: 'you@example.com'
  },
  rename: { enabled: true, template: '{artist} - {track}. {title} - {album} ({year})' },
  performance: { parallel: 4 }
}
```

- [ ] **Step 4: Implement settings**

Create `src/main/settings.ts`:

```ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Settings } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/defaults'

export function settingsPath(): string {
  return join(homedir(), '.plucker.json')
}

export function expandHome(p: string, home = homedir()): string {
  return p.startsWith('~') ? join(home, p.slice(1)) : p
}

/** Deep-merge a partial object onto defaults, one level per nested group. */
function mergeDefaults(partial: unknown): Settings {
  const p = (partial ?? {}) as Record<string, any>
  const d = DEFAULT_SETTINGS
  return {
    version: d.version,
    downloads: { ...d.downloads, ...(p.downloads ?? {}) },
    audio: { ...d.audio, ...(p.audio ?? {}) },
    cookies: { ...d.cookies, ...(p.cookies ?? {}) },
    tagging: { ...d.tagging, ...(p.tagging ?? {}) },
    rename: { ...d.rename, ...(p.rename ?? {}) },
    performance: { ...d.performance, ...(p.performance ?? {}) }
  }
}

export function loadSettings(file = settingsPath()): Settings {
  if (!existsSync(file)) {
    saveSettings(file, DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
  try {
    return mergeDefaults(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    saveSettings(file, DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(file: string, settings: Settings): void {
  writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8')
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/main/settings.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/defaults.ts src/main/settings.ts src/main/settings.test.ts && git commit -m "feat: settings load/validate/merge"
```

---

## Task 4: Title parser

**Files:**

- Create: `src/main/title-parser.ts`, `src/main/title-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/title-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTitle } from './title-parser'

describe('parseTitle', () => {
  it('splits "Artist - Title"', () => {
    expect(parseTitle('Daft Punk - Around the World')).toEqual({
      artist: 'Daft Punk',
      title: 'Around the World'
    })
  })
  it('strips trailing parenthetical/bracket noise from title', () => {
    expect(parseTitle('Artist - Song (Official Video)')).toEqual({
      artist: 'Artist',
      title: 'Song'
    })
    expect(parseTitle('Artist - Song [HD Remaster]')).toEqual({
      artist: 'Artist',
      title: 'Song'
    })
  })
  it('returns null artist when there is no separator', () => {
    expect(parseTitle('Just A Title (Lyrics)')).toEqual({
      artist: null,
      title: 'Just A Title'
    })
  })
  it('only splits on the first " - "', () => {
    expect(parseTitle('A - B - C')).toEqual({ artist: 'A', title: 'B - C' })
  })
  it('trims whitespace', () => {
    expect(parseTitle('  X  -  Y  ')).toEqual({ artist: 'X', title: 'Y' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/title-parser.test.ts`
Expected: FAIL — cannot resolve `./title-parser`.

- [ ] **Step 3: Implement parser**

Create `src/main/title-parser.ts`:

```ts
import type { ParsedTitle } from '../shared/types'

/** Remove trailing "(...)" / "[...]" noise like "(Official Video)". */
function stripNoise(s: string): string {
  return s.replace(/\s*[([].*$/, '').trim()
}

export function parseTitle(ytTitle: string): ParsedTitle {
  const t = ytTitle.trim()
  const idx = t.indexOf(' - ')
  if (idx === -1) {
    return { artist: null, title: stripNoise(t) }
  }
  const artist = t.slice(0, idx).trim()
  const title = stripNoise(t.slice(idx + 3))
  return { artist: artist || null, title }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/title-parser.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/title-parser.ts src/main/title-parser.test.ts && git commit -m "feat: youtube title parser"
```

---

## Task 5: Filename template + sanitization

**Files:**

- Create: `src/main/rename.ts`, `src/main/rename.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/rename.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeFileName, buildFileName } from './rename'

const TEMPLATE = '{artist} - {track}. {title} - {album} ({year})'

describe('sanitizeFileName', () => {
  it('removes filesystem-unsafe characters', () => {
    expect(sanitizeFileName('a/b<c>d:e"f|g?h*i\\j')).toBe('abcdefghij')
  })
  it('trims leading dots/spaces and trailing spaces', () => {
    expect(sanitizeFileName('  . hello ')).toBe('hello')
  })
})

describe('buildFileName', () => {
  it('renders full template and zero-pads track', () => {
    expect(
      buildFileName(TEMPLATE, {
        artist: 'Daft Punk',
        title: 'Da Funk',
        album: 'Homework',
        year: '1997',
        trackNumber: '3'
      })
    ).toBe('Daft Punk - 03. Da Funk - Homework (1997)')
  })
  it('drops empty segments cleanly (no album/year)', () => {
    expect(
      buildFileName(TEMPLATE, {
        artist: 'A',
        title: 'B',
        trackNumber: '1'
      })
    ).toBe('A - 01. B')
  })
  it('handles missing track (no leading number)', () => {
    expect(buildFileName(TEMPLATE, { artist: 'A', title: 'B' })).toBe('A - B')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/rename.test.ts`
Expected: FAIL — cannot resolve `./rename`.

- [ ] **Step 3: Implement rename**

Create `src/main/rename.ts`:

```ts
import type { TrackTags } from '../shared/types'

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/<>:"|?*\\]/g, '')
    .replace(/^[.\s]+/, '')
    .replace(/\s+$/, '')
}

function pad2(track?: string): string {
  if (!track) return ''
  const n = track.split('/')[0].trim()
  return /^\d+$/.test(n) ? String(Number(n)).padStart(2, '0') : n
}

/**
 * Render the filename template, then collapse artifacts left by empty fields:
 * empty "()", doubled separators, and dangling " - " / ". " fragments.
 */
export function buildFileName(template: string, tags: TrackTags): string {
  let out = template
    .replaceAll('{artist}', tags.artist ?? '')
    .replaceAll('{track}', pad2(tags.trackNumber))
    .replaceAll('{title}', tags.title ?? '')
    .replaceAll('{album}', tags.album ?? '')
    .replaceAll('{year}', tags.year ?? '')

  out = out
    .replace(/\(\s*\)/g, '') // empty parens
    .replace(/\.\s+(?=-|\.|$)/g, ' ') // dangling "03." when no title-follow
    .replace(/\s*-\s*-\s*/g, ' - ') // doubled dashes
    .replace(/^\s*[-.]\s*/, '') // leading separators
    .replace(/\s*[-.]\s*$/, '') // trailing separators
    .replace(/\s{2,}/g, ' ') // collapse spaces
    .trim()

  return sanitizeFileName(out)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/rename.test.ts`
Expected: PASS. If "drops empty segments" or "missing track" assertions fail, adjust the cleanup regex chain until both the full-template and sparse-tag cases match the expected strings — these are the tricky cases the test pins down.

- [ ] **Step 5: Commit**

```bash
git add src/main/rename.ts src/main/rename.test.ts && git commit -m "feat: filename template + sanitization"
```

---

## Task 6: MusicBrainz match selection (pure)

**Files:**

- Create: `src/main/mb-select.ts`, `src/main/mb-select.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/mb-select.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectBestMatch } from './mb-select'

const json = {
  recordings: [
    {
      id: 'rec-low',
      score: 50,
      title: 'Low',
      'artist-credit': [{ artist: { name: 'X' } }],
      releases: [{ id: 'r1', title: 'Single', 'release-group': { 'primary-type': 'Single' } }]
    },
    {
      id: 'rec-hi',
      score: 95,
      title: 'Da Funk',
      'artist-credit': [{ artist: { name: 'Daft Punk' } }],
      releases: [
        {
          id: 'r-single',
          title: 'Da Funk',
          date: '1995',
          'release-group': { 'primary-type': 'Single', id: 'rg-s' }
        },
        {
          id: 'r-album',
          title: 'Homework',
          date: '1997-01-20',
          'release-group': { 'primary-type': 'Album', id: 'rg-a' }
        }
      ]
    }
  ]
}

describe('selectBestMatch', () => {
  it('returns null when no recording meets minScore', () => {
    expect(selectBestMatch(json, 99)).toBeNull()
  })
  it('picks highest-scoring recording and prefers an Album release', () => {
    const m = selectBestMatch(json, 80)
    expect(m).not.toBeNull()
    expect(m!.recordingId).toBe('rec-hi')
    expect(m!.artist).toBe('Daft Punk')
    expect(m!.title).toBe('Da Funk')
    expect(m!.album).toBe('Homework')
    expect(m!.releaseId).toBe('r-album')
    expect(m!.releaseGroupId).toBe('rg-a')
    expect(m!.year).toBe('1997')
  })
  it('falls back to first release when no album exists', () => {
    const onlySingle = {
      recordings: [
        {
          id: 'r',
          score: 90,
          title: 'T',
          'artist-credit': [{ artist: { name: 'A' } }],
          releases: [
            {
              id: 'r1',
              title: 'S',
              date: '2000',
              'release-group': { 'primary-type': 'Single', id: 'g1' }
            }
          ]
        }
      ]
    }
    const m = selectBestMatch(onlySingle, 80)
    expect(m!.releaseId).toBe('r1')
    expect(m!.year).toBe('2000')
  })
  it('returns null on empty/garbage input', () => {
    expect(selectBestMatch({}, 80)).toBeNull()
    expect(selectBestMatch({ recordings: [] }, 80)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/mb-select.test.ts`
Expected: FAIL — cannot resolve `./mb-select`.

- [ ] **Step 3: Implement selection**

Create `src/main/mb-select.ts`:

```ts
export interface MbMatch {
  recordingId: string
  artist: string | null
  title: string
  album: string | null
  date: string | null
  year: string | null
  releaseId: string | null
  releaseGroupId: string | null
}

interface MbRelease {
  id?: string
  title?: string
  date?: string
  'release-group'?: { 'primary-type'?: string; id?: string }
}
interface MbRecording {
  id?: string
  score?: number
  title?: string
  'artist-credit'?: Array<{ artist?: { name?: string } }>
  releases?: MbRelease[]
}

function pickRelease(releases: MbRelease[] = []): MbRelease | null {
  if (releases.length === 0) return null
  const album = releases.find((r) => r['release-group']?.['primary-type'] === 'Album')
  return album ?? releases[0]
}

function year(date?: string): string | null {
  const m = (date ?? '').match(/^(\d{4})/)
  return m ? m[1] : null
}

export function selectBestMatch(json: unknown, minScore: number): MbMatch | null {
  const recs = (json as { recordings?: MbRecording[] })?.recordings ?? []
  const eligible = recs
    .filter((r) => (r.score ?? 0) >= minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const rec = eligible[0]
  if (!rec || !rec.id) return null

  const rel = pickRelease(rec.releases)
  return {
    recordingId: rec.id,
    artist: rec['artist-credit']?.[0]?.artist?.name ?? null,
    title: rec.title ?? '',
    album: rel?.title ?? null,
    date: rel?.date ?? null,
    year: year(rel?.date),
    releaseId: rel?.id ?? null,
    releaseGroupId: rel?.['release-group']?.id ?? null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/mb-select.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/mb-select.ts src/main/mb-select.test.ts && git commit -m "feat: musicbrainz match selection"
```

---

## Task 7: MusicBrainz client (throttle + cache)

**Files:**

- Create: `src/main/musicbrainz.ts`, `src/main/musicbrainz.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/musicbrainz.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { MusicBrainzClient } from './musicbrainz'

function mockFetch(payload: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0)
  })) as unknown as typeof fetch
}

describe('MusicBrainzClient', () => {
  it('searches recordings and sends a User-Agent', async () => {
    const fetchMock = mockFetch({ recordings: [] })
    const c = new MusicBrainzClient('app@example.com', { fetchImpl: fetchMock, throttleMs: 0 })
    await c.searchRecording('Daft Punk', 'Da Funk')
    const [url, init] = (fetchMock as any).mock.calls[0]
    expect(String(url)).toContain('/ws/2/recording')
    expect(String(url)).toContain('fmt=json')
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('app@example.com')
  })

  it('caches identical requests (one network call)', async () => {
    const fetchMock = mockFetch({ recordings: [] })
    const c = new MusicBrainzClient('app@example.com', { fetchImpl: fetchMock, throttleMs: 0 })
    await c.searchRecording('A', 'B')
    await c.searchRecording('A', 'B')
    expect((fetchMock as any).mock.calls.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/musicbrainz.test.ts`
Expected: FAIL — cannot resolve `./musicbrainz`.

- [ ] **Step 3: Implement client**

Create `src/main/musicbrainz.ts`:

```ts
const BASE = 'https://musicbrainz.org/ws/2'

interface Opts {
  fetchImpl?: typeof fetch
  throttleMs?: number
}

export class MusicBrainzClient {
  private ua: string
  private fetchImpl: typeof fetch
  private throttleMs: number
  private last = 0
  private cache = new Map<string, unknown>()

  constructor(email: string, opts: Opts = {}) {
    this.ua = `Plucker/1.0 ( ${email} )`
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.throttleMs = opts.throttleMs ?? 1000
  }

  private async throttle(): Promise<void> {
    const wait = this.throttleMs - (Date.now() - this.last)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.last = Date.now()
  }

  private async getJson(url: string): Promise<unknown> {
    if (this.cache.has(url)) return this.cache.get(url)
    await this.throttle()
    const res = await this.fetchImpl(url, { headers: { 'User-Agent': this.ua } })
    if (!res.ok) throw new Error(`MusicBrainz ${res.status}`)
    const json = await res.json()
    this.cache.set(url, json)
    return json
  }

  async searchRecording(artist: string | null, title: string): Promise<unknown> {
    const parts = [artist ? `artist:"${artist}"` : '', `recording:"${title}"`]
      .filter(Boolean)
      .join(' AND ')
    const q = encodeURIComponent(parts)
    return this.getJson(`${BASE}/recording?query=${q}&fmt=json&limit=5`)
  }

  async getRelease(releaseId: string): Promise<unknown> {
    return this.getJson(`${BASE}/release/${releaseId}?inc=recordings&fmt=json`)
  }

  async getReleaseGroupGenre(rgId: string): Promise<string | null> {
    const json = (await this.getJson(`${BASE}/release-group/${rgId}?inc=genres&fmt=json`)) as {
      genres?: Array<{ name: string; count: number }>
    }
    const top = (json.genres ?? []).sort((a, b) => b.count - a.count)[0]
    return top?.name ?? null
  }

  /** Find the track number for a recording within a release. */
  async getTrackNumber(releaseId: string, recordingId: string): Promise<string | null> {
    const json = (await this.getRelease(releaseId)) as {
      media?: Array<{ tracks?: Array<{ number?: string; recording?: { id?: string } }> }>
    }
    for (const m of json.media ?? []) {
      for (const t of m.tracks ?? []) {
        if (t.recording?.id === recordingId) return t.number ?? null
      }
    }
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/musicbrainz.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/musicbrainz.ts src/main/musicbrainz.test.ts && git commit -m "feat: musicbrainz client with throttle + cache"
```

---

## Task 8: Tagger (node-id3)

**Files:**

- Create: `src/main/tagger.ts`, `src/main/tagger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/tagger.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import NodeID3 from 'node-id3'
import { writeTrackTags, readTrackTags, embedCover } from './tagger'

let dir: string
let mp3: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-tag-'))
  mp3 = join(dir, 'a.mp3')
  // A minimal file with no audio frames is fine for ID3 read/write.
  writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x00]))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('tagger', () => {
  it('writes and reads back core tags', () => {
    writeTrackTags(mp3, {
      artist: 'Daft Punk',
      title: 'Da Funk',
      album: 'Homework',
      date: '1997-01-20',
      year: '1997',
      trackNumber: '3',
      genre: 'House'
    })
    const t = readTrackTags(mp3)
    expect(t.artist).toBe('Daft Punk')
    expect(t.title).toBe('Da Funk')
    expect(t.album).toBe('Homework')
    expect(t.trackNumber).toBe('3')
    expect(t.genre).toBe('House')
  })

  it('embeds cover art from a buffer', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex') // PNG signature bytes
    embedCover(mp3, png, 'image/png')
    const raw = NodeID3.read(mp3)
    expect(raw.image).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/tagger.test.ts`
Expected: FAIL — cannot resolve `./tagger`.

- [ ] **Step 3: Implement tagger**

Create `src/main/tagger.ts`:

```ts
import NodeID3 from 'node-id3'
import type { TrackTags } from '../shared/types'

/** Update (not overwrite) the given tags on an mp3 file. */
export function writeTrackTags(file: string, tags: TrackTags): void {
  const id3: NodeID3.Tags = {}
  if (tags.artist) id3.artist = tags.artist
  if (tags.title) id3.title = tags.title
  if (tags.album) id3.album = tags.album
  if (tags.date) id3.date = tags.date
  if (tags.year) id3.year = tags.year
  if (tags.trackNumber) id3.trackNumber = tags.trackNumber
  if (tags.genre) id3.genre = tags.genre
  const res = NodeID3.update(id3, file)
  if (res !== true) throw new Error(`Failed to write tags: ${String(res)}`)
}

export function readTrackTags(file: string): TrackTags {
  const t = NodeID3.read(file)
  return {
    artist: t.artist,
    title: t.title,
    album: t.album,
    date: t.date,
    year: t.year,
    trackNumber: t.trackNumber,
    genre: t.genre
  }
}

export function embedCover(file: string, image: Buffer, mime = 'image/jpeg'): void {
  const res = NodeID3.update(
    { image: { mime, type: { id: 3 }, description: 'Front Cover', imageBuffer: image } },
    file
  )
  if (res !== true) throw new Error(`Failed to embed cover: ${String(res)}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/tagger.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/tagger.ts src/main/tagger.test.ts && git commit -m "feat: node-id3 tagger"
```

---

## Task 9: yt-dlp argument builder + progress parser

**Files:**

- Create: `src/main/ytdlp.ts`, `src/main/ytdlp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/ytdlp.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDownloadArgs, parseProgressLine, parseSkipLine } from './ytdlp'
import { DEFAULT_SETTINGS } from '../shared/defaults'

describe('buildDownloadArgs', () => {
  it('includes audio extraction, bitrate, ffmpeg location and output template', () => {
    const args = buildDownloadArgs({
      url: 'https://yt/playlist',
      destFolder: '/out',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/bin/ffmpeg'
    })
    expect(args).toContain('--extract-audio')
    expect(args).toContain('--audio-format')
    expect(args).toContain('mp3')
    expect(args).toContain('--audio-quality')
    expect(args).toContain('320K')
    expect(args).toContain('--ffmpeg-location')
    expect(args).toContain('/bin/ffmpeg')
    expect(args).toContain('--ignore-errors')
    expect(args.some((a) => a.includes('/out/'))).toBe(true)
    expect(args[args.length - 1]).toBe('https://yt/playlist')
  })

  it('adds cookies-from-browser when source is a browser', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'edge' as const } }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    expect(args).toContain('--cookies-from-browser')
    expect(args).toContain('edge')
  })

  it('omits cookies when source is none', () => {
    const s = { ...DEFAULT_SETTINGS, cookies: { source: 'none' as const } }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    expect(args).not.toContain('--cookies-from-browser')
  })

  it('adds a no-fallback source-bitrate format filter when minBitrate is set', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      audio: { ...DEFAULT_SETTINGS.audio, minBitrate: 128 as const }
    }
    const args = buildDownloadArgs({ url: 'u', destFolder: '/o', settings: s, ffmpegPath: '/f' })
    const fi = args.indexOf('-f')
    expect(fi).toBeGreaterThanOrEqual(0)
    expect(args[fi + 1]).toBe('ba[abr>=128]') // no "/ba" fallback → skips below-floor videos
  })

  it('omits the format filter when minBitrate is null', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/o',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/f'
    })
    expect(args).not.toContain('-f')
  })
})

describe('parseProgressLine', () => {
  it('parses our custom progress template', () => {
    expect(parseProgressLine('PLUCKER 3 42.5 Song Title')).toEqual({
      index: 3,
      percent: 42.5,
      title: 'Song Title'
    })
  })
  it('returns null for unrelated lines', () => {
    expect(parseProgressLine('[download] Destination: x')).toBeNull()
  })
})

describe('parseSkipLine', () => {
  it('detects a below-floor "format not available" skip and extracts the video id', () => {
    expect(
      parseSkipLine(
        'ERROR: [youtube] dQw4w9WgXcQ: Requested format is not available. Use --list-formats'
      )
    ).toEqual({ videoId: 'dQw4w9WgXcQ' })
  })
  it('returns null for non-skip lines', () => {
    expect(parseSkipLine('[download] 100% of 3.00MiB')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/ytdlp.test.ts`
Expected: FAIL — cannot resolve `./ytdlp`.

- [ ] **Step 3: Implement arg builder + parser**

Create `src/main/ytdlp.ts`:

```ts
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { Settings } from '../shared/types'

export interface DownloadArgsInput {
  url: string
  destFolder: string
  settings: Settings
  ffmpegPath: string
}

// Custom progress line we can parse deterministically:
//   "PLUCKER <playlist_index> <percent_no_%> <title>"
const PROGRESS_TEMPLATE = 'PLUCKER %(info.playlist_index)s %(progress._percent_str)s %(info.title)s'

export function buildDownloadArgs(input: DownloadArgsInput): string[] {
  const { url, destFolder, settings, ffmpegPath } = input
  const args = [
    '--ignore-errors',
    '--extract-audio',
    '--audio-format',
    'mp3',
    '--audio-quality',
    `${settings.audio.preferredBitrate}K`,
    '--embed-thumbnail',
    '--embed-metadata',
    '--ffmpeg-location',
    ffmpegPath,
    '--newline',
    '--progress-template',
    PROGRESS_TEMPLATE.replace('%(progress._percent_str)s', '%(progress._percent)d'),
    '-o',
    join(destFolder, '%(artist,uploader)s - %(track,title)s.%(ext)s'),
    '--yes-playlist'
  ]
  // Source-bitrate floor: select best audio at/above the floor with NO fallback,
  // so below-floor videos yield no format and are skipped under --ignore-errors.
  if (settings.audio.minBitrate != null) {
    args.push('-f', `ba[abr>=${settings.audio.minBitrate}]`)
  }
  if (settings.cookies.source !== 'none' && settings.cookies.source !== 'auto') {
    args.push('--cookies-from-browser', settings.cookies.source)
  }
  args.push(url)
  return args
}

export interface ProgressEvent {
  index: number
  percent: number
  title: string
}

export function parseProgressLine(line: string): ProgressEvent | null {
  const m = line.match(/^PLUCKER\s+(\d+)\s+([\d.]+)\s+(.+)$/)
  if (!m) return null
  return { index: Number(m[1]), percent: Number(m[2]), title: m[3].trim() }
}

export interface SkipEvent {
  videoId: string
}

/** Detect yt-dlp "Requested format is not available" lines (our below-floor skips). */
export function parseSkipLine(line: string): SkipEvent | null {
  const m = line.match(/\[\w+\]\s+([\w-]{6,}):\s+Requested format is not available/)
  return m ? { videoId: m[1] } : null
}

export interface SpawnResult {
  code: number
  stderrTail: string
  skipped: SkipEvent[]
}

/** Spawn yt-dlp, stream progress + skips, resolve with exit code + tail of stderr. */
export function runYtDlp(
  ytdlpPath: string,
  args: string[],
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath, args, { signal })
    let stderrTail = ''
    let outBuf = ''
    let errBuf = ''
    const skipped: SkipEvent[] = []
    const scanSkips = (buf: string): string => {
      const lines = buf.split('\n')
      const rest = lines.pop() ?? ''
      for (const line of lines) {
        const s = parseSkipLine(line)
        if (s) skipped.push(s)
      }
      return rest
    }
    child.stdout.on('data', (d: Buffer) => {
      outBuf += d.toString()
      const lines = outBuf.split('\n')
      outBuf = lines.pop() ?? ''
      for (const line of lines) {
        const e = parseProgressLine(line)
        if (e) onProgress(e)
      }
    })
    child.stderr.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString()).slice(-2000)
      errBuf = scanSkips(errBuf + d.toString())
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? -1, stderrTail, skipped }))
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/ytdlp.test.ts`
Expected: PASS (all 9 tests). `buildDownloadArgs`, `parseProgressLine`, and `parseSkipLine` are unit-tested; `runYtDlp` is exercised by the Task 14 manual smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/main/ytdlp.ts src/main/ytdlp.test.ts && git commit -m "feat: yt-dlp args + progress parsing"
```

---

## Task 10: Binary resolver + fetch script

**Files:**

- Create: `src/main/binaries.ts`, `src/main/binaries.test.ts`, `scripts/fetch-binaries.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/binaries.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { binaryPaths } from './binaries'

describe('binaryPaths', () => {
  it('uses resources/bin in dev', () => {
    const p = binaryPaths({
      packaged: false,
      arch: 'arm64',
      resourcesPath: '/app/res',
      projectRoot: '/proj'
    })
    expect(p.ytdlp).toBe('/proj/resources/bin/universal/yt-dlp')
    expect(p.ffmpeg).toBe('/proj/resources/bin/arm64/ffmpeg')
  })
  it('uses resourcesPath when packaged', () => {
    const p = binaryPaths({
      packaged: true,
      arch: 'x64',
      resourcesPath: '/app/res',
      projectRoot: '/proj'
    })
    expect(p.ytdlp).toBe('/app/res/bin/universal/yt-dlp')
    expect(p.ffmpeg).toBe('/app/res/bin/x64/ffmpeg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/binaries.test.ts`
Expected: FAIL — cannot resolve `./binaries`.

- [ ] **Step 3: Implement resolver**

Create `src/main/binaries.ts`:

```ts
import { join } from 'node:path'

export interface BinaryEnv {
  packaged: boolean
  arch: 'arm64' | 'x64'
  resourcesPath: string
  projectRoot: string
}

export interface BinaryPaths {
  ytdlp: string
  ffmpeg: string
}

export function binaryPaths(env: BinaryEnv): BinaryPaths {
  const base = env.packaged
    ? join(env.resourcesPath, 'bin')
    : join(env.projectRoot, 'resources', 'bin')
  return {
    ytdlp: join(base, 'universal', 'yt-dlp'),
    ffmpeg: join(base, env.arch, 'ffmpeg')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/binaries.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Write the fetch script**

Create `scripts/fetch-binaries.ts`:

```ts
/**
 * Downloads pinned yt-dlp (universal) + static ffmpeg (arm64, x64) into
 * resources/bin/. Run once after clone and before packaging.
 *   pnpm tsx scripts/fetch-binaries.ts
 */
import { mkdirSync, createWriteStream, chmodSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const ROOT = join(import.meta.dirname, '..')
const BIN = join(ROOT, 'resources', 'bin')

// Pin a known-good yt-dlp release (universal2 macOS binary, supports macOS 10.15+).
const YTDLP_VERSION = '2025.09.26'
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_macos`

// Static ffmpeg builds (per arch). osxexperts.net publishes signed static builds;
// pin the exact URLs you downloaded and verified. Placeholders below MUST be set
// to real, verified URLs before running.
const FFMPEG = {
  arm64: process.env.FFMPEG_ARM64_URL ?? '',
  x64: process.env.FFMPEG_X64_URL ?? ''
}

async function download(url: string, dest: string): Promise<void> {
  if (!url) throw new Error(`Missing URL for ${dest} (set the env var / pin the URL)`)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`)
  mkdirSync(join(dest, '..'), { recursive: true })
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest))
  chmodSync(dest, 0o755)
  console.log('✓', dest)
}

async function main(): Promise<void> {
  await download(YTDLP_URL, join(BIN, 'universal', 'yt-dlp'))
  await download(FFMPEG.arm64, join(BIN, 'arm64', 'ffmpeg'))
  await download(FFMPEG.x64, join(BIN, 'x64', 'ffmpeg'))
  if (!existsSync(join(BIN, 'universal', 'yt-dlp'))) throw new Error('yt-dlp missing')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

Add dev dep + script: `pnpm add -D tsx` and add `"fetch-binaries": "tsx scripts/fetch-binaries.ts"` to `package.json` scripts.

- [ ] **Step 6: Commit**

```bash
git add src/main/binaries.ts src/main/binaries.test.ts scripts/fetch-binaries.ts package.json && git commit -m "feat: binary resolver + fetch script"
```

> **Note for executor:** ffmpeg static-build URLs are environment-specific and must be pinned to real, verified downloads (osxexperts.net or evermeet.cx for x64) that support macOS Ventura on each arch. Set `FFMPEG_ARM64_URL` / `FFMPEG_X64_URL` and run `pnpm fetch-binaries`. Confirm each runs: `resources/bin/arm64/ffmpeg -version`.

---

## Task 11: Pipeline orchestration

**Files:**

- Create: `src/main/pipeline.ts`, `src/main/pipeline.test.ts`

- [ ] **Step 1: Write the failing test (folder + enrichment logic)**

Create `src/main/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { destFolderFor, mergeTags } from './pipeline'
import { DEFAULT_SETTINGS } from '../shared/defaults'

describe('destFolderFor', () => {
  it('nests playlist title under base when perPlaylistSubfolder', () => {
    expect(destFolderFor('/base', 'My Playlist', true, 'playlist')).toBe('/base/My Playlist')
  })
  it('sanitizes the playlist folder name', () => {
    expect(destFolderFor('/base', 'A/B:C', true, 'playlist')).toBe('/base/ABC')
  })
  it('uses base directly for single videos', () => {
    expect(destFolderFor('/base', 'whatever', true, 'video')).toBe('/base')
  })
  it('uses base when subfolder disabled', () => {
    expect(destFolderFor('/base', 'My Playlist', false, 'playlist')).toBe('/base')
  })
})

describe('mergeTags (youtube primary, musicbrainz enrich)', () => {
  const yt = { artist: 'YT Artist', title: 'YT Title' }
  const mb = {
    artist: 'MB Artist',
    title: 'MB Title',
    album: 'MB Album',
    year: '1999',
    genre: 'Rock'
  }
  it('keeps YouTube values, fills gaps from MusicBrainz', () => {
    const merged = mergeTags(yt, mb, DEFAULT_SETTINGS)
    expect(merged.artist).toBe('YT Artist') // YT wins
    expect(merged.title).toBe('YT Title') // YT wins
    expect(merged.album).toBe('MB Album') // gap filled
    expect(merged.year).toBe('1999') // gap filled
    expect(merged.genre).toBe('Rock') // gap filled
  })
  it('inverts precedence when primarySource is musicbrainz', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      tagging: { ...DEFAULT_SETTINGS.tagging, primarySource: 'musicbrainz' as const }
    }
    const merged = mergeTags(yt, mb, s)
    expect(merged.artist).toBe('MB Artist')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/pipeline.test.ts`
Expected: FAIL — cannot resolve `./pipeline`.

- [ ] **Step 3: Implement pipeline (pure helpers + orchestrator)**

Create `src/main/pipeline.ts`:

```ts
import { mkdirSync, readdirSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, TrackTags, JobProgress, TrackProgress } from '../shared/types'
import { sanitizeFileName, buildFileName } from './rename'
import { parseTitle } from './title-parser'
import { selectBestMatch } from './mb-select'
import { MusicBrainzClient } from './musicbrainz'
import { readTrackTags, writeTrackTags, embedCover } from './tagger'
import { buildDownloadArgs, runYtDlp } from './ytdlp'
import type { BinaryPaths } from './binaries'

export function destFolderFor(
  base: string,
  jobTitle: string,
  perPlaylistSubfolder: boolean,
  kind: 'playlist' | 'video'
): string {
  if (kind === 'video' || !perPlaylistSubfolder) return base
  return join(base, sanitizeFileName(jobTitle))
}

/** YouTube vs MusicBrainz precedence; non-primary only fills gaps. */
export function mergeTags(yt: TrackTags, mb: TrackTags, settings: Settings): TrackTags {
  const primary = settings.tagging.primarySource === 'youtube' ? yt : mb
  const secondary = settings.tagging.primarySource === 'youtube' ? mb : yt
  const pick = (k: keyof TrackTags): string | undefined => primary[k] || secondary[k]
  return {
    artist: pick('artist'),
    title: pick('title'),
    album: pick('album'),
    date: pick('date'),
    year: pick('year'),
    trackNumber: pick('trackNumber'),
    genre: pick('genre')
  }
}

export interface ResolvedJob {
  kind: 'playlist' | 'video'
  title: string
}

/** Resolve playlist/video metadata via yt-dlp --dump-single-json. */
export async function resolveJob(ytdlpPath: string, url: string): Promise<ResolvedJob> {
  const { spawnSync } = await import('node:child_process')
  const out = spawnSync(ytdlpPath, ['--flat-playlist', '--dump-single-json', url], {
    encoding: 'utf8'
  })
  if (out.status !== 0) throw new Error(out.stderr.slice(-2000) || 'yt-dlp resolve failed')
  const json = JSON.parse(out.stdout)
  const isPlaylist = json._type === 'playlist' || Array.isArray(json.entries)
  return { kind: isPlaylist ? 'playlist' : 'video', title: json.title ?? 'Plucker' }
}

export interface RunJobDeps {
  bin: BinaryPaths
  settings: Settings
  homeBase: string // expanded base folder
  onProgress: (p: JobProgress) => void
  mbFetch?: typeof fetch
  signal?: AbortSignal
}

/** Full pipeline: resolve → download → tag/enrich → rename. */
export async function runJob(url: string, deps: RunJobDeps): Promise<void> {
  const { bin, settings, homeBase, onProgress, signal } = deps
  const job = await resolveJob(bin.ytdlp, url)
  const dest = destFolderFor(homeBase, job.title, settings.downloads.perPlaylistSubfolder, job.kind)
  mkdirSync(dest, { recursive: true })

  const tracks: TrackProgress[] = []
  const emit = (): void =>
    onProgress({ jobTitle: job.title, total: tracks.length, tracks: [...tracks] })

  // Download
  const args = buildDownloadArgs({ url, destFolder: dest, settings, ffmpegPath: bin.ffmpeg })
  const res = await runYtDlp(
    bin.ytdlp,
    args,
    (e) => {
      let t = tracks.find((x) => x.index === e.index)
      if (!t) {
        t = { index: e.index, title: e.title, status: 'downloading' }
        tracks.push(t)
      }
      t.percent = e.percent
      t.status = e.percent >= 100 ? 'tagging' : 'downloading'
      t.title = e.title
      emit()
    },
    signal
  )
  if (res.code !== 0 && tracks.length === 0 && res.skipped.length === 0) {
    throw new Error(res.stderrTail || 'Download failed')
  }
  // Below-floor videos that yt-dlp skipped: surface them as 'skipped'.
  let skipIdx = -1
  for (const s of res.skipped) {
    tracks.push({
      index: skipIdx--,
      title: s.videoId,
      status: 'skipped',
      reason: 'below minimum quality'
    })
  }
  if (res.skipped.length) emit()

  // Tag + enrich
  if (settings.tagging.enabled) {
    const mb = new MusicBrainzClient(settings.tagging.userAgentEmail, { fetchImpl: deps.mbFetch })
    for (const file of readdirSync(dest).filter((f) => f.endsWith('.mp3'))) {
      const full = join(dest, file)
      const ytTags = readTrackTags(full)
      const parsed = parseTitle(ytTags.title ?? file.replace(/\.mp3$/, ''))
      const ytNorm: TrackTags = {
        ...ytTags,
        artist: ytTags.artist || parsed.artist || undefined,
        title: parsed.title
      }

      let mbTags: TrackTags = {}
      if (settings.tagging.enrichWithMusicBrainz) {
        try {
          const search = await mb.searchRecording(ytNorm.artist ?? null, ytNorm.title ?? '')
          const match = selectBestMatch(search, settings.tagging.minMatchScore)
          if (match) {
            mbTags = {
              artist: match.artist ?? undefined,
              title: match.title,
              album: match.album ?? undefined,
              date: match.date ?? undefined,
              year: match.year ?? undefined
            }
            if (settings.tagging.fetchTrackNumber && match.releaseId) {
              mbTags.trackNumber =
                (await mb.getTrackNumber(match.releaseId, match.recordingId)) ?? undefined
            }
            if (settings.tagging.fetchGenre && match.releaseGroupId) {
              mbTags.genre = (await mb.getReleaseGroupGenre(match.releaseGroupId)) ?? undefined
            }
            if (
              settings.tagging.fetchCoverArt &&
              match.releaseId &&
              (deps.mbFetch !== undefined) === false
            ) {
              try {
                const cover = await fetch(
                  `https://coverartarchive.org/release/${match.releaseId}/front-500`
                )
                if (cover.ok) embedCover(full, Buffer.from(await cover.arrayBuffer()), 'image/jpeg')
              } catch {
                /* keep embedded youtube thumbnail */
              }
            }
          }
        } catch {
          /* keep youtube tags, not enriched */
        }
      }

      const merged = mergeTags(ytNorm, mbTags, settings)
      writeTrackTags(full, merged)

      // Rename
      if (settings.rename.enabled) {
        const newName = buildFileName(settings.rename.template, merged)
        if (newName) {
          const target = join(dest, `${newName}.mp3`)
          if (target !== full && !existsSync(target)) renameSync(full, target)
        }
      }
      const t =
        tracks.find((x) => x.title && parsed.title.includes(x.title)) ??
        tracks.find((x) => x.status === 'tagging')
      if (t) {
        t.status = 'done'
        emit()
      }
    }
  }
  tracks.forEach((t) => {
    if (t.status !== 'failed' && t.status !== 'skipped') t.status = 'done'
  })
  emit()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/pipeline.test.ts`
Expected: PASS (all 6 tests). Only `destFolderFor` and `mergeTags` are unit-tested; `runJob`/`resolveJob` are validated in the Task 14 manual smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline.ts src/main/pipeline.test.ts && git commit -m "feat: download/tag/rename pipeline"
```

---

## Task 12: IPC wiring + preload bridge

**Files:**

- Modify: `src/main/index.ts`
- Create: `src/preload/index.ts` (replace scaffold), `src/preload/index.d.ts`

- [ ] **Step 1: Implement preload bridge**

Replace `src/preload/index.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Settings, JobProgress } from '../shared/types'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  saveSettings: (s: Settings): Promise<void> => ipcRenderer.invoke('settings:save', s),
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:chooseFolder'),
  startDownload: (url: string): Promise<void> => ipcRenderer.invoke('job:start', url),
  cancel: (): Promise<void> => ipcRenderer.invoke('job:cancel'),
  onProgress: (cb: (p: JobProgress) => void): (() => void) => {
    const fn = (_: unknown, p: JobProgress): void => cb(p)
    ipcRenderer.on('job:progress', fn)
    return () => ipcRenderer.removeListener('job:progress', fn)
  }
}

contextBridge.exposeInMainWorld('plucker', api)
export type PluckerApi = typeof api
```

Create `src/preload/index.d.ts`:

```ts
import type { PluckerApi } from './index'
declare global {
  interface Window {
    plucker: PluckerApi
  }
}
```

- [ ] **Step 2: Register IPC handlers in main**

In `src/main/index.ts`, after the app is ready and `mainWindow` exists, add:

```ts
import { ipcMain, dialog, app } from 'electron'
import { arch } from 'node:os'
import { loadSettings, saveSettings, settingsPath, expandHome } from './settings'
import { binaryPaths } from './binaries'
import { runJob } from './pipeline'
import type { Settings } from '../shared/types'

let abort: AbortController | null = null

function registerIpc(getWindow: () => Electron.BrowserWindow | null): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_e, s: Settings) => saveSettings(settingsPath(), s))
  ipcMain.handle('dialog:chooseFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('job:cancel', () => {
    abort?.abort()
  })
  ipcMain.handle('job:start', async (_e, url: string) => {
    const settings = loadSettings()
    const bin = binaryPaths({
      packaged: app.isPackaged,
      arch: arch() === 'arm64' ? 'arm64' : 'x64',
      resourcesPath: process.resourcesPath,
      projectRoot: app.getAppPath()
    })
    abort = new AbortController()
    await runJob(url, {
      bin,
      settings,
      homeBase: expandHome(settings.downloads.baseFolder),
      onProgress: (p) => getWindow()?.webContents.send('job:progress', p),
      signal: abort.signal
    })
  })
}
```

Call `registerIpc(() => mainWindow)` once after the main window is created. Confirm `webPreferences` uses `contextIsolation: true`, `nodeIntegration: false`, and the scaffold's preload path.

- [ ] **Step 3: Verify type-check + dev boot**

Run: `pnpm build` (or `pnpm typecheck` if defined)
Expected: compiles with no type errors.
Run: `pnpm dev` → window still opens, no console errors about preload. (Manual.)

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts && git commit -m "feat: IPC + preload bridge"
```

---

## Task 13: Renderer — DownloadView

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/DownloadView.tsx`

- [ ] **Step 1: Implement DownloadView**

Create `src/renderer/src/DownloadView.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { JobProgress } from '../../shared/types'

const ICON: Record<string, string> = {
  queued: '○',
  downloading: '⬇',
  tagging: '🏷',
  done: '✓',
  failed: '✗',
  skipped: '–'
}

export function DownloadView({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)

  useEffect(() => window.plucker.onProgress(setProgress), [])

  const done = progress?.tracks.filter((t) => t.status === 'done').length ?? 0

  async function start(): Promise<void> {
    if (!url.trim()) return
    setBusy(true)
    try {
      await window.plucker.startDownload(url.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">🎵 Plucker</h1>
        <button
          onClick={onOpenSettings}
          className="text-neutral-400 hover:text-neutral-100 text-xl"
          aria-label="Settings"
        >
          ⚙︎
        </button>
      </header>

      <div>
        <label className="text-sm text-neutral-400">Paste a YouTube playlist or video URL</label>
        <div className="mt-2 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/playlist…"
            className="flex-1 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 outline-none focus:border-neutral-600"
          />
          <button
            onClick={start}
            disabled={busy}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-2 font-medium"
          >
            {busy ? 'Plucking…' : 'Pluck'}
          </button>
        </div>
      </div>

      {progress && (
        <div className="flex-1 overflow-auto rounded-lg border border-neutral-800">
          <div className="px-4 py-2 text-sm text-neutral-400 border-b border-neutral-800">
            {progress.jobTitle} · {progress.total} tracks
          </div>
          <ul className="divide-y divide-neutral-900">
            {progress.tracks.map((t) => (
              <li key={t.index} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="w-5 text-center">{ICON[t.status]}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-neutral-500 w-24 text-right">
                  {t.status === 'downloading' ? `${Math.round(t.percent ?? 0)}%` : t.status}
                </span>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2 border-t border-neutral-800 text-sm flex items-center justify-between">
            <span>
              {done} / {progress.total}
            </span>
            {busy && (
              <button
                onClick={() => window.plucker.cancel()}
                className="text-red-400 hover:text-red-300"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire App to toggle views**

Replace `src/renderer/src/App.tsx`:

```tsx
import { useState } from 'react'
import { DownloadView } from './DownloadView'
import { SettingsPanel } from './SettingsPanel'

export default function App(): JSX.Element {
  const [showSettings, setShowSettings] = useState(false)
  return (
    <>
      <DownloadView onOpenSettings={() => setShowSettings(true)} />
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  )
}
```

(`SettingsPanel` is created in Task 14; if running before then, temporarily stub it.)

- [ ] **Step 3: Verify dev boot**

Run: `pnpm dev`
Expected: input + Pluck button render on dark UI; clicking the gear toggles (once Task 14 exists). (Manual.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/DownloadView.tsx src/renderer/src/App.tsx && git commit -m "feat: download view UI"
```

---

## Task 14: Renderer — SettingsPanel + end-to-end smoke

**Files:**

- Create: `src/renderer/src/SettingsPanel.tsx`

- [ ] **Step 1: Implement SettingsPanel**

Create `src/renderer/src/SettingsPanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Settings, Bitrate, MinBitrate, CookieSource } from '../../shared/types'

const BITRATES: Bitrate[] = [320, 256, 192, 128]
const MIN_BITRATES: MinBitrate[] = [64, 96, 128, 160]
const SOURCES: CookieSource[] = ['auto', 'none', 'chrome', 'edge', 'safari', 'firefox', 'brave']

export function SettingsPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    window.plucker.getSettings().then(setS)
  }, [])
  if (!s) return <div />

  const set = (patch: Partial<Settings>): void => setS({ ...s, ...patch })

  async function save(): Promise<void> {
    if (s) {
      await window.plucker.saveSettings(s)
      onClose()
    }
  }
  async function chooseFolder(): Promise<void> {
    const f = await window.plucker.chooseFolder()
    if (f) set({ downloads: { ...s!.downloads, baseFolder: f } })
  }

  const field = 'w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm'

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end">
      <div className="w-[420px] h-full bg-neutral-950 text-neutral-100 p-5 overflow-auto border-l border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">
            ✕
          </button>
        </div>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Downloads</h3>
          <div className="flex gap-2 items-center">
            <input
              className={field}
              value={s.downloads.baseFolder}
              onChange={(e) => set({ downloads: { ...s.downloads, baseFolder: e.target.value } })}
            />
            <button
              onClick={chooseFolder}
              className="text-sm px-2 py-1 border border-neutral-800 rounded"
            >
              Choose
            </button>
          </div>
          <label className="flex gap-2 items-center mt-2 text-sm">
            <input
              type="checkbox"
              checked={s.downloads.perPlaylistSubfolder}
              onChange={(e) =>
                set({ downloads: { ...s.downloads, perPlaylistSubfolder: e.target.checked } })
              }
            />
            Per-playlist subfolder
          </label>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Audio</h3>
          <label className="text-sm">
            Preferred bitrate
            <select
              className={field}
              value={s.audio.preferredBitrate}
              onChange={(e) =>
                set({ audio: { ...s.audio, preferredBitrate: Number(e.target.value) as Bitrate } })
              }
            >
              {BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b}K
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm mt-2 block">
            Minimum source quality (skip below)
            <select
              className={field}
              value={s.audio.minBitrate ?? ''}
              onChange={(e) =>
                set({
                  audio: {
                    ...s.audio,
                    minBitrate: e.target.value ? (Number(e.target.value) as MinBitrate) : null
                  }
                })
              }
            >
              <option value="">Off</option>
              {MIN_BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b}K
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Cookies</h3>
          <select
            className={field}
            value={s.cookies.source}
            onChange={(e) => set({ cookies: { source: e.target.value as CookieSource } })}
          >
            {SOURCES.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Tagging</h3>
          {(
            [
              ['enabled', 'Enable tagging'],
              ['enrichWithMusicBrainz', 'Enrich with MusicBrainz'],
              ['fetchCoverArt', 'Fetch album cover'],
              ['fetchGenre', 'Fetch genre'],
              ['fetchTrackNumber', 'Fetch track number']
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex gap-2 items-center text-sm">
              <input
                type="checkbox"
                checked={s.tagging[k] as boolean}
                onChange={(e) => set({ tagging: { ...s.tagging, [k]: e.target.checked } })}
              />
              {label}
            </label>
          ))}
          <label className="text-sm mt-2 block">
            Primary source
            <select
              className={field}
              value={s.tagging.primarySource}
              onChange={(e) =>
                set({
                  tagging: {
                    ...s.tagging,
                    primarySource: e.target.value as 'youtube' | 'musicbrainz'
                  }
                })
              }
            >
              <option value="youtube">YouTube</option>
              <option value="musicbrainz">MusicBrainz</option>
            </select>
          </label>
          <label className="text-sm mt-2 block">
            Min match score
            <input
              type="number"
              className={field}
              value={s.tagging.minMatchScore}
              onChange={(e) =>
                set({ tagging: { ...s.tagging, minMatchScore: Number(e.target.value) } })
              }
            />
          </label>
          <label className="text-sm mt-2 block">
            MusicBrainz contact email
            <input
              className={field}
              value={s.tagging.userAgentEmail}
              onChange={(e) => set({ tagging: { ...s.tagging, userAgentEmail: e.target.value } })}
            />
          </label>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Naming</h3>
          <label className="flex gap-2 items-center text-sm">
            <input
              type="checkbox"
              checked={s.rename.enabled}
              onChange={(e) => set({ rename: { ...s.rename, enabled: e.target.checked } })}
            />
            Rename files after tagging
          </label>
          <input
            className={`${field} mt-2`}
            value={s.rename.template}
            onChange={(e) => set({ rename: { ...s.rename, template: e.target.value } })}
          />
          <p className="text-xs text-neutral-500 mt-1">
            Tokens: {'{artist} {track} {title} {album} {year}'}
          </p>
        </section>

        <section className="mb-6">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Performance</h3>
          <label className="text-sm">
            Parallel downloads
            <input
              type="number"
              min={1}
              max={16}
              className={field}
              value={s.performance.parallel}
              onChange={(e) => set({ performance: { parallel: Number(e.target.value) } })}
            />
          </label>
        </section>

        <button
          onClick={save}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 font-medium"
        >
          Done
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify settings round-trip in app**

Run: `pnpm dev`. Open settings, change preferred bitrate to 256, click Done, reopen settings.
Expected: bitrate still 256. Confirm `~/.plucker.json` on disk shows `"preferredBitrate": 256`. (Manual.)

- [ ] **Step 3: End-to-end smoke (real, after binaries fetched)**

Pre-req: `pnpm fetch-binaries` succeeded and `resources/bin/arm64/ffmpeg -version` works.
Run: `pnpm dev`, paste a short public playlist URL (2–3 tracks), click Pluck.
Expected: tracks appear, progress advances to 100%, files land in `~/Music/Plucker/<playlist>/`, MP3s carry artist/title/album tags, and (if rename on) are renamed per template. Verify a file's tags with `resources/bin/universal/yt-dlp --version` is unrelated — instead inspect via the app's re-read or any tag viewer. (Manual.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/SettingsPanel.tsx && git commit -m "feat: settings panel UI"
```

---

## Task 15: Packaging — two arch-specific DMGs

**Files:**

- Create: `electron-builder.yml`
- Modify: `package.json` (build scripts)

- [ ] **Step 1: Configure electron-builder**

Create `electron-builder.yml`:

```yaml
appId: com.plucker.app
productName: Plucker
directories:
  output: release
files:
  - out/**/*
  - package.json
mac:
  category: public.app-category.music
  target:
    - target: dmg
      arch: [arm64, x64]
  identity: null # unsigned
extraResources:
  - from: resources/bin/universal
    to: bin/universal
    filter: ['**/*']
  - from: resources/bin/${arch}
    to: bin/${arch}
    filter: ['**/*']
```

Add to `package.json` scripts:

```json
"build:mac": "electron-vite build && electron-builder --mac --arm64 --x64 --config electron-builder.yml"
```

Ensure `electron-builder` is a dev dependency: `pnpm add -D electron-builder`.

- [ ] **Step 2: Build the DMGs**

Pre-req: binaries present in `resources/bin/`.
Run: `pnpm build:mac`
Expected: `release/` contains `Plucker-<version>-arm64.dmg` and `Plucker-<version>-x64.dmg` (or `-mac.dmg` variants per arch). (Manual.)

- [ ] **Step 3: Verify a packaged app launches**

Open the DMG matching your machine's arch, drag to Applications, right-click → Open (unsigned).
Expected: Plucker launches; a short playlist downloads end-to-end using only the bundled binaries (test on a machine without yt-dlp/ffmpeg on PATH if possible). (Manual.)

- [ ] **Step 4: Commit**

```bash
git add electron-builder.yml package.json && git commit -m "build: package two arch-specific macOS DMGs"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** download/tag/rename pipeline (Tasks 9–11), settings + `~/.plucker.json` (Task 3), all schema fields surfaced in UI (Task 14), cookie auto-detect/config (Tasks 9 + 14), MP3 encode bitrate + source-quality floor with skip-and-report (Task 9 `-f "ba[abr>=N]"` no-fallback + `parseSkipLine`; Task 11 surfaces skipped tracks; Task 14 exposes the off/64/96/128/160 scale), YouTube-primary/MusicBrainz-enrich (Task 11 `mergeTags`), 1 req/s throttle + cache (Task 7), bundled universal yt-dlp + per-arch ffmpeg (Tasks 10, 15), two unsigned DMGs (Task 15), testing strategy (vitest tasks throughout).
- **Min-quality floor (resolved):** enforced as a _source_ floor via format selection with no fallback so below-floor videos are skipped under `--ignore-errors` and reported as `skipped`; the floor uses its own off/64/96/128/160 scale, distinct from the 320/256/192/128 encode target. Smoke test should confirm a deliberately low floor (160) actually skips and reports.
- **Type consistency:** `Settings`, `TrackTags`, `TrackProgress`, `JobProgress`, `MbMatch`, `BinaryPaths` names are used consistently across tasks; `mergeTags`, `selectBestMatch`, `buildFileName`, `buildDownloadArgs`, `parseProgressLine`, `binaryPaths`, `runJob` signatures match their definitions and call sites.
