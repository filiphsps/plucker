# Transform Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plucker's monolithic per-file post-download loop with an ordered, configurable chain of versioned transforms applied per-track, transform each track the instant it downloads (concurrently), list the whole playlist upfront, and drive the Electron progress bar.

**Architecture:** A `TransformDefinition` (main-side) declares `allowMultiple`, `failureMode`, a config schema, defaults, and a `run(ctx, config, services)` function. Each track is processed on a temp working copy that atomically replaces the original on success. Settings store an ordered list of `TransformInstance`s (schema v2; old `tagging`/`rename` blocks removed, fresh defaults on migration). The single playlist `yt-dlp` process emits a per-file completion sentinel; each completion dispatches that track's chain into a bounded concurrency pool. The settings UI renders a reorderable instance list with a schema-driven config form. Built-ins this iteration: `auto-tag` and `rename`.

**Tech Stack:** Electron + electron-vite, React + TypeScript + Tailwind, vitest, node-id3, yt-dlp/ffmpeg, react-i18next. Package manager: **pnpm** (never npm/npx).

**Build-green note:** Run `pnpm test <file>` per task to keep targeted tests green. The v2 schema change in Task 2 intentionally breaks `pipeline.ts` and `SettingsPanel.tsx` type-wise until Tasks 11/15 land; **full `pnpm typecheck` and `pnpm build` are only expected to pass at Task 18.** Do not "fix" the breakage early by reintroducing the old blocks.

---

## File Structure

**Create:**

- `src/shared/transforms.ts` — shared, serializable transform types (`ConfigField`, `TransformInstance`, `TransformManifest`).
- `src/main/transforms/types.ts` — main-only types (`TransformDefinition`, `TrackContext`, `TransformServices`, `ChainResult`).
- `src/main/transforms/auto-tag.ts` + `auto-tag.test.ts` — the auto-tag transform + pure helpers.
- `src/main/transforms/rename.ts` + `rename-transform.test.ts` — the rename transform.
- `src/main/transforms/registry.ts` + `registry.test.ts` — type→definition map + serializable catalog.
- `src/main/transforms/run-chain.ts` + `run-chain.test.ts` — runs a chain on a track (temp copy, failureMode, commit).
- `src/main/pool.ts` + `pool.test.ts` — bounded dynamic concurrency pool.
- `src/renderer/src/SchemaForm.tsx` + `SchemaForm.test.tsx` — generic schema-driven config form.
- `src/renderer/src/TransformsSection.tsx` + `TransformsSection.test.tsx` — reorderable instance list.

**Modify:**

- `src/shared/types.ts` — Settings v2 (`transforms`, drop `tagging`/`rename`), `TrackStatus` add `'transforming'`, `TrackProgress.transformPercent`, `JobProgress.overall`.
- `src/shared/defaults.ts` — `version: 2`, default `transforms` chain, drop `tagging`/`rename`.
- `src/main/settings.ts` — `mergeDefaults` v1→v2 migration.
- `src/main/ytdlp.ts` — completion sentinel arg, `parseCompleteLine`, `onComplete` in `runYtDlp`.
- `src/main/pipeline.ts` — `resolveJob`→`resolvePlaylist` (entries), `runJob` rewrite, remove `mergeTags`.
- `src/main/pipeline.test.ts` — drop `mergeTags` test (moved), keep `destFolderFor`.
- `src/main/index.ts` — `transforms:catalog` IPC, `setProgressBar` from `overall`.
- `src/preload/index.ts` + `src/preload/index.d.ts` — `getTransformCatalog`.
- `src/renderer/src/SettingsPanel.tsx` — replace Tagging+Naming with `<TransformsSection>`.
- `src/renderer/src/DownloadView.tsx` — `'transforming'` icon + status.
- `src/renderer/src/i18n/locales/en.ts` + `de.ts` — transform strings + `status.transforming`.

---

## Task 1: Shared transform contract types

**Files:**

- Create: `src/shared/transforms.ts`

These are pure types consumed by both renderer and main. No runtime behavior — verified by `pnpm typecheck` at Task 18.

- [ ] **Step 1: Create the shared types file**

```ts
// src/shared/transforms.ts

/** A single configurable field, used to render the settings form generically. */
export type ConfigField =
  | { key: string; labelKey: string; type: 'boolean'; default: boolean }
  | { key: string; labelKey: string; type: 'number'; default: number; min?: number; max?: number }
  | { key: string; labelKey: string; type: 'string'; default: string }
  | {
      key: string
      labelKey: string
      type: 'enum'
      default: string
      options: { value: string; labelKey: string }[]
    }

/** A configured transform in the user's chain (persisted in settings). */
export interface TransformInstance {
  instanceId: string
  type: string
  enabled: boolean
  config: Record<string, unknown>
}

/** Serializable description of a transform type, sent to the renderer for the UI. */
export interface TransformManifest {
  type: string
  apiVersion: number
  labelKey: string
  descriptionKey: string
  allowMultiple: boolean
  configSchema: ConfigField[]
  defaultConfig: Record<string, unknown>
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/transforms.ts
git commit -m "feat: shared transform contract types"
```

---

## Task 2: Settings schema v2 + defaults + migration

**Files:**

- Modify: `src/shared/types.ts:9-28` (Settings), `:30` (TrackStatus), `:32-44` (TrackProgress), `:46-54` (JobProgress)
- Modify: `src/shared/defaults.ts`
- Modify: `src/main/settings.ts:15-30` (mergeDefaults)
- Test: `src/main/settings.test.ts`

- [ ] **Step 1: Write the failing migration test**

Add to `src/main/settings.test.ts` (keep existing tests):

```ts
import { DEFAULT_SETTINGS } from '../shared/defaults'

describe('mergeDefaults v1→v2 migration', () => {
  it('resets transforms to defaults and drops old blocks when version < 2', () => {
    const v1 = {
      version: 1,
      downloads: { baseFolder: '/custom', perPlaylistSubfolder: false },
      performance: { parallel: 8 },
      tagging: { enabled: true, primarySource: 'musicbrainz' },
      rename: { enabled: true, template: 'x' }
    }
    const f = join(tmpdir(), `plucker-mig-${Date.now()}.json`)
    writeFileSync(f, JSON.stringify(v1))
    const s = loadSettings(f)
    expect(s.version).toBe(2)
    expect(s.transforms).toEqual(DEFAULT_SETTINGS.transforms)
    expect(s.downloads.baseFolder).toBe('/custom') // preserved
    expect(s.performance.parallel).toBe(8) // preserved
    expect('tagging' in s).toBe(false)
    expect('rename' in s).toBe(false)
  })

  it('preserves a custom v2 transforms array', () => {
    const v2 = {
      version: 2,
      transforms: [{ instanceId: 'x', type: 'rename', enabled: false, config: { template: 'y' } }]
    }
    const f = join(tmpdir(), `plucker-v2-${Date.now()}.json`)
    writeFileSync(f, JSON.stringify(v2))
    const s = loadSettings(f)
    expect(s.transforms).toHaveLength(1)
    expect(s.transforms[0].config.template).toBe('y')
  })
})
```

Ensure the test file imports at top (add if missing): `import { writeFileSync } from 'node:fs'`, `import { tmpdir } from 'node:os'`, `import { join } from 'node:path'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/settings.test.ts`
Expected: FAIL — `s.transforms` undefined / `version` is 1.

- [ ] **Step 3: Update shared types**

In `src/shared/types.ts`, add the import at the top:

```ts
import type { TransformInstance } from './transforms'
```

Replace the `Settings` interface (lines 9-28) with:

```ts
export interface Settings {
  version: number
  language: Language
  history: HistoryEntry[]
  downloads: { baseFolder: string; perPlaylistSubfolder: boolean }
  audio: { format: 'mp3'; preferredBitrate: Bitrate; minBitrate: MinBitrate | null }
  cookies: { source: CookieSource }
  transforms: TransformInstance[]
  performance: { parallel: number }
}
```

Replace the `TrackStatus` line with (adds `transforming`):

```ts
export type TrackStatus = 'queued' | 'downloading' | 'transforming' | 'done' | 'failed' | 'skipped'
```

In `TrackProgress`, add after `percent?: number`:

```ts
  /** 0..100 progress within the transform phase. */
  transformPercent?: number
```

In `JobProgress`, add:

```ts
/** 0..1 overall job progress (download-weighted), for the OS progress bar. */
overall: number
```

- [ ] **Step 4: Update defaults**

Replace `src/shared/defaults.ts` entirely:

```ts
import type { Settings } from './types'
import type { TransformInstance } from './transforms'

export const DEFAULT_TRANSFORMS: TransformInstance[] = [
  {
    instanceId: 'auto-tag-default',
    type: 'auto-tag',
    enabled: true,
    config: {
      primarySource: 'youtube',
      enrichWithMusicBrainz: true,
      fetchCoverArt: true,
      fetchGenre: true,
      fetchTrackNumber: true,
      minMatchScore: 80,
      userAgentEmail: 'you@example.com'
    }
  },
  {
    instanceId: 'rename-default',
    type: 'rename',
    enabled: true,
    config: { template: '{artist} - {track}. {title} - {album} ({year})' }
  }
]

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  language: 'system',
  history: [],
  downloads: { baseFolder: '~/Music/Plucker', perPlaylistSubfolder: true },
  audio: { format: 'mp3', preferredBitrate: 320, minBitrate: null },
  cookies: { source: 'auto' },
  transforms: DEFAULT_TRANSFORMS,
  performance: { parallel: 4 }
}
```

- [ ] **Step 5: Update mergeDefaults**

Replace `mergeDefaults` in `src/main/settings.ts` (lines 15-30) with:

```ts
/** Merge a partial object onto defaults; reset transforms when migrating from < v2. */
function mergeDefaults(partial: unknown): Settings {
  const p = (partial ?? {}) as Partial<Settings> & { version?: number }
  const d = DEFAULT_SETTINGS
  const isV2 = typeof p.version === 'number' && p.version >= 2
  return {
    version: d.version,
    language: p.language ?? d.language,
    history: Array.isArray(p.history) ? (p.history as Settings['history']) : d.history,
    downloads: { ...d.downloads, ...(p.downloads ?? {}) },
    audio: { ...d.audio, ...(p.audio ?? {}) },
    cookies: { ...d.cookies, ...(p.cookies ?? {}) },
    transforms:
      isV2 && Array.isArray(p.transforms) ? (p.transforms as Settings['transforms']) : d.transforms,
    performance: { ...d.performance, ...(p.performance ?? {}) }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/main/settings.test.ts`
Expected: PASS (both new tests + existing ones).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/settings.ts src/main/settings.test.ts
git commit -m "feat: settings schema v2 with transforms list + migration"
```

---

## Task 3: Main transform types

**Files:**

- Create: `src/main/transforms/types.ts`

Pure types — verified by typecheck at Task 18.

- [ ] **Step 1: Create the file**

```ts
// src/main/transforms/types.ts
import type { TrackTags } from '../../shared/types'
import type { ConfigField } from '../../shared/transforms'
import type { BinaryPaths } from '../binaries'

/** Mutable state threaded through a transform chain for one track. */
export interface TrackContext {
  /** Temp working copy; audio-rewriting transforms mutate it & may reassign it. */
  workingFile: string
  /** In-memory tags, last-wins; flushed to the file at commit. */
  tags: TrackTags
  info: { videoId?: string; rawTitle: string; sourceFile: string; index: number }
  /** Desired final basename (no extension); set by rename, used at commit. */
  outputName?: string
}

/** Cross-cutting services available to every transform. */
export interface TransformServices {
  bin: BinaryPaths
  fetch: typeof fetch
  signal?: AbortSignal
  log: (msg: string) => void
  /** Report 0..1 progress within this transform's step (optional to call). */
  reportProgress: (fraction: number) => void
}

export interface TransformDefinition<C = Record<string, unknown>> {
  type: string
  apiVersion: 1
  labelKey: string
  descriptionKey: string
  allowMultiple: boolean
  failureMode: 'fatal' | 'skip'
  configSchema: ConfigField[]
  defaultConfig: C
  run(ctx: TrackContext, config: C, services: TransformServices): Promise<void>
}

/** Result of running a chain on one track. */
export interface ChainResult {
  outputFile: string
  tags: TrackTags
  failed: boolean
  reason?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/transforms/types.ts
git commit -m "feat: main-side transform types"
```

---

## Task 4: auto-tag transform

**Files:**

- Create: `src/main/transforms/auto-tag.ts`, `src/main/transforms/auto-tag.test.ts`

Logic is moved out of `pipeline.ts`. Pure helpers `mergeTags` and `enrich` are tested; `run` does thin file IO.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/transforms/auto-tag.test.ts
import { describe, it, expect } from 'vitest'
import { mergeTags, enrich, type AutoTagConfig } from './auto-tag'

const baseConfig: AutoTagConfig = {
  primarySource: 'youtube',
  enrichWithMusicBrainz: true,
  fetchCoverArt: false,
  fetchGenre: false,
  fetchTrackNumber: false,
  minMatchScore: 80,
  userAgentEmail: 'test@example.com'
}

describe('mergeTags', () => {
  const yt = { artist: 'YT Artist', title: 'YT Title' }
  const mb = {
    artist: 'MB Artist',
    title: 'MB Title',
    album: 'MB Album',
    year: '1999',
    genre: 'Rock'
  }
  it('youtube primary keeps YT, fills gaps from MB', () => {
    const m = mergeTags(yt, mb, 'youtube')
    expect(m.artist).toBe('YT Artist')
    expect(m.album).toBe('MB Album')
    expect(m.year).toBe('1999')
  })
  it('musicbrainz primary inverts precedence', () => {
    expect(mergeTags(yt, mb, 'musicbrainz').artist).toBe('MB Artist')
  })
})

describe('enrich', () => {
  it('returns MB tags from a search result', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          recordings: [
            {
              id: 'rec1',
              score: 100,
              title: 'Real Title',
              'artist-credit': [{ artist: { name: 'Real Artist' } }],
              releases: [{ id: 'rel1', title: 'Real Album', date: '2001-05-01' }]
            }
          ]
        }),
        { status: 200 }
      )) as unknown as typeof fetch
    const services = { bin: {} as never, fetch: fakeFetch, log: () => {}, reportProgress: () => {} }
    const out = await enrich({ artist: 'Real Artist', title: 'Real Title' }, baseConfig, services)
    expect(out.tags.album).toBe('Real Album')
    expect(out.tags.year).toBe('2001')
  })

  it('returns empty tags when enrich disabled', async () => {
    const services = {
      bin: {} as never,
      fetch: (async () => new Response('')) as unknown as typeof fetch,
      log: () => {},
      reportProgress: () => {}
    }
    const out = await enrich(
      { artist: 'a', title: 't' },
      { ...baseConfig, enrichWithMusicBrainz: false },
      services
    )
    expect(out.tags).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/transforms/auto-tag.test.ts`
Expected: FAIL — module `./auto-tag` not found.

- [ ] **Step 3: Implement the transform**

```ts
// src/main/transforms/auto-tag.ts
import type { TrackTags } from '../../shared/types'
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import { parseTitle } from '../title-parser'
import { selectBestMatch } from '../mb-select'
import { MusicBrainzClient } from '../musicbrainz'
import { readTrackTags, embedCover } from '../tagger'

export interface AutoTagConfig {
  primarySource: 'youtube' | 'musicbrainz'
  enrichWithMusicBrainz: boolean
  fetchCoverArt: boolean
  fetchGenre: boolean
  fetchTrackNumber: boolean
  minMatchScore: number
  userAgentEmail: string
}

/** Primary source wins; secondary only fills gaps. */
export function mergeTags(
  yt: TrackTags,
  mb: TrackTags,
  primarySource: 'youtube' | 'musicbrainz'
): TrackTags {
  const primary = primarySource === 'youtube' ? yt : mb
  const secondary = primarySource === 'youtube' ? mb : yt
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

/** Look up MusicBrainz and return the enrichment tags + optional cover bytes. */
export async function enrich(
  ytNorm: TrackTags,
  config: AutoTagConfig,
  services: Pick<TransformServices, 'fetch' | 'log' | 'reportProgress'>
): Promise<{ tags: TrackTags; cover?: Buffer }> {
  if (!config.enrichWithMusicBrainz) return { tags: {} }
  const mb = new MusicBrainzClient(config.userAgentEmail, { fetchImpl: services.fetch })
  const search = await mb.searchRecording(ytNorm.artist ?? null, ytNorm.title ?? '')
  const match = selectBestMatch(search, config.minMatchScore)
  if (!match) return { tags: {} }
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
  if (config.fetchCoverArt && match.releaseId) {
    try {
      const res = await services.fetch(
        `https://coverartarchive.org/release/${match.releaseId}/front-500`
      )
      if (res.ok) cover = Buffer.from(await res.arrayBuffer())
    } catch {
      /* keep embedded youtube thumbnail */
    }
  }
  services.reportProgress(0.9)
  return { tags, cover }
}

const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: 'primarySource',
    labelKey: 'transforms.autoTag.fields.primarySource',
    type: 'enum',
    default: 'youtube',
    options: [
      { value: 'youtube', labelKey: 'transforms.autoTag.options.youtube' },
      { value: 'musicbrainz', labelKey: 'transforms.autoTag.options.musicbrainz' }
    ]
  },
  {
    key: 'enrichWithMusicBrainz',
    labelKey: 'transforms.autoTag.fields.enrich',
    type: 'boolean',
    default: true
  },
  {
    key: 'fetchCoverArt',
    labelKey: 'transforms.autoTag.fields.fetchCover',
    type: 'boolean',
    default: true
  },
  {
    key: 'fetchGenre',
    labelKey: 'transforms.autoTag.fields.fetchGenre',
    type: 'boolean',
    default: true
  },
  {
    key: 'fetchTrackNumber',
    labelKey: 'transforms.autoTag.fields.fetchTrackNumber',
    type: 'boolean',
    default: true
  },
  {
    key: 'minMatchScore',
    labelKey: 'transforms.autoTag.fields.minMatchScore',
    type: 'number',
    default: 80,
    min: 0,
    max: 100
  },
  {
    key: 'userAgentEmail',
    labelKey: 'transforms.autoTag.fields.contactEmail',
    type: 'string',
    default: 'you@example.com'
  }
]

export const autoTagTransform: TransformDefinition<AutoTagConfig> = {
  type: 'auto-tag',
  apiVersion: 1,
  labelKey: 'transforms.autoTag.label',
  descriptionKey: 'transforms.autoTag.description',
  allowMultiple: false,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: {
    primarySource: 'youtube',
    enrichWithMusicBrainz: true,
    fetchCoverArt: true,
    fetchGenre: true,
    fetchTrackNumber: true,
    minMatchScore: 80,
    userAgentEmail: 'you@example.com'
  },
  async run(ctx: TrackContext, config: AutoTagConfig, services: TransformServices): Promise<void> {
    const ytTags = readTrackTags(ctx.workingFile)
    const parsed = parseTitle(ctx.info.rawTitle || ytTags.title || '')
    const ytNorm: TrackTags = {
      ...ytTags,
      artist: ytTags.artist || parsed.artist || undefined,
      title: parsed.title || ytTags.title
    }
    // Set a safe baseline first so a skip-on-failure still yields YouTube tags.
    ctx.tags = ytNorm
    const { tags: mbTags, cover } = await enrich(ytNorm, config, services)
    if (cover) embedCover(ctx.workingFile, cover, 'image/jpeg')
    ctx.tags = mergeTags(ytNorm, mbTags, config.primarySource)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/transforms/auto-tag.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/auto-tag.ts src/main/transforms/auto-tag.test.ts
git commit -m "feat: auto-tag transform"
```

---

## Task 5: rename transform

**Files:**

- Create: `src/main/transforms/rename.ts`, `src/main/transforms/rename-transform.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/transforms/rename-transform.test.ts
import { describe, it, expect } from 'vitest'
import { renameTransform } from './rename'
import type { TrackContext, TransformServices } from './types'

const services = {
  bin: {} as never,
  fetch: fetch,
  log: () => {},
  reportProgress: () => {}
} as TransformServices

function ctx(tags: TrackContext['tags']): TrackContext {
  return {
    workingFile: '/tmp/x.mp3',
    tags,
    info: { rawTitle: '', sourceFile: '/tmp/x.mp3', index: 1 }
  }
}

describe('renameTransform', () => {
  it('sets outputName from tags via the template', async () => {
    const c = ctx({ artist: 'A', title: 'T', album: 'Alb', year: '2020', trackNumber: '3' })
    await renameTransform.run(
      c,
      { template: '{artist} - {track}. {title} - {album} ({year})' },
      services
    )
    expect(c.outputName).toBe('A - 03. T - Alb (2020)')
  })
  it('leaves outputName undefined when the template renders empty', async () => {
    const c = ctx({})
    await renameTransform.run(c, { template: '{artist}' }, services)
    expect(c.outputName).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/transforms/rename-transform.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/transforms/rename.ts
import type { ConfigField } from '../../shared/transforms'
import type { TransformDefinition, TrackContext, TransformServices } from './types'
import { buildFileName } from '../rename'

export interface RenameConfig {
  template: string
}

const CONFIG_SCHEMA: ConfigField[] = [
  {
    key: 'template',
    labelKey: 'transforms.rename.fields.template',
    type: 'string',
    default: '{artist} - {track}. {title} - {album} ({year})'
  }
]

export const renameTransform: TransformDefinition<RenameConfig> = {
  type: 'rename',
  apiVersion: 1,
  labelKey: 'transforms.rename.label',
  descriptionKey: 'transforms.rename.description',
  allowMultiple: false,
  failureMode: 'skip',
  configSchema: CONFIG_SCHEMA,
  defaultConfig: { template: '{artist} - {track}. {title} - {album} ({year})' },
  async run(ctx: TrackContext, config: RenameConfig, _services: TransformServices): Promise<void> {
    const name = buildFileName(config.template, ctx.tags)
    if (name) ctx.outputName = name
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/transforms/rename-transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/rename.ts src/main/transforms/rename-transform.test.ts
git commit -m "feat: rename transform"
```

---

## Task 6: Registry + serializable catalog

**Files:**

- Create: `src/main/transforms/registry.ts`, `src/main/transforms/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/transforms/registry.test.ts
import { describe, it, expect } from 'vitest'
import { buildRegistry, getCatalog } from './registry'

describe('registry', () => {
  it('registers the built-ins by type', () => {
    const r = buildRegistry()
    expect(r.get('auto-tag')?.type).toBe('auto-tag')
    expect(r.get('rename')?.type).toBe('rename')
  })
  it('catalog is serializable and omits run()', () => {
    const catalog = getCatalog()
    const json = JSON.parse(JSON.stringify(catalog))
    expect(json.find((m: { type: string }) => m.type === 'auto-tag')).toBeTruthy()
    expect(json.every((m: Record<string, unknown>) => !('run' in m))).toBe(true)
    const autoTag = catalog.find((m) => m.type === 'auto-tag')!
    expect(autoTag.allowMultiple).toBe(false)
    expect(autoTag.configSchema.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/transforms/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/transforms/registry.ts
import type { TransformManifest } from '../../shared/transforms'
import type { TransformDefinition } from './types'
import { autoTagTransform } from './auto-tag'
import { renameTransform } from './rename'

const BUILTINS: TransformDefinition[] = [
  autoTagTransform as unknown as TransformDefinition,
  renameTransform as unknown as TransformDefinition
]

export function buildRegistry(): Map<string, TransformDefinition> {
  return new Map(BUILTINS.map((d) => [d.type, d]))
}

/** Serializable manifests for the renderer (everything except run). */
export function getCatalog(): TransformManifest[] {
  return BUILTINS.map((d) => ({
    type: d.type,
    apiVersion: d.apiVersion,
    labelKey: d.labelKey,
    descriptionKey: d.descriptionKey,
    allowMultiple: d.allowMultiple,
    configSchema: d.configSchema,
    defaultConfig: d.defaultConfig
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/transforms/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/registry.ts src/main/transforms/registry.test.ts
git commit -m "feat: transform registry + serializable catalog"
```

---

## Task 7: Bounded concurrency pool

**Files:**

- Create: `src/main/pool.ts`, `src/main/pool.test.ts`

Tasks arrive dynamically (as downloads complete), so the pool accepts tasks over time and exposes `drain()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/pool.test.ts
import { describe, it, expect } from 'vitest'
import { createPool } from './pool'

describe('createPool', () => {
  it('runs all submitted tasks and never exceeds the limit', async () => {
    const pool = createPool(2)
    let active = 0
    let maxActive = 0
    const order: number[] = []
    for (let i = 0; i < 6; i++) {
      pool.run(async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 5))
        order.push(i)
        active--
      })
    }
    await pool.drain()
    expect(order).toHaveLength(6)
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('drain settles even if a task throws', async () => {
    const pool = createPool(2)
    pool.run(async () => {
      throw new Error('boom')
    })
    pool.run(async () => {})
    await expect(pool.drain()).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/pool.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/pool.ts

/** A dynamic concurrency pool: submit tasks over time, await them all with drain(). */
export function createPool(limit: number): {
  run: (task: () => Promise<void>) => void
  drain: () => Promise<PromiseSettledResult<void>[]>
} {
  let active = 0
  const waiters: Array<() => void> = []
  const all: Promise<void>[] = []

  const acquire = (): Promise<void> =>
    active < limit
      ? (active++, Promise.resolve())
      : new Promise<void>((resolve) => waiters.push(resolve)).then(() => {
          active++
        })

  const release = (): void => {
    active--
    waiters.shift()?.()
  }

  const run = (task: () => Promise<void>): void => {
    const p = (async () => {
      await acquire()
      try {
        await task()
      } finally {
        release()
      }
    })()
    all.push(p)
  }

  const drain = (): Promise<PromiseSettledResult<void>[]> => Promise.allSettled(all)
  return { run, drain }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/pool.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/pool.ts src/main/pool.test.ts
git commit -m "feat: dynamic bounded concurrency pool"
```

---

## Task 8: Transform chain runner

**Files:**

- Create: `src/main/transforms/run-chain.ts`, `src/main/transforms/run-chain.test.ts`

Copies the source to a temp working file, runs enabled instances in order honoring `failureMode`, flushes tags, and commits by moving the working file to the final name.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/transforms/run-chain.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runTransformChain } from './run-chain'
import type { TransformDefinition } from './types'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-chain-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const services = { bin: {} as never, fetch, log: () => {}, reportProgress: () => {} }

// A transform that sets outputName, and one that throws.
const renamer: TransformDefinition = {
  type: 'r',
  apiVersion: 1,
  labelKey: '',
  descriptionKey: '',
  allowMultiple: true,
  failureMode: 'skip',
  configSchema: [],
  defaultConfig: {},
  async run(ctx) {
    ctx.outputName = 'Final Name'
  }
}
const fatalBoom: TransformDefinition = {
  type: 'boom',
  apiVersion: 1,
  labelKey: '',
  descriptionKey: '',
  allowMultiple: true,
  failureMode: 'fatal',
  configSchema: [],
  defaultConfig: {},
  async run() {
    throw new Error('boom')
  }
}
const skipBoom: TransformDefinition = { ...fatalBoom, type: 'skipboom', failureMode: 'skip' }

describe('runTransformChain', () => {
  it('commits the working copy under the rename output name', async () => {
    const src = join(dir, 'orig.mp3')
    writeFileSync(src, 'AUDIO')
    const registry = new Map([['r', renamer]])
    const res = await runTransformChain(
      src,
      dir,
      { rawTitle: 'orig', sourceFile: src, index: 1 },
      [{ instanceId: 'i1', type: 'r', enabled: true, config: {} }],
      registry,
      services,
      () => {}
    )
    expect(res.failed).toBe(false)
    expect(res.outputFile).toBe(join(dir, 'Final Name.mp3'))
    expect(existsSync(res.outputFile)).toBe(true)
    expect(readdirSync(dir).some((f) => f.startsWith('.plucker-tmp'))).toBe(false)
  })

  it('fatal failure discards temp and keeps the pristine source', async () => {
    const src = join(dir, 'orig.mp3')
    writeFileSync(src, 'AUDIO')
    const registry = new Map([['boom', fatalBoom]])
    const res = await runTransformChain(
      src,
      dir,
      { rawTitle: 'orig', sourceFile: src, index: 1 },
      [{ instanceId: 'i1', type: 'boom', enabled: true, config: {} }],
      registry,
      services,
      () => {}
    )
    expect(res.failed).toBe(true)
    expect(existsSync(src)).toBe(true)
    expect(readdirSync(dir).some((f) => f.startsWith('.plucker-tmp'))).toBe(false)
  })

  it('skip failure continues the chain and still commits', async () => {
    const src = join(dir, 'orig.mp3')
    writeFileSync(src, 'AUDIO')
    const registry = new Map([
      ['skipboom', skipBoom],
      ['r', renamer]
    ])
    const res = await runTransformChain(
      src,
      dir,
      { rawTitle: 'orig', sourceFile: src, index: 1 },
      [
        { instanceId: 'i1', type: 'skipboom', enabled: true, config: {} },
        { instanceId: 'i2', type: 'r', enabled: true, config: {} }
      ],
      registry,
      services,
      () => {}
    )
    expect(res.failed).toBe(false)
    expect(res.outputFile).toBe(join(dir, 'Final Name.mp3'))
  })
})
```

> Note: these tests use a plain text file as a stand-in mp3. The chain reads/writes tags via node-id3 only inside transforms; the test transforms above don't touch tags, and the commit's tag flush is guarded (see implementation `tryFlushTags`) so it tolerates non-mp3 content.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/transforms/run-chain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/main/transforms/run-chain.ts
import { copyFileSync, renameSync, rmSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { TransformInstance } from '../../shared/transforms'
import type { ChainResult, TransformDefinition, TransformServices, TrackContext } from './types'
import { writeTrackTags, readTrackTags } from '../tagger'

/** Flush in-memory tags to disk; ignore failures on non-mp3 / unreadable files. */
function tryFlushTags(file: string, ctx: TrackContext): void {
  try {
    writeTrackTags(file, ctx.tags)
  } catch {
    /* leave file as-is */
  }
}

export async function runTransformChain(
  sourceFile: string,
  destFolder: string,
  info: TrackContext['info'],
  instances: TransformInstance[],
  registry: Map<string, TransformDefinition>,
  services: Omit<TransformServices, 'reportProgress'>,
  onProgress: (fraction: number) => void
): Promise<ChainResult> {
  const working = join(destFolder, `.plucker-tmp-${info.index}-${basename(sourceFile)}`)
  copyFileSync(sourceFile, working)

  let startTags = {}
  try {
    startTags = readTrackTags(working)
  } catch {
    /* non-mp3 in tests */
  }
  const ctx: TrackContext = { workingFile: working, tags: startTags, info }

  const total = instances.length || 1
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]
    const def = registry.get(inst.type)
    if (!def) {
      onProgress((i + 1) / total)
      continue
    }
    const stepServices: TransformServices = {
      ...services,
      reportProgress: (f) => onProgress((i + Math.min(Math.max(f, 0), 1)) / total)
    }
    try {
      await def.run(ctx, { ...def.defaultConfig, ...inst.config }, stepServices)
    } catch (err) {
      if (def.failureMode === 'fatal') {
        if (existsSync(working)) rmSync(working, { force: true })
        return { outputFile: sourceFile, tags: ctx.tags, failed: true, reason: String(err) }
      }
      services.log(`[${inst.type}] skipped: ${String(err)}`)
    }
    onProgress((i + 1) / total)
  }

  // Commit: flush tags, then move the working copy to its final name.
  tryFlushTags(working, ctx)
  const finalBase = ctx.outputName || basename(sourceFile).replace(/\.mp3$/i, '')
  const target = join(destFolder, `${finalBase}.mp3`)
  try {
    renameSync(working, target)
  } catch (err) {
    if (existsSync(working)) rmSync(working, { force: true })
    return { outputFile: sourceFile, tags: ctx.tags, failed: true, reason: String(err) }
  }
  return { outputFile: target, tags: ctx.tags, failed: false }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/transforms/run-chain.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transforms/run-chain.ts src/main/transforms/run-chain.test.ts
git commit -m "feat: transform chain runner with temp-copy commit"
```

---

## Task 9: yt-dlp completion sentinel

**Files:**

- Modify: `src/main/ytdlp.ts:18-49` (buildDownloadArgs), add `parseCompleteLine`, `:82-119` (runYtDlp)
- Test: `src/main/ytdlp.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/main/ytdlp.test.ts`:

```ts
import { parseCompleteLine, buildDownloadArgs } from './ytdlp'
import { DEFAULT_SETTINGS } from '../shared/defaults'

describe('parseCompleteLine', () => {
  it('extracts the final filepath from a PLUCKERDONE line', () => {
    expect(parseCompleteLine('PLUCKERDONE /tmp/My Folder/Artist - Title.mp3')).toBe(
      '/tmp/My Folder/Artist - Title.mp3'
    )
  })
  it('returns null for unrelated lines', () => {
    expect(parseCompleteLine('PLUCKER 1 50 abc Some Title')).toBeNull()
  })
})

describe('buildDownloadArgs completion sentinel', () => {
  it('adds an after_move print of the final filepath', () => {
    const args = buildDownloadArgs({
      url: 'u',
      destFolder: '/d',
      settings: DEFAULT_SETTINGS,
      ffmpegPath: '/ff'
    })
    const idx = args.indexOf('--print')
    expect(idx).toBeGreaterThan(-1)
    expect(args[idx + 1]).toBe('after_move:PLUCKERDONE %(filepath)s')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/ytdlp.test.ts`
Expected: FAIL — `parseCompleteLine` not exported / `--print` absent.

- [ ] **Step 3: Add the sentinel arg**

In `buildDownloadArgs` (`src/main/ytdlp.ts`), inside the `args` array literal, add right after the `'--write-info-json',` line:

```ts
    '--print',
    'after_move:PLUCKERDONE %(filepath)s',
```

- [ ] **Step 4: Add the parser**

After `parseProgressLine` (around line 63), add:

```ts
/** Parse our after_move completion sentinel into the final file path. */
export function parseCompleteLine(line: string): string | null {
  const m = line.match(/^PLUCKERDONE\s+(.+)$/)
  return m ? m[1].trim() : null
}
```

- [ ] **Step 5: Thread onComplete through runYtDlp**

Change the `runYtDlp` signature to accept an `onComplete` callback and parse it in the stdout handler. Replace lines 82-111 (signature through the stdout handler) with:

```ts
/** Spawn yt-dlp, stream progress + completions + skips, resolve with exit code + tail. */
export function runYtDlp(
  ytdlpPath: string,
  args: string[],
  onProgress: (e: ProgressEvent) => void,
  onComplete: (filePath: string) => void,
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
        const done = parseCompleteLine(line)
        if (done) {
          onComplete(done)
          continue
        }
        const e = parseProgressLine(line)
        if (e) onProgress(e)
      }
    })
```

(Leave the stderr handler, `child.on('error', reject)`, and `child.on('close', ...)` as they are.)

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/main/ytdlp.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/ytdlp.ts src/main/ytdlp.test.ts
git commit -m "feat: yt-dlp per-file completion sentinel + onComplete"
```

---

## Task 10: resolvePlaylist returns all entries

**Files:**

- Modify: `src/main/pipeline.ts:38-56` (ResolvedJob + resolveJob)
- Test: `src/main/pipeline.test.ts`

We extract the playlist entries up-front so the UI can list every track immediately. We keep this as a small, separately-testable function by parsing already-fetched JSON.

- [ ] **Step 1: Write the failing test**

Add to `src/main/pipeline.test.ts`:

```ts
import { parseEntries } from './pipeline'

describe('parseEntries', () => {
  it('lists all playlist entries with 1-based index', () => {
    const json = {
      _type: 'playlist',
      title: 'My List',
      entries: [
        { id: 'aaa', title: 'First' },
        { id: 'bbb', title: 'Second' }
      ]
    }
    const r = parseEntries(json)
    expect(r.kind).toBe('playlist')
    expect(r.title).toBe('My List')
    expect(r.entries).toEqual([
      { videoId: 'aaa', title: 'First', index: 1 },
      { videoId: 'bbb', title: 'Second', index: 2 }
    ])
  })
  it('treats a single video as one entry', () => {
    const json = { id: 'vid', title: 'Solo' }
    const r = parseEntries(json)
    expect(r.kind).toBe('video')
    expect(r.entries).toEqual([{ videoId: 'vid', title: 'Solo', index: 1 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/pipeline.test.ts`
Expected: FAIL — `parseEntries` not exported.

- [ ] **Step 3: Implement parseEntries + resolvePlaylist**

In `src/main/pipeline.ts`, replace the `ResolvedJob` interface and `resolveJob` function (lines 38-56) with:

```ts
export interface PlaylistEntry {
  videoId: string
  title: string
  index: number
}

export interface ResolvedJob {
  kind: 'playlist' | 'video'
  title: string
  entries: PlaylistEntry[]
}

/** Pure: turn a yt-dlp --dump-single-json object into kind/title/entries. */
export function parseEntries(json: {
  _type?: string
  title?: string
  id?: string
  entries?: Array<{ id?: string; title?: string }>
}): ResolvedJob {
  const isPlaylist = json._type === 'playlist' || Array.isArray(json.entries)
  if (isPlaylist) {
    const entries: PlaylistEntry[] = (json.entries ?? []).map((e, i) => ({
      videoId: e.id ?? String(i + 1),
      title: e.title ?? e.id ?? `Track ${i + 1}`,
      index: i + 1
    }))
    return { kind: 'playlist', title: json.title ?? 'Plucker', entries }
  }
  return {
    kind: 'video',
    title: json.title ?? 'Plucker',
    entries: [{ videoId: json.id ?? '1', title: json.title ?? 'Plucker', index: 1 }]
  }
}

/** Resolve playlist/video metadata via yt-dlp --dump-single-json. */
export async function resolvePlaylist(ytdlpPath: string, url: string): Promise<ResolvedJob> {
  const { spawnSync } = await import('node:child_process')
  const out = spawnSync(ytdlpPath, ['--flat-playlist', '--dump-single-json', url], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (out.error) throw new Error(`yt-dlp failed to start: ${out.error.message}`)
  if (out.status !== 0)
    throw new Error((out.stderr || '').slice(-2000) || `yt-dlp exited ${out.status}`)
  if (!out.stdout?.trim()) throw new Error('yt-dlp returned no metadata')
  return parseEntries(JSON.parse(out.stdout))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/pipeline.test.ts`
Expected: the `parseEntries` tests PASS. (The `mergeTags` test in this file will now fail to import because `mergeTags` is being removed — that import is deleted in Task 11. If the runner errors on the missing import now, temporarily comment the `mergeTags` describe block; Task 11 removes it properly.)

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline.ts src/main/pipeline.test.ts
git commit -m "feat: resolvePlaylist returns full entry list"
```

---

## Task 11: Rewrite runJob around the transform pipeline

**Files:**

- Modify: `src/main/pipeline.ts` (remove `mergeTags` lines 22-36; rewrite `RunJobDeps`/`runJob` lines 72-256; keep `destFolderFor` and `readSidecar`)
- Modify: `src/main/pipeline.test.ts` (remove the `mergeTags` describe block)

This is the integration core. It pre-populates all tracks as `queued`, updates them from download progress, dispatches each completion into the pool, aggregates `overall`, and builds history from chain results.

- [ ] **Step 1: Remove the moved mergeTags test**

In `src/main/pipeline.test.ts`, delete the entire `describe('mergeTags ...')` block and remove `mergeTags` from the import on line 2 (leave `destFolderFor`). Also remove the now-unused `DEFAULT_SETTINGS` import if nothing else uses it.

- [ ] **Step 2: Run the file to confirm it still loads**

Run: `pnpm test src/main/pipeline.test.ts`
Expected: `destFolderFor` + `parseEntries` tests PASS.

- [ ] **Step 3: Rewrite the pipeline**

In `src/main/pipeline.ts`:

(a) Update imports at the top to:

```ts
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings, JobProgress, TrackProgress, HistoryTrack } from '../shared/types'
import { sanitizeFileName } from './rename'
import { buildDownloadArgs, runYtDlp } from './ytdlp'
import { buildRegistry } from './transforms/registry'
import { runTransformChain } from './transforms/run-chain'
import { createPool } from './pool'
import type { BinaryPaths } from './binaries'
```

(b) Delete the `mergeTags` function (old lines 22-36).

(c) Keep `destFolderFor` and `readSidecar` unchanged.

(d) Replace `RunJobDeps`, `JobResult`, and `runJob` (old lines 72-256) with:

```ts
export interface RunJobDeps {
  bin: BinaryPaths
  settings: Settings
  homeBase: string
  onProgress: (p: JobProgress) => void
  mbFetch?: typeof fetch
  signal?: AbortSignal
  folderOverride?: string
}

export interface JobResult {
  title: string
  folder: string
  url: string
  kind: 'playlist' | 'video'
  tracks: HistoryTrack[]
}

/** 0..1 progress for one track: download weighted 0.8, transforms 0.2. */
function trackProgress(t: TrackProgress): number {
  if (t.status === 'done' || t.status === 'failed' || t.status === 'skipped') return 1
  return ((t.percent ?? 0) / 100) * 0.8 + ((t.transformPercent ?? 0) / 100) * 0.2
}

/** Full pipeline: resolve all entries → download → transform each track as it lands. */
export async function runJob(url: string, deps: RunJobDeps): Promise<JobResult> {
  const { bin, settings, homeBase, onProgress, signal } = deps
  const job = await resolvePlaylist(bin.ytdlp, url)
  const dest =
    deps.folderOverride ??
    destFolderFor(homeBase, job.title, settings.downloads.perPlaylistSubfolder, job.kind)
  mkdirSync(dest, { recursive: true })

  // Pre-populate every entry as queued so the whole list shows immediately.
  const tracks: TrackProgress[] = job.entries.map((e) => ({
    index: e.index,
    title: e.title,
    videoId: e.videoId,
    status: 'queued',
    percent: 0,
    transformPercent: 0
  }))

  const overall = (): number =>
    tracks.length ? tracks.reduce((sum, t) => sum + trackProgress(t), 0) / tracks.length : 0
  const emit = (): void =>
    onProgress({
      jobTitle: job.title,
      total: tracks.length,
      tracks: [...tracks],
      folder: dest,
      url,
      overall: overall()
    })
  emit()

  const registry = buildRegistry()
  const enabled = settings.transforms.filter((i) => i.enabled)
  const services = {
    bin,
    fetch: deps.mbFetch ?? fetch,
    signal,
    log: (m: string) => console.warn(m)
  }
  const pool = createPool(Math.max(1, settings.performance.parallel))
  const history: HistoryTrack[] = []

  const findByVideo = (videoId?: string): TrackProgress | undefined =>
    videoId ? tracks.find((x) => x.videoId === videoId) : undefined

  const onDownloadProgress = (e: {
    index: number
    percent: number
    videoId: string
    title: string
  }): void => {
    const t = findByVideo(e.videoId) ?? tracks.find((x) => x.index === e.index)
    if (!t) return
    if (t.status === 'queued' || t.status === 'downloading') {
      t.status = 'downloading'
      t.percent = e.percent
      if (e.title) t.title = e.title
    }
    emit()
  }

  const onComplete = (filePath: string): void => {
    const sidecarPath = filePath.replace(/\.mp3$/i, '.info.json')
    const sidecar = readSidecar(sidecarPath)
    const t = findByVideo(sidecar.id) ?? tracks.find((x) => x.status === 'downloading')
    if (!t) return
    t.status = 'transforming'
    t.percent = 100
    t.transformPercent = 0
    emit()
    pool.run(async () => {
      const res = await runTransformChain(
        filePath,
        dest,
        {
          videoId: sidecar.id,
          rawTitle: sidecar.title ?? t.title,
          sourceFile: filePath,
          index: t.index
        },
        enabled,
        registry,
        services,
        (f) => {
          t.transformPercent = Math.round(f * 100)
          emit()
        }
      )
      if (existsSync(sidecarPath)) rmSync(sidecarPath, { force: true })
      if (res.failed) {
        t.status = 'failed'
        t.reason = res.reason
      } else {
        if (res.outputFile !== filePath && existsSync(filePath)) rmSync(filePath, { force: true })
        t.status = 'done'
        t.file = res.outputFile
        t.artist = res.tags.artist
        t.album = res.tags.album
        t.year = res.tags.year
        if (res.tags.title) t.title = res.tags.title
        t.transformPercent = 100
        history.push({
          file: res.outputFile,
          title: res.tags.title ?? t.title,
          artist: res.tags.artist,
          album: res.tags.album,
          year: res.tags.year,
          videoId: sidecar.id
        })
      }
      emit()
    })
  }

  const args = buildDownloadArgs({ url, destFolder: dest, settings, ffmpegPath: bin.ffmpeg })
  const dl = await runYtDlp(bin.ytdlp, args, onDownloadProgress, onComplete, signal)

  // Mark below-floor skips reported by yt-dlp.
  for (const s of dl.skipped) {
    const t = findByVideo(s.videoId)
    if (t && (t.status === 'queued' || t.status === 'downloading')) {
      t.status = 'skipped'
      t.reason = 'below minimum quality'
    }
  }

  // Wait for all in-flight transform tasks before finalizing.
  await pool.drain()

  // Any track that never completed downloading is a failure.
  tracks.forEach((t) => {
    if (t.status === 'queued' || t.status === 'downloading') t.status = 'failed'
  })
  emit()

  return { title: job.title, folder: dest, url, kind: job.kind, tracks: history }
}
```

- [ ] **Step 4: Run pipeline tests**

Run: `pnpm test src/main/pipeline.test.ts`
Expected: PASS (`destFolderFor`, `parseEntries`).

- [ ] **Step 5: Commit**

```bash
git add src/main/pipeline.ts src/main/pipeline.test.ts
git commit -m "feat: per-track concurrent transform pipeline in runJob"
```

---

## Task 12: Catalog IPC + Electron progress bar

**Files:**

- Modify: `src/main/index.ts` (imports, `registerIpc`, `job:start`)
- Modify: `src/preload/index.ts`, `src/preload/index.d.ts`

- [ ] **Step 1: Add the catalog import and IPC handler**

In `src/main/index.ts`, add to imports:

```ts
import { getCatalog } from './transforms/registry'
```

In `registerIpc`, add next to the other `settings:` handlers:

```ts
ipcMain.handle('transforms:catalog', () => getCatalog())
```

- [ ] **Step 2: Drive the OS progress bar from job progress**

In `job:start`, change the `onProgress` callback (currently line ~73) to also set the progress bar:

```ts
      onProgress: (p) => {
        const win = getWindow()
        win?.webContents.send('job:progress', p)
        win?.setProgressBar(p.overall > 0 && p.overall < 1 ? p.overall : p.overall >= 1 ? 1 : -1)
      },
```

After the `runJob(...)` call resolves (after the `await runJob`, before/around the history block), clear the bar:

```ts
getWindow()?.setProgressBar(-1)
```

(Place it immediately after the `const result = await runJob(...)` assignment so it clears on completion regardless of history.)

- [ ] **Step 3: Expose getTransformCatalog in preload**

In `src/preload/index.ts`, add the import:

```ts
import type { TransformManifest } from '../shared/transforms'
```

Add to the `api` object:

```ts
  getTransformCatalog: (): Promise<TransformManifest[]> => ipcRenderer.invoke('transforms:catalog'),
```

- [ ] **Step 4: Update preload type declarations**

In `src/preload/index.d.ts`, ensure the `PluckerApi` type covers the new method. (It is derived as `typeof api` in `index.ts`; if `index.d.ts` re-declares the interface manually, add `getTransformCatalog(): Promise<TransformManifest[]>` and import the type. Open the file and match its existing pattern.)

- [ ] **Step 5: Verify the main + preload typecheck**

Run: `pnpm typecheck:node`
Expected: PASS (main/preload/shared compile; renderer is checked separately and still pending Task 15).

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: transform catalog IPC + OS progress bar"
```

---

## Task 13: SchemaForm renderer

**Files:**

- Create: `src/renderer/src/SchemaForm.tsx`, `src/renderer/src/SchemaForm.test.tsx`

Renders a `ConfigField[]` into inputs and emits config changes. Uses the existing vitest + (assumed) jsdom setup used by `i18n.test.ts`. If a DOM testing library is not yet a dependency, the test below uses only `react-dom/server` rendering to avoid adding deps.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/SchemaForm.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SchemaForm } from './SchemaForm'
import type { ConfigField } from '../../shared/transforms'

const fields: ConfigField[] = [
  { key: 'flag', labelKey: 'flag', type: 'boolean', default: true },
  { key: 'num', labelKey: 'num', type: 'number', default: 5, min: 0, max: 10 },
  { key: 'txt', labelKey: 'txt', type: 'string', default: 'hi' },
  {
    key: 'mode',
    labelKey: 'mode',
    type: 'enum',
    default: 'a',
    options: [
      { value: 'a', labelKey: 'a' },
      { value: 'b', labelKey: 'b' }
    ]
  }
]

describe('SchemaForm', () => {
  it('renders an input per field, falling back to labelKey for missing translations', () => {
    const html = renderToStaticMarkup(
      <SchemaForm
        fields={fields}
        config={{ flag: false, num: 7, txt: 'yo', mode: 'b' }}
        onChange={() => {}}
        t={(k) => k}
      />
    )
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('type="number"')
    expect(html).toContain('<select')
    expect(html).toContain('value="yo"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/SchemaForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/SchemaForm.tsx
import React from 'react'
import type { ConfigField } from '../../shared/transforms'

export function SchemaForm({
  fields,
  config,
  onChange,
  t
}: {
  fields: ConfigField[]
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  t: (key: string) => string
}): React.JSX.Element {
  const field = 'w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm'
  const set = (key: string, value: unknown): void => onChange({ ...config, [key]: value })

  return (
    <div className="flex flex-col gap-2 mt-2">
      {fields.map((f) => {
        const value = config[f.key] ?? f.default
        const label = t(f.labelKey)
        if (f.type === 'boolean') {
          return (
            <label key={f.key} className="flex gap-2 items-center text-sm">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => set(f.key, e.target.checked)}
              />
              {label}
            </label>
          )
        }
        if (f.type === 'number') {
          return (
            <label key={f.key} className="text-sm block">
              {label}
              <input
                type="number"
                className={field}
                value={Number(value)}
                min={f.min}
                max={f.max}
                onChange={(e) => set(f.key, Number(e.target.value))}
              />
            </label>
          )
        }
        if (f.type === 'enum') {
          return (
            <label key={f.key} className="text-sm block">
              {label}
              <select
                className={field}
                value={String(value)}
                onChange={(e) => set(f.key, e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        return (
          <label key={f.key} className="text-sm block">
            {label}
            <input
              className={field}
              value={String(value)}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </label>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/SchemaForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/SchemaForm.tsx src/renderer/src/SchemaForm.test.tsx
git commit -m "feat: schema-driven config form renderer"
```

---

## Task 14: TransformsSection (add/remove/reorder/configure)

**Files:**

- Create: `src/renderer/src/TransformsSection.tsx`, `src/renderer/src/TransformsSection.test.tsx`

A controlled component: receives `instances`, `catalog`, and `onChange`. Pure list helpers are exported and unit-tested; the React shell wires them to buttons.

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/TransformsSection.test.tsx
import { describe, it, expect } from 'vitest'
import { move, addInstance, canAdd } from './TransformsSection'
import type { TransformInstance, TransformManifest } from '../../shared/transforms'

const insts: TransformInstance[] = [
  { instanceId: 'a', type: 'auto-tag', enabled: true, config: {} },
  { instanceId: 'b', type: 'rename', enabled: true, config: {} }
]
const catalog: TransformManifest[] = [
  {
    type: 'auto-tag',
    apiVersion: 1,
    labelKey: '',
    descriptionKey: '',
    allowMultiple: false,
    configSchema: [],
    defaultConfig: { x: 1 }
  },
  {
    type: 'trim',
    apiVersion: 1,
    labelKey: '',
    descriptionKey: '',
    allowMultiple: true,
    configSchema: [],
    defaultConfig: {}
  }
]

describe('list helpers', () => {
  it('move swaps adjacent items', () => {
    expect(move(insts, 0, 1).map((i) => i.instanceId)).toEqual(['b', 'a'])
  })
  it('move is a no-op out of bounds', () => {
    expect(move(insts, 0, -1)).toEqual(insts)
  })
  it('addInstance appends with default config and a fresh id', () => {
    const out = addInstance(insts, catalog[1], () => 'new-id')
    expect(out).toHaveLength(3)
    expect(out[2]).toMatchObject({ instanceId: 'new-id', type: 'trim', enabled: true, config: {} })
  })
  it('canAdd is false for a single-instance type already present', () => {
    expect(canAdd(insts, catalog[0])).toBe(false)
    expect(canAdd(insts, catalog[1])).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/TransformsSection.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/TransformsSection.tsx
import React, { useState } from 'react'
import type { TransformInstance, TransformManifest } from '../../shared/transforms'
import { SchemaForm } from './SchemaForm'

export function move(list: TransformInstance[], from: number, to: number): TransformInstance[] {
  if (to < 0 || to >= list.length || from < 0 || from >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function addInstance(
  list: TransformInstance[],
  manifest: TransformManifest,
  newId: () => string
): TransformInstance[] {
  return [
    ...list,
    {
      instanceId: newId(),
      type: manifest.type,
      enabled: true,
      config: { ...manifest.defaultConfig }
    }
  ]
}

export function canAdd(list: TransformInstance[], manifest: TransformManifest): boolean {
  if (manifest.allowMultiple) return true
  return !list.some((i) => i.type === manifest.type)
}

export function TransformsSection({
  instances,
  catalog,
  onChange,
  t
}: {
  instances: TransformInstance[]
  catalog: TransformManifest[]
  onChange: (next: TransformInstance[]) => void
  t: (key: string) => string
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const byType = (type: string): TransformManifest | undefined =>
    catalog.find((m) => m.type === type)
  const newId = (): string => crypto.randomUUID()

  const heading = 'text-sm uppercase tracking-wide text-neutral-500 mb-2'
  const update = (id: string, patch: Partial<TransformInstance>): void =>
    onChange(instances.map((i) => (i.instanceId === id ? { ...i, ...patch } : i)))

  return (
    <section className="mb-5">
      <h3 className={heading}>{t('settings.sections.transforms')}</h3>
      <ul className="flex flex-col gap-2">
        {instances.map((inst, idx) => {
          const manifest = byType(inst.type)
          const label = manifest ? t(manifest.labelKey) : inst.type
          return (
            <li key={inst.instanceId} className="rounded border border-neutral-800 p-2">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inst.enabled}
                  onChange={(e) => update(inst.instanceId, { enabled: e.target.checked })}
                />
                <span className="flex-1">{label}</span>
                <button
                  aria-label="up"
                  onClick={() => onChange(move(instances, idx, idx - 1))}
                  className="px-1 text-neutral-400 hover:text-white"
                >
                  ▲
                </button>
                <button
                  aria-label="down"
                  onClick={() => onChange(move(instances, idx, idx + 1))}
                  className="px-1 text-neutral-400 hover:text-white"
                >
                  ▼
                </button>
                <button
                  onClick={() => setOpen(open === inst.instanceId ? null : inst.instanceId)}
                  className="px-1 text-neutral-400 hover:text-white"
                >
                  ⚙
                </button>
                <button
                  aria-label="remove"
                  onClick={() =>
                    onChange(instances.filter((i) => i.instanceId !== inst.instanceId))
                  }
                  className="px-1 text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              {open === inst.instanceId && manifest && (
                <SchemaForm
                  fields={manifest.configSchema}
                  config={inst.config}
                  onChange={(config) => update(inst.instanceId, { config })}
                  t={t}
                />
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-2">
        <select
          className="w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm"
          value=""
          onChange={(e) => {
            const m = byType(e.target.value)
            if (m) onChange(addInstance(instances, m, newId))
          }}
        >
          <option value="">{t('settings.transforms.add')}</option>
          {catalog.map((m) => (
            <option key={m.type} value={m.type} disabled={!canAdd(instances, m)}>
              {t(m.labelKey)}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/TransformsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/TransformsSection.tsx src/renderer/src/TransformsSection.test.tsx
git commit -m "feat: transforms settings section with reorder/add/remove"
```

---

## Task 15: Wire TransformsSection into SettingsPanel

**Files:**

- Modify: `src/renderer/src/SettingsPanel.tsx`

Remove the Tagging and Naming sections and the `TAGGING_TOGGLES` constant; add the Transforms section fed by the catalog.

- [ ] **Step 1: Replace imports + constants**

At the top of `src/renderer/src/SettingsPanel.tsx`, add:

```ts
import type { TransformManifest } from '../../shared/transforms'
import { TransformsSection } from './TransformsSection'
```

Delete the `TAGGING_TOGGLES` constant (lines 11-17).

- [ ] **Step 2: Load the catalog**

Inside the component, add state and a loader next to the existing settings load:

```ts
const [catalog, setCatalog] = useState<TransformManifest[]>([])
useEffect(() => {
  window.plucker.getSettings().then(setS)
  window.plucker.getTransformCatalog().then(setCatalog)
}, [])
```

(Replace the existing single-effect `getSettings` call with the combined effect above.)

- [ ] **Step 3: Replace the Tagging + Naming sections**

Delete the entire `<section>` for Tagging (old lines 159-208) and the `<section>` for Naming (old lines 210-226). In their place insert:

```tsx
<TransformsSection
  instances={s.transforms}
  catalog={catalog}
  onChange={(transforms) => set({ transforms })}
  t={t}
/>
```

- [ ] **Step 4: Verify renderer typecheck + tests**

Run: `pnpm typecheck:web && pnpm test src/renderer`
Expected: PASS — no more references to `s.tagging` / `s.rename`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/SettingsPanel.tsx
git commit -m "feat: replace tagging/naming settings with transforms section"
```

---

## Task 16: DownloadView 'transforming' status

**Files:**

- Modify: `src/renderer/src/DownloadView.tsx:6-13` (ICON), `:25-26` (statusText)

- [ ] **Step 1: Add the transforming icon**

In the `ICON` record, add a `transforming` entry (place after `downloading`):

```ts
  transforming: '🏷',
```

(Keep `tagging` removed — `TrackStatus` no longer has it; if `tagging` remains in the record it is now a type error, so replace `tagging: '🏷'` with `transforming: '🏷'`.)

- [ ] **Step 2: Show transform percent while transforming**

Replace `statusText` (lines 25-26) with:

```ts
const statusText = (status: TrackStatus, percent?: number, transformPercent?: number): string =>
  status === 'downloading'
    ? `${Math.round(percent ?? 0)}%`
    : status === 'transforming'
      ? `${Math.round(transformPercent ?? 0)}%`
      : t(`status.${status}`)
```

Update the call site (the `statusLabel` prop) to pass the third arg:

```tsx
                  statusLabel={`${ICON[track.status]} ${statusText(track.status, track.percent, track.transformPercent)}`}
```

- [ ] **Step 3: Verify renderer typecheck**

Run: `pnpm typecheck:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/DownloadView.tsx
git commit -m "feat: show transforming status + percent in download view"
```

---

## Task 17: i18n strings (en + de)

**Files:**

- Modify: `src/renderer/src/i18n/locales/en.ts`, `src/renderer/src/i18n/locales/de.ts`
- Test: `src/renderer/src/i18n/i18n.test.ts` (if it checks key parity)

- [ ] **Step 1: Update English locale**

In `src/renderer/src/i18n/locales/en.ts`: in `status`, replace `tagging: 'tagging'` with `transforming: 'transforming'`. In `settings.sections`, replace `tagging`/`naming` entries with `transforms: 'Transforms'`. Remove the `settings.tagging` and `settings.naming` objects. Add a `settings.transforms` object and a top-level `transforms` object:

```ts
transforms: {
  add: 'Add transform…'
}
```

And at the root of the exported object (sibling of `settings`):

```ts
  transforms: {
    autoTag: {
      label: 'Auto-tag',
      description: 'Read YouTube tags and enrich from MusicBrainz.',
      fields: {
        primarySource: 'Primary source',
        enrich: 'Enrich with MusicBrainz',
        fetchCover: 'Fetch album cover',
        fetchGenre: 'Fetch genre',
        fetchTrackNumber: 'Fetch track number',
        minMatchScore: 'Min match score',
        contactEmail: 'MusicBrainz contact email'
      },
      options: { youtube: 'YouTube', musicbrainz: 'MusicBrainz' }
    },
    rename: {
      label: 'Rename file',
      description: 'Rename the file from its final tags.',
      fields: { template: 'Filename template — tokens: {artist} {track} {title} {album} {year}' }
    }
  }
```

- [ ] **Step 2: Update German locale**

Mirror the same key structure in `src/renderer/src/i18n/locales/de.ts` with German values (e.g. `transforming: 'verarbeite'`, `transforms: 'Transformationen'`, `add: 'Transformation hinzufügen…'`, `autoTag.label: 'Auto-Tag'`, `rename.label: 'Datei umbenennen'`, etc.). Keep the exact same key paths as English so parity checks pass.

- [ ] **Step 3: Run i18n + renderer tests**

Run: `pnpm test src/renderer/src/i18n/i18n.test.ts`
Expected: PASS (key parity between en/de holds).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat: i18n strings for transforms (en + de)"
```

---

## Task 18: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all test files PASS.

- [ ] **Step 2: Typecheck both projects**

Run: `pnpm typecheck`
Expected: PASS for node + web (no remaining references to `settings.tagging`/`settings.rename`, `resolveJob`, old `runYtDlp` arity, or `JobProgress` without `overall`).

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: exit 0.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: typecheck + electron-vite build succeed.

- [ ] **Step 5: Manual smoke test (document result)**

Run: `pnpm dev`. Then:

1. Open Settings → confirm a **Transforms** section listing `Auto-tag` and `Rename file`, each with ▲/▼/⚙/✕ controls and an "Add transform…" dropdown (Auto-tag disabled when already present).
2. Expand Auto-tag (⚙) → confirm the schema form shows primary source (select), the boolean toggles, min match score (number), and contact email (text). Edit a value, Done, reopen → persisted.
3. Paste a small playlist URL → confirm **all tracks appear immediately as `queued`**, then move to `downloading` (%) → `transforming` (%) → `done`, and the dock/taskbar shows a progress bar that fills and clears at the end.
4. Reorder so Rename is before Auto-tag, run again → filenames reflect the (empty) tags as expected, proving order is honored.

- [ ] **Step 6: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore: transform pipeline verification pass"
```

---

## Self-Review Notes (resolved during authoring)

- **Spec coverage:** versioned interface (Task 3), temp-copy commit (Task 8), schema-driven UI + escape-hatch-ready manifest (Tasks 1/13), `allowMultiple` (Tasks 6/14), `failureMode` (Task 8), auto-tag + rename built-ins (Tasks 4/5), v1→v2 fresh-defaults migration (Task 2), single-yt-dlp completion watch + bounded pool (Tasks 7/9/11), tracklist-first (Tasks 10/11), two-phase weighted progress + OS bar (Tasks 11/12), settings UI (Tasks 14/15), i18n (Task 17), tests throughout.
- **Type consistency:** `runYtDlp(onProgress, onComplete, signal)` arity matches Task 9 ↔ Task 11; `JobProgress.overall` defined (Task 2) and produced (Task 11) and consumed (Task 12); `TrackStatus` `'transforming'` defined (Task 2), produced (Task 11), rendered (Task 16); `resolvePlaylist`/`parseEntries` names consistent (Tasks 10/11); `getCatalog` (main) vs `getTransformCatalog` (preload) intentionally distinct.
- **No placeholders:** every code step contains full code; the only deferred item is the documented future escape hatch (out of scope, Task list does not depend on it).

```

```
