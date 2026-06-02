# Library / Editor Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `HistoryEntry[]`-in-`config.json` model with a managed, content-addressed **Library** of audio blobs plus a SQLite index of track instances, each owning a version graph with named branches, so re-downloads/edits never destroy a shared file and every modification is reversible until the user exports.

**Architecture:** Electron main owns `~/.plucker/blobs/` (content-addressed by full-file SHA-256) and `~/.plucker/library.db` (better-sqlite3, WAL). A `LibraryService` orchestrates ingest (reusing the existing worker/pipeline engine), edits (dispatched as jobs reusing the transform-chain runner), versioning/branching, deterministic cold-version recompute, and one-shot export. The renderer talks to it over new `library:*` IPC; the old `history:*` surface and `src/main/history.ts` are deleted. Existing history is discarded on upgrade (fresh start).

**Tech Stack:** TypeScript, Electron (main + preload + React renderer), better-sqlite3 (new), Vitest, pnpm. Reuses existing `runTransformChain`, job pool/worker protocol, `buildFileName`, `hashAudioFile`, `probeAudio`.

**Spec:** `.specs/2026-06-02-library-editor-model-design.md`

---

## File Structure

**New — shared:**
- `src/shared/library.ts` — all Library types (Collection, TrackInstance, Version, Branch, Blob, ActivityEvent, Recipe/RecipeStep, and renderer aggregates CollectionView/TrackDetail). Imported by main, preload, renderer.

**New — main (`src/main/library/`):**
- `content-store.ts` (+`.test.ts`) — blob storage on disk: atomic write (stage→hash→rename), path-for-hash, exists, read, remove. Pure fs/crypto.
- `schema.ts` — SQL DDL + `migrate(db)`.
- `db.ts` — open better-sqlite3 (WAL), run migrations, expose handle. Singleton accessor.
- `repo.ts` (+`.test.ts`) — typed repository over the DB: CRUD for every entity + **transactional refcount** + transactional delete (the integrity core). No fs, no transforms.
- `recipe.ts` (+`.test.ts`) — Recipe build/replay; deterministic chain replay honoring snapshots.
- `materialize.ts` (+`.test.ts`) — `ensureMaterialized(versionId)`: recompute cold versions from nearest materialized ancestor; LRU eviction.
- `ingest.ts` (+`.test.ts`) — `foldJobResultIntoLibrary(...)`: turn a finished JobResult into collection/track/root/version rows + activity.
- `export.ts` (+`.test.ts`) — `exportTracks(targets, destFolder)`: materialize + copy with `buildFileName`.
- `service.ts` (+`.test.ts`) — `LibraryService`: wires repo + store + recipe + materialize + ingest + export + job pool; the single object `index.ts` IPC handlers call.

**New — renderer (`src/renderer/src/library/`):**
- `use-library.ts` — hook: subscribe to `library:changed`, fetch collections.
- `library-view.tsx` (+`.test.tsx`) — primary collections/tracks surface.
- `track-editor.tsx` (+`.test.tsx`) — version graph + branch actions + edit/export for one track.
- `version-graph.tsx` (+`.test.tsx`) — renders the DAG with branch pointers + current marker.
- `activity-log.tsx` (+`.test.tsx`) — read-only timeline.

**Modified:**
- `src/shared/types.ts` — remove `history: HistoryEntry[]` from `Settings`; drop `HistoryEntry`/`HistoryTrack`/`JobOutcome`/`HistoryTrackStatus`? (kept — still used by pipeline `JobResult.tracks`). Only `Settings.history` is removed.
- `src/shared/defaults.ts` — remove `history` default.
- `src/main/settings.ts` — drop `history` from `mergeDefaults`, remove `normalizeHistory` import.
- `src/main/history.ts` — **DELETE** (+ any `history.test.ts`).
- `src/main/index.ts` — remove `history:*` handlers + `foldJobResult`/`foldJobError` history writes → call `LibraryService`; register `library:*` handlers.
- `src/main/workers/job-protocol.ts` — add `JobStartPayload` kind `'libraryEdit'`.
- `src/main/workers/job-worker.ts` (or wherever payload→source happens) — build a single-file source for `libraryEdit`.
- `src/preload/index.ts` — add `library` API + `onLibraryChanged`/`onLibraryActivityChanged`; remove `history` API.
- `src/renderer/src/app.tsx` — route to Library as primary; mount activity log; drop history view wiring.
- `src/renderer/src/history-view.tsx` — **DELETE** (replaced by library-view + activity-log).
- `package.json` / `electron-builder.yml` — add `better-sqlite3`; ensure `electron-builder install-app-deps` rebuilds it (already in `postinstall`).
- i18n locales `en.ts`/`de.ts` — new `library.*` and `activity.*` strings.

**Conventions:** pnpm only. Tests with Vitest (`pnpm test`). Run `pnpm run typecheck` before each commit. Conventional Commits. Work on `master`. Shared helpers get colocated `*.test.ts`.

---

## Type Reference (defined in Task 1, referenced throughout)

```ts
// src/shared/library.ts
import type { TrackTags } from './types'

export type CollectionKind = 'playlist' | 'album' | 'single'

export interface Collection {
  id: string
  kind: CollectionKind
  title: string
  sourceUrl?: string
  createdAt: string // ISO
}

export interface TrackInstance {
  id: string
  collectionId: string
  sourceVideoId?: string
  sourceUrl?: string
  /** Tag-independent audio-content hash of the raw download; "same download?" dedup. */
  sourceAudioHash?: string
  orderIndex: number
  title: string
  activeBranchId: string
}

/** One transform step as recorded in a version's recipe. */
export interface RecipeStep {
  type: string // transform type, e.g. 'auto-tag'
  config: Record<string, unknown>
}

/**
 * The transform chain that produced a version from its parent, plus a snapshot of
 * the resolved metadata so a cold version recomputes byte-stable and offline (N3).
 * Replay re-runs only the audio-mutating steps (deterministic) and then applies
 * `resolved` (tags + final name), skipping network metadata lookups entirely.
 */
export interface Recipe {
  steps: RecipeStep[] // [] for the raw root
  resolved?: { tags?: TrackTags; outputName?: string }
}

export interface Version {
  id: string
  trackId: string
  parentId: string | null // null = raw root
  blobHash: string | null // set when materialized
  recipe: Recipe // [] for root
  materialized: boolean
  label?: string
  createdAt: string
}

export interface Branch {
  id: string
  trackId: string
  name: string
  tipVersionId: string
}

export interface Blob {
  hash: string // full-file SHA-256
  path: string // absolute
  size: number
  refcount: number
}

export type ActivityType =
  | 'ingested'
  | 'edited'
  | 'branched'
  | 'switched'
  | 'exported'
  | 'deleted'
  | 'renamed'

export interface ActivityEvent {
  id: string
  type: ActivityType
  ts: string
  collectionId?: string
  trackId?: string
  versionId?: string
  summary: string
}

// Renderer-facing aggregates
export interface TrackSummary {
  id: string
  title: string
  orderIndex: number
  currentVersionId: string
}
export interface CollectionView extends Collection {
  tracks: TrackSummary[]
}
export interface TrackDetail {
  instance: TrackInstance
  versions: Version[]
  branches: Branch[]
}
```

---

# Phase 0 — Dependency & scaffolding

### Task 0: Add better-sqlite3 and verify it loads in the main process

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/main/library/db.smoke.test.ts`

- [ ] **Step 1: Install the dependency**

Run:
```bash
pnpm add better-sqlite3 && pnpm add -D @types/better-sqlite3
```
Expected: both appear under `dependencies`/`devDependencies`; `pnpm install` runs `electron-builder install-app-deps` (postinstall) and rebuilds the native module against Electron's ABI.

- [ ] **Step 2: Write a smoke test that opens an in-memory DB**

```ts
// src/main/library/db.smoke.test.ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'

describe('better-sqlite3', () => {
  it('opens an in-memory database and round-trips a row', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER)')
    db.prepare('INSERT INTO t (id, n) VALUES (?, ?)').run('a', 1)
    const row = db.prepare('SELECT n FROM t WHERE id = ?').get('a') as { n: number }
    expect(row.n).toBe(1)
    db.close()
  })
})
```

- [ ] **Step 3: Run it**

Run: `pnpm test -- src/main/library/db.smoke.test.ts`
Expected: PASS. (If it fails with an ABI error under Node vs Electron, run `pnpm run postinstall` — Vitest runs under Node, which better-sqlite3 also supports; the Electron rebuild is for runtime.)

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/main/library/db.smoke.test.ts
git commit -m "build: add better-sqlite3 for the library index"
```

---

# Phase 1 — Store + index foundation (no UI)

This phase builds the integrity core: shared types, the content store, the SQLite schema, and the repository whose transactional refcount delete makes the original bug impossible. Nothing here is wired into the app yet.

### Task 1: Shared Library types

**Files:**
- Create: `src/shared/library.ts`

- [ ] **Step 1: Create the types module**

Copy the full contents of the **Type Reference** block above into `src/shared/library.ts`.

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: PASS (no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/shared/library.ts
git commit -m "feat: add shared Library type definitions"
```

### Task 2: Content store — atomic, content-addressed blob storage

**Files:**
- Create: `src/main/library/content-store.ts`
- Test: `src/main/library/content-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/content-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContentStore } from './content-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-store-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('content store', () => {
  it('stores a file under a sharded path keyed by its full-file sha256 and returns hash+size', () => {
    const src = join(dir, 'in.mp3')
    writeFileSync(src, 'audio-bytes')
    const store = createContentStore(join(dir, 'blobs'))
    const { hash, path, size } = store.put(src)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(path).toBe(join(dir, 'blobs', hash.slice(0, 2), `${hash}.mp3`))
    expect(size).toBe(Buffer.byteLength('audio-bytes'))
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('audio-bytes')
  })

  it('is content-addressed: identical bytes produce the same hash/path (idempotent put)', () => {
    const a = join(dir, 'a.mp3')
    const b = join(dir, 'b.mp3')
    writeFileSync(a, 'same')
    writeFileSync(b, 'same')
    const store = createContentStore(join(dir, 'blobs'))
    expect(store.put(a).hash).toBe(store.put(b).hash)
  })

  it('distinguishes files differing only in trailing (tag) bytes', () => {
    const a = join(dir, 'a.mp3')
    const b = join(dir, 'b.mp3')
    writeFileSync(a, 'audioTAGv1')
    writeFileSync(b, 'audioTAGv2')
    const store = createContentStore(join(dir, 'blobs'))
    expect(store.put(a).hash).not.toBe(store.put(b).hash)
  })

  it('removes a blob by hash', () => {
    const src = join(dir, 'in.mp3')
    writeFileSync(src, 'bytes')
    const store = createContentStore(join(dir, 'blobs'))
    const { hash, path } = store.put(src)
    store.remove(hash)
    expect(existsSync(path)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/content-store.test.ts`
Expected: FAIL — `createContentStore` not found.

- [ ] **Step 3: Implement the content store**

```ts
// src/main/library/content-store.ts
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface StoredBlob {
  hash: string
  path: string
  size: number
}

/**
 * Content-addressed blob store. Blobs are keyed by the **full-file** SHA-256 (so two
 * versions differing only in ID3 tags are distinct files) and sharded by the first two
 * hex chars. `put` is atomic: it stages a copy in a sibling tmp dir, fsync-free rename
 * into place (same filesystem), and is idempotent for identical content.
 */
export function createContentStore(root: string) {
  mkdirSync(root, { recursive: true })
  const tmp = join(root, '.tmp')
  mkdirSync(tmp, { recursive: true })

  const pathFor = (hash: string): string => join(root, hash.slice(0, 2), `${hash}.mp3`)

  return {
    root,
    pathFor,
    has: (hash: string): boolean => existsSync(pathFor(hash)),
    read: (hash: string): Buffer => readFileSync(pathFor(hash)),
    /** Ingest a source file by content; returns its hash, final path and size. Idempotent. */
    put(sourceFile: string): StoredBlob {
      const bytes = readFileSync(sourceFile)
      const hash = createHash('sha256').update(bytes).digest('hex')
      const dest = pathFor(hash)
      const size = bytes.length
      if (existsSync(dest)) return { hash, path: dest, size }
      mkdirSync(join(root, hash.slice(0, 2)), { recursive: true })
      const staging = join(tmp, `${randomUUID()}.mp3`)
      writeFileSync(staging, bytes)
      renameSync(staging, dest) // atomic on same filesystem
      return { hash, path: dest, size }
    },
    remove(hash: string): void {
      rmSync(pathFor(hash), { force: true })
    },
    sizeOf(hash: string): number {
      return existsSync(pathFor(hash)) ? statSync(pathFor(hash)).size : 0
    }
  }
}

export type ContentStore = ReturnType<typeof createContentStore>
```

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/content-store.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add src/main/library/content-store.ts src/main/library/content-store.test.ts
git commit -m "feat: add content-addressed blob store"
```

### Task 3: SQLite schema + migration

**Files:**
- Create: `src/main/library/schema.ts`
- Create: `src/main/library/db.ts`
- Test: `src/main/library/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/schema.test.ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from './schema'

describe('schema migration', () => {
  it('creates every table with foreign keys and WAL pragma', () => {
    const db = new Database(':memory:')
    migrate(db)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name)
    for (const t of ['activity', 'blobs', 'branches', 'collections', 'track_instances', 'versions'])
      expect(tables).toContain(t)
    expect((db.pragma('foreign_keys', { simple: true }) as number)).toBe(1)
  })

  it('is idempotent (safe to run twice)', () => {
    const db = new Database(':memory:')
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/schema.test.ts`
Expected: FAIL — `migrate` not found.

- [ ] **Step 3: Implement schema + migration**

```ts
// src/main/library/schema.ts
import type { Database } from 'better-sqlite3'

const DDL = `
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
  source_url TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY, path TEXT NOT NULL, size INTEGER NOT NULL,
  refcount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS track_instances (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  source_video_id TEXT, source_url TEXT, source_audio_hash TEXT,
  order_index INTEGER NOT NULL, title TEXT NOT NULL,
  active_branch_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES track_instances(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES versions(id),
  blob_hash TEXT REFERENCES blobs(hash),
  recipe TEXT NOT NULL DEFAULT '{"steps":[]}',
  materialized INTEGER NOT NULL DEFAULT 0,
  label TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES track_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL, tip_version_id TEXT NOT NULL REFERENCES versions(id)
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, ts TEXT NOT NULL,
  collection_id TEXT, track_id TEXT, version_id TEXT, summary TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_collection ON track_instances(collection_id);
CREATE INDEX IF NOT EXISTS idx_versions_track ON versions(track_id);
CREATE INDEX IF NOT EXISTS idx_branches_track ON branches(track_id);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity(ts);
`

/** Create all tables/indexes (idempotent) and set pragmas. */
export function migrate(db: Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(DDL)
}
```

```ts
// src/main/library/db.ts
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { migrate } from './schema'
import { pluckerDir } from '../settings'

let handle: Database.Database | null = null

/** Open (once) the Library DB at ~/.plucker/library.db, migrated and ready. */
export function getLibraryDb(file = join(pluckerDir(), 'library.db')): Database.Database {
  if (handle) return handle
  handle = new Database(file)
  migrate(handle)
  return handle
}

/** Test/maintenance hook: close and forget the singleton. */
export function closeLibraryDb(): void {
  handle?.close()
  handle = null
}
```

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/schema.ts src/main/library/db.ts src/main/library/schema.test.ts
git commit -m "feat: add Library SQLite schema and DB accessor"
```

### Task 4: Repository — entities, recipe JSON mapping, and read queries

**Files:**
- Create: `src/main/library/repo.ts`
- Test: `src/main/library/repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/repo.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from './schema'
import { createRepo } from './repo'

function freshRepo() {
  const db = new Database(':memory:')
  migrate(db)
  return createRepo(db)
}

describe('repo — basic CRUD & reads', () => {
  it('inserts a collection and reads it back', () => {
    const repo = freshRepo()
    repo.insertCollection({ id: 'c1', kind: 'playlist', title: 'Mix', sourceUrl: 'u', createdAt: 't' })
    expect(repo.getCollection('c1')?.title).toBe('Mix')
    expect(repo.listCollections().map((c) => c.id)).toEqual(['c1'])
  })

  it('round-trips a version recipe through JSON', () => {
    const repo = freshRepo()
    repo.insertCollection({ id: 'c1', kind: 'single', title: 'T', createdAt: 't' })
    repo.insertTrack({ id: 't1', collectionId: 'c1', orderIndex: 1, title: 'T', activeBranchId: 'b1' })
    repo.insertVersion({
      id: 'v1', trackId: 't1', parentId: null, blobHash: null,
      recipe: { steps: [{ type: 'auto-tag', config: { lang: 'en' } }], resolved: { tags: { artist: 'A' } } },
      materialized: false, createdAt: 't'
    })
    const v = repo.getVersion('v1')!
    expect(v.recipe.resolved?.tags?.artist).toBe('A')
    expect(v.recipe.steps[0].type).toBe('auto-tag')
    expect(v.materialized).toBe(false)
  })

  it('lists versions and branches for a track', () => {
    const repo = freshRepo()
    repo.insertCollection({ id: 'c1', kind: 'single', title: 'T', createdAt: 't' })
    repo.insertTrack({ id: 't1', collectionId: 'c1', orderIndex: 1, title: 'T', activeBranchId: 'b1' })
    repo.insertVersion({ id: 'v1', trackId: 't1', parentId: null, blobHash: null, recipe: { steps: [] }, materialized: false, createdAt: 't' })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })
    expect(repo.listVersions('t1').map((v) => v.id)).toEqual(['v1'])
    expect(repo.listBranches('t1').map((b) => b.name)).toEqual(['main'])
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/repo.test.ts`
Expected: FAIL — `createRepo` not found.

- [ ] **Step 3: Implement the read/write mapping**

```ts
// src/main/library/repo.ts
import type { Database } from 'better-sqlite3'
import type {
  Collection, TrackInstance, Version, Branch, Blob, ActivityEvent, Recipe
} from '../../shared/library'

// --- row <-> model mappers -------------------------------------------------
const toCollection = (r: any): Collection => ({
  id: r.id, kind: r.kind, title: r.title, sourceUrl: r.source_url ?? undefined, createdAt: r.created_at
})
const toTrack = (r: any): TrackInstance => ({
  id: r.id, collectionId: r.collection_id, sourceVideoId: r.source_video_id ?? undefined,
  sourceUrl: r.source_url ?? undefined, sourceAudioHash: r.source_audio_hash ?? undefined,
  orderIndex: r.order_index, title: r.title, activeBranchId: r.active_branch_id
})
const toVersion = (r: any): Version => ({
  id: r.id, trackId: r.track_id, parentId: r.parent_id ?? null, blobHash: r.blob_hash ?? null,
  recipe: JSON.parse(r.recipe) as Recipe, materialized: !!r.materialized,
  label: r.label ?? undefined, createdAt: r.created_at
})
const toBranch = (r: any): Branch => ({ id: r.id, trackId: r.track_id, name: r.name, tipVersionId: r.tip_version_id })
const toBlob = (r: any): Blob => ({ hash: r.hash, path: r.path, size: r.size, refcount: r.refcount })
const toActivity = (r: any): ActivityEvent => ({
  id: r.id, type: r.type, ts: r.ts, collectionId: r.collection_id ?? undefined,
  trackId: r.track_id ?? undefined, versionId: r.version_id ?? undefined, summary: r.summary
})

export function createRepo(db: Database) {
  const stmt = {
    insCollection: db.prepare(
      'INSERT INTO collections (id,kind,title,source_url,created_at) VALUES (@id,@kind,@title,@sourceUrl,@createdAt)'
    ),
    getCollection: db.prepare('SELECT * FROM collections WHERE id=?'),
    listCollections: db.prepare('SELECT * FROM collections ORDER BY created_at DESC'),
    insTrack: db.prepare(
      `INSERT INTO track_instances (id,collection_id,source_video_id,source_url,source_audio_hash,order_index,title,active_branch_id)
       VALUES (@id,@collectionId,@sourceVideoId,@sourceUrl,@sourceAudioHash,@orderIndex,@title,@activeBranchId)`
    ),
    getTrack: db.prepare('SELECT * FROM track_instances WHERE id=?'),
    listTracks: db.prepare('SELECT * FROM track_instances WHERE collection_id=? ORDER BY order_index'),
    setActiveBranch: db.prepare('UPDATE track_instances SET active_branch_id=? WHERE id=?'),
    insVersion: db.prepare(
      `INSERT INTO versions (id,track_id,parent_id,blob_hash,recipe,materialized,label,created_at)
       VALUES (@id,@trackId,@parentId,@blobHash,@recipe,@materialized,@label,@createdAt)`
    ),
    getVersion: db.prepare('SELECT * FROM versions WHERE id=?'),
    listVersions: db.prepare('SELECT * FROM versions WHERE track_id=? ORDER BY created_at'),
    setVersionBlob: db.prepare('UPDATE versions SET blob_hash=?, materialized=? WHERE id=?'),
    setVersionLabel: db.prepare('UPDATE versions SET label=? WHERE id=?'),
    delVersion: db.prepare('DELETE FROM versions WHERE id=?'),
    insBranch: db.prepare('INSERT INTO branches (id,track_id,name,tip_version_id) VALUES (@id,@trackId,@name,@tipVersionId)'),
    getBranch: db.prepare('SELECT * FROM branches WHERE id=?'),
    listBranches: db.prepare('SELECT * FROM branches WHERE track_id=? ORDER BY name'),
    setBranchTip: db.prepare('UPDATE branches SET tip_version_id=? WHERE id=?'),
    setBranchName: db.prepare('UPDATE branches SET name=? WHERE id=?'),
    getBlob: db.prepare('SELECT * FROM blobs WHERE hash=?'),
    insBlob: db.prepare('INSERT INTO blobs (hash,path,size,refcount) VALUES (?,?,?,0)'),
    incBlob: db.prepare('UPDATE blobs SET refcount = refcount + 1 WHERE hash=?'),
    decBlob: db.prepare('UPDATE blobs SET refcount = refcount - 1 WHERE hash=?'),
    delBlob: db.prepare('DELETE FROM blobs WHERE hash=?'),
    insActivity: db.prepare(
      `INSERT INTO activity (id,type,ts,collection_id,track_id,version_id,summary)
       VALUES (@id,@type,@ts,@collectionId,@trackId,@versionId,@summary)`
    ),
    listActivity: db.prepare('SELECT * FROM activity ORDER BY ts DESC LIMIT ?')
  }

  const v = (x: unknown): unknown => x ?? null // sqlite wants null, not undefined

  return {
    db,
    insertCollection: (c: Collection) =>
      stmt.insCollection.run({ ...c, sourceUrl: v(c.sourceUrl) }),
    getCollection: (id: string) => { const r = stmt.getCollection.get(id); return r ? toCollection(r) : null },
    listCollections: () => stmt.listCollections.all().map(toCollection),

    insertTrack: (t: Omit<TrackInstance, never>) =>
      stmt.insTrack.run({
        ...t, sourceVideoId: v(t.sourceVideoId), sourceUrl: v(t.sourceUrl), sourceAudioHash: v(t.sourceAudioHash)
      }),
    getTrack: (id: string) => { const r = stmt.getTrack.get(id); return r ? toTrack(r) : null },
    listTracks: (collectionId: string) => stmt.listTracks.all(collectionId).map(toTrack),
    setActiveBranch: (trackId: string, branchId: string) => stmt.setActiveBranch.run(branchId, trackId),

    insertVersion: (ver: Version) =>
      stmt.insVersion.run({
        ...ver, parentId: v(ver.parentId), blobHash: v(ver.blobHash),
        recipe: JSON.stringify(ver.recipe), materialized: ver.materialized ? 1 : 0, label: v(ver.label)
      }),
    getVersion: (id: string) => { const r = stmt.getVersion.get(id); return r ? toVersion(r) : null },
    listVersions: (trackId: string) => stmt.listVersions.all(trackId).map(toVersion),
    setVersionBlob: (id: string, hash: string | null, materialized: boolean) =>
      stmt.setVersionBlob.run(v(hash), materialized ? 1 : 0, id),
    setVersionLabel: (id: string, label: string) => stmt.setVersionLabel.run(label, id),

    insertBranch: (b: Branch) => stmt.insBranch.run(b),
    getBranch: (id: string) => { const r = stmt.getBranch.get(id); return r ? toBranch(r) : null },
    listBranches: (trackId: string) => stmt.listBranches.all(trackId).map(toBranch),
    setBranchTip: (id: string, versionId: string) => stmt.setBranchTip.run(versionId, id),
    setBranchName: (id: string, name: string) => stmt.setBranchName.run(name, id),

    getBlob: (hash: string) => { const r = stmt.getBlob.get(hash); return r ? toBlob(r) : null },
    listActivity: (limit = 200) => stmt.listActivity.all(limit).map(toActivity),
    insertActivity: (e: ActivityEvent) =>
      stmt.insActivity.run({ ...e, collectionId: v(e.collectionId), trackId: v(e.trackId), versionId: v(e.versionId) }),

    /** Internal statement bag — used by transactional helpers in Task 5. */
    _stmt: stmt
  }
}

export type Repo = ReturnType<typeof createRepo>
```

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/repo.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add src/main/library/repo.ts src/main/library/repo.test.ts
git commit -m "feat: add Library repository with CRUD and recipe mapping"
```

### Task 5: Transactional blob refcount + cascade delete (THE bug fix)

**Files:**
- Modify: `src/main/library/repo.ts`
- Test: `src/main/library/repo-refcount.test.ts`

- [ ] **Step 1: Write the failing test (this encodes the original bug as a regression)**

```ts
// src/main/library/repo-refcount.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'

let dir: string
const setup = () => {
  const db = new Database(':memory:')
  migrate(db)
  const repo = createRepo(db)
  const store = createContentStore(join(dir, 'blobs'))
  return { repo, store }
}
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-rc-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function ingestBlob(store: ReturnType<typeof createContentStore>, content: string): { hash: string; path: string; size: number } {
  const f = join(dir, `${Math.random()}.mp3`)
  writeFileSync(f, content)
  return store.put(f)
}

describe('refcount + cascade delete', () => {
  it('refBlob registers + increments; deref decrements and removes file at zero', () => {
    const { repo, store } = setup()
    const b = ingestBlob(store, 'x')
    repo.refBlob(b, store)
    expect(repo.getBlob(b.hash)?.refcount).toBe(1)
    repo.refBlob(b, store)
    expect(repo.getBlob(b.hash)?.refcount).toBe(2)
    repo.derefBlob(b.hash, store)
    expect(repo.getBlob(b.hash)?.refcount).toBe(1)
    expect(existsSync(b.path)).toBe(true)
    repo.derefBlob(b.hash, store)
    expect(repo.getBlob(b.hash)).toBeNull()
    expect(existsSync(b.path)).toBe(false)
  })

  it('REGRESSION: two track instances sharing one blob — deleting one keeps the file for the other', () => {
    const { repo, store } = setup()
    const root = ingestBlob(store, 'shared-raw-audio')
    // collection A with a track whose root version points at the shared blob
    for (const id of ['A', 'B']) {
      repo.insertCollection({ id: `c${id}`, kind: 'single', title: id, createdAt: 't' })
      repo.insertTrack({ id: `t${id}`, collectionId: `c${id}`, orderIndex: 1, title: id, activeBranchId: `b${id}` })
      repo.insertVersion({ id: `v${id}`, trackId: `t${id}`, parentId: null, blobHash: root.hash, recipe: { steps: [] }, materialized: true, createdAt: 't' })
      repo.insertBranch({ id: `b${id}`, trackId: `t${id}`, name: 'main', tipVersionId: `v${id}` })
      repo.refBlob(root, store)
    }
    expect(repo.getBlob(root.hash)?.refcount).toBe(2)

    repo.deleteTrack('tA', store) // delete the "solo" copy
    expect(repo.getTrack('tA')).toBeNull()
    expect(existsSync(root.path)).toBe(true)            // file survives!
    expect(repo.getBlob(root.hash)?.refcount).toBe(1)   // still referenced by B

    repo.deleteTrack('tB', store) // now the last reference
    expect(existsSync(root.path)).toBe(false)
    expect(repo.getBlob(root.hash)).toBeNull()
  })

  it('deleteCollection cascades to its tracks/versions/branches and derefs their blobs', () => {
    const { repo, store } = setup()
    const blob = ingestBlob(store, 'only-here')
    repo.insertCollection({ id: 'c1', kind: 'playlist', title: 'P', createdAt: 't' })
    repo.insertTrack({ id: 't1', collectionId: 'c1', orderIndex: 1, title: 'T', activeBranchId: 'b1' })
    repo.insertVersion({ id: 'v1', trackId: 't1', parentId: null, blobHash: blob.hash, recipe: { steps: [] }, materialized: true, createdAt: 't' })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })
    repo.refBlob(blob, store)
    repo.deleteCollection('c1', store)
    expect(repo.getCollection('c1')).toBeNull()
    expect(repo.getTrack('t1')).toBeNull()
    expect(existsSync(blob.path)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/repo-refcount.test.ts`
Expected: FAIL — `refBlob`/`derefBlob`/`deleteTrack`/`deleteCollection` not found.

- [ ] **Step 3: Add the transactional helpers to the repo**

Add these inside the object returned by `createRepo` in `src/main/library/repo.ts` (before `_stmt`). They need the content store passed in so blob files are removed in lockstep with the DB; all mutations are wrapped in `db.transaction(...)` for atomicity (N1):

```ts
    /** Register a blob row if new, then increment its refcount. Transactional. */
    refBlob(blob: { hash: string; path: string; size: number }, _store: unknown) {
      db.transaction(() => {
        if (!stmt.getBlob.get(blob.hash)) stmt.insBlob.run(blob.hash, blob.path, blob.size)
        stmt.incBlob.run(blob.hash)
      })()
    },
    /** Decrement a blob's refcount; at zero, delete the row AND the file. Transactional. */
    derefBlob(hash: string, store: { remove(h: string): void }) {
      const removed = db.transaction(() => {
        const row = stmt.getBlob.get(hash) as { refcount: number } | undefined
        if (!row) return false
        if (row.refcount <= 1) { stmt.delBlob.run(hash); return true }
        stmt.decBlob.run(hash); return false
      })()
      if (removed) store.remove(hash) // file IO outside the txn; safe — row already gone
    },
    /** Delete a track instance: drop its versions/branches and deref every blob they held. */
    deleteTrack(trackId: string, store: { remove(h: string): void }) {
      const hashes = db.transaction(() => {
        const versions = stmt.listVersions.all(trackId) as Array<{ blob_hash: string | null }>
        const blobHashes = versions.map((r) => r.blob_hash).filter((h): h is string => !!h)
        // FK ON DELETE CASCADE removes versions+branches when the track row goes.
        stmt.getTrack.get(trackId) && db.prepare('DELETE FROM track_instances WHERE id=?').run(trackId)
        const dropped: string[] = []
        for (const h of blobHashes) {
          const row = stmt.getBlob.get(h) as { refcount: number } | undefined
          if (!row) continue
          if (row.refcount <= 1) { stmt.delBlob.run(h); dropped.push(h) } else stmt.decBlob.run(h)
        }
        return dropped
      })()
      for (const h of hashes) store.remove(h)
    },
    /** Delete a collection and all of its tracks (cascade), derefing blobs. */
    deleteCollection(collectionId: string, store: { remove(h: string): void }) {
      const trackIds = (stmt.listTracks.all(collectionId) as Array<{ id: string }>).map((r) => r.id)
      for (const tid of trackIds) this.deleteTrack(tid, store)
      db.prepare('DELETE FROM collections WHERE id=?').run(collectionId)
    },
    /** Delete a single version (must not be a branch tip; caller enforces). Derefs its blob. */
    deleteVersion(versionId: string, store: { remove(h: string): void }) {
      const hash = db.transaction(() => {
        const row = stmt.getVersion.get(versionId) as { blob_hash: string | null } | undefined
        if (!row) return null
        stmt.delVersion.run(versionId)
        const h = row.blob_hash
        if (!h) return null
        const b = stmt.getBlob.get(h) as { refcount: number } | undefined
        if (!b) return null
        if (b.refcount <= 1) { stmt.delBlob.run(h); return h }
        stmt.decBlob.run(h); return null
      })()
      if (hash) store.remove(hash)
    },
```

> **Note:** `this.deleteTrack` inside `deleteCollection` requires the returned object to call its own method — define the object as a `const repo = { ... }; return repo` and call `repo.deleteTrack(...)` instead of `this.` to avoid binding pitfalls. Refactor accordingly.

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/repo-refcount.test.ts`
Expected: PASS (all 3) — including the regression test for the original shared-file bug.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/repo.ts src/main/library/repo-refcount.test.ts
git commit -m "feat: add transactional blob refcounting and cascade delete"
```

### Task 6: Orphan-blob GC (crash-safety reconciliation)

**Files:**
- Create: `src/main/library/gc.ts`
- Test: `src/main/library/gc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/gc.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { collectGarbage } from './gc'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-gc-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('orphan GC', () => {
  it('removes on-disk blobs that have no row (crash between blob write and DB commit)', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db)
    const store = createContentStore(join(dir, 'blobs'))
    const f = join(dir, 'x.mp3'); writeFileSync(f, 'orphan')
    const { hash, path } = store.put(f) // on disk, never registered in DB
    const report = collectGarbage(repo, store)
    expect(report.removedFiles).toContain(hash)
    expect(existsSync(path)).toBe(false)
  })

  it('marks versions whose blob is missing on disk as unmaterialized', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db)
    const store = createContentStore(join(dir, 'blobs'))
    repo.insertCollection({ id: 'c1', kind: 'single', title: 'T', createdAt: 't' })
    repo.insertTrack({ id: 't1', collectionId: 'c1', orderIndex: 1, title: 'T', activeBranchId: 'b1' })
    repo.insertVersion({ id: 'v1', trackId: 't1', parentId: 'v0', blobHash: 'deadbeef', recipe: { steps: [{ type: 'rename', config: {} }] }, materialized: true, createdAt: 't' })
    // blobs row exists but file does not
    repo.db.prepare('INSERT INTO blobs (hash,path,size,refcount) VALUES (?,?,?,1)').run('deadbeef', store.pathFor('deadbeef'), 1)
    const report = collectGarbage(repo, store)
    expect(report.demoted).toContain('v1')
    expect(repo.getVersion('v1')?.materialized).toBe(false)
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/gc.test.ts`
Expected: FAIL — `collectGarbage` not found.

- [ ] **Step 3: Implement GC**

```ts
// src/main/library/gc.ts
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'

export interface GcReport {
  removedFiles: string[] // hashes of on-disk blobs deleted (no row or refcount 0)
  demoted: string[] // version ids marked unmaterialized (DB row references missing file)
}

/**
 * Reconcile the content store against the DB. Safe to run on every launch:
 * - on-disk blob with no row (or refcount 0) → delete the file (orphan from a crash
 *   between blob write and DB commit, or a stale row that already lost its refs);
 * - DB row whose file is missing → demote any versions pointing at it to unmaterialized
 *   so they recompute on demand (N2/R7).
 */
export function collectGarbage(repo: Repo, store: ContentStore): GcReport {
  const report: GcReport = { removedFiles: [], demoted: [] }

  // 1. on-disk → DB
  const shards = existsSync(store.root) ? readdirSync(store.root) : []
  for (const shard of shards) {
    if (shard === '.tmp' || shard.startsWith('.')) continue
    const shardDir = join(store.root, shard)
    let files: string[] = []
    try { files = readdirSync(shardDir) } catch { continue }
    for (const file of files) {
      const hash = file.replace(/\.mp3$/i, '')
      const row = repo.getBlob(hash)
      if (!row || row.refcount <= 0) { store.remove(hash); report.removedFiles.push(hash) }
    }
  }

  // 2. DB → on-disk
  const rows = repo.db.prepare('SELECT hash FROM blobs').all() as Array<{ hash: string }>
  for (const { hash } of rows) {
    if (store.has(hash)) continue
    const versions = repo.db.prepare('SELECT id FROM versions WHERE blob_hash=?').all(hash) as Array<{ id: string }>
    for (const { id } of versions) {
      repo.setVersionBlob(id, null, false)
      report.demoted.push(id)
    }
    repo.db.prepare('DELETE FROM blobs WHERE hash=?').run(hash)
  }
  return report
}
```

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/gc.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/main/library/gc.ts src/main/library/gc.test.ts
git commit -m "feat: add orphan-blob garbage collection for crash safety"
```

# Phase 2 — Ingest into the Library + remove old history

At the end of this phase the running app writes downloads into the Library (single-version tracks; the raw-root/recipe split lands in Phase 4) and the shared-file bug is gone because deletes are refcounted.

### Task 7: Ingest fold — JobResult → Library rows

**Files:**
- Create: `src/main/library/ingest.ts`
- Test: `src/main/library/ingest.test.ts`

> **Phase-2 simplification:** ingest creates ONE version per track (the finished file as the root, `materialized`, `recipe: []`). Task 17 (Phase 4) upgrades this to a raw-root + default-chain-child pair once the pipeline surfaces the raw file and recipe. Keeping it single-version now lets the bug fix ship without touching the pipeline.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/ingest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { foldJobResultIntoLibrary } from './ingest'
import type { JobResult } from '../pipeline'

let dir: string
let seq = 0
const ids = () => `id${seq++}`
const now = () => '2026-06-02T00:00:00.000Z'
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-ingest-')); seq = 0 })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function fileWith(content: string): string {
  const f = join(dir, `${Math.random()}.mp3`); writeFileSync(f, content); return f
}

describe('foldJobResultIntoLibrary', () => {
  it('creates a playlist collection with one track+version+branch per done track', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const result: JobResult = {
      title: 'My Mix', folder: dir, url: 'http://list', kind: 'playlist', outcome: 'completed',
      tracks: [
        { title: 'One', status: 'done', file: fileWith('a'), videoId: 'v1', hash: 'h1', artist: 'AA' },
        { title: 'Two', status: 'failed', reason: 'nope' }
      ]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job1', result)
    const cols = repo.listCollections()
    expect(cols).toHaveLength(1)
    expect(cols[0].kind).toBe('playlist')
    const tracks = repo.listTracks(cols[0].id)
    expect(tracks).toHaveLength(1) // only the done track
    const branch = repo.getBranch(tracks[0].activeBranchId)!
    const ver = repo.getVersion(branch.tipVersionId)!
    expect(ver.parentId).toBeNull()
    expect(ver.materialized).toBe(true)
    expect(repo.getBlob(ver.blobHash!)?.refcount).toBe(1)
  })

  it('a single-video job becomes a `single` collection', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const result: JobResult = {
      title: 'Solo', folder: dir, url: 'http://watch', kind: 'video', outcome: 'completed',
      tracks: [{ title: 'Solo', status: 'done', file: fileWith('b'), videoId: 'v9', hash: 'h9' }]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job2', result)
    expect(repo.listCollections()[0].kind).toBe('single')
  })

  it('appends an `ingested` activity event', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const result: JobResult = {
      title: 'X', folder: dir, url: 'u', kind: 'video', outcome: 'completed',
      tracks: [{ title: 'X', status: 'done', file: fileWith('c') }]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job3', result)
    expect(repo.listActivity().some((a) => a.type === 'ingested')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/ingest.test.ts`
Expected: FAIL — `foldJobResultIntoLibrary` not found.

- [ ] **Step 3: Implement ingest**

```ts
// src/main/library/ingest.ts
import type { JobResult } from '../pipeline'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { CollectionKind } from '../../shared/library'

export interface IngestClock {
  idGen: () => string
  now: () => string
}

/**
 * Fold a finished download/resume JobResult into the Library. Each successfully
 * downloaded track becomes a collection-owned TrackInstance with a single root
 * Version (the finished file ingested as a blob) on a `main` branch. The blob is
 * refcounted so a later delete of one instance never destroys a shared file.
 *
 * Phase-2 shape: one version per track. Phase 4 (Task 17) replaces this with a
 * raw-root + default-chain-child pair.
 */
export function foldJobResultIntoLibrary(
  repo: Repo,
  store: ContentStore,
  clock: IngestClock,
  jobId: string,
  result: JobResult
): string {
  const kind: CollectionKind = result.kind === 'playlist' ? 'playlist' : 'single'
  const collectionId = clock.idGen()
  repo.insertCollection({
    id: collectionId, kind, title: result.title, sourceUrl: result.url, createdAt: clock.now()
  })

  let order = 0
  for (const t of result.tracks) {
    if (t.status !== 'done' || !t.file) continue
    order += 1
    const blob = store.put(t.file)
    const trackId = clock.idGen()
    const versionId = clock.idGen()
    const branchId = clock.idGen()
    repo.insertTrack({
      id: trackId, collectionId, sourceVideoId: t.videoId, sourceUrl: result.url,
      sourceAudioHash: t.hash, orderIndex: order, title: t.title, activeBranchId: branchId
    })
    repo.insertVersion({
      id: versionId, trackId, parentId: null, blobHash: blob.hash, recipe: { steps: [] },
      materialized: true, createdAt: clock.now()
    })
    repo.insertBranch({ id: branchId, trackId, name: 'main', tipVersionId: versionId })
    repo.refBlob(blob, store)
  }

  repo.insertActivity({
    id: clock.idGen(), type: 'ingested', ts: clock.now(),
    collectionId, summary: `Downloaded “${result.title}” (${order} track${order === 1 ? '' : 's'})`
  })
  return collectionId
}
```

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/ingest.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add src/main/library/ingest.ts src/main/library/ingest.test.ts
git commit -m "feat: fold finished jobs into the Library"
```

### Task 8: LibraryService — the object IPC handlers call

**Files:**
- Create: `src/main/library/service.ts`
- Test: `src/main/library/service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { createLibraryService } from './service'
import type { JobResult } from '../pipeline'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-svc-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function svc() {
  const db = new Database(':memory:'); migrate(db)
  const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
  const events: string[] = []
  const service = createLibraryService({ repo, store, emit: (e) => events.push(e) })
  return { service, repo, store, events }
}
function done(content: string, over: Partial<JobResult> = {}): JobResult {
  const f = join(dir, `${Math.random()}.mp3`); writeFileSync(f, content)
  return { title: 'T', folder: dir, url: 'u', kind: 'video', outcome: 'completed',
    tracks: [{ title: 'T', status: 'done', file: f }], ...over }
}

describe('LibraryService', () => {
  it('ingest emits library:changed and surfaces a CollectionView', () => {
    const { service, events } = svc()
    service.ingestJobResult('j1', done('a'))
    expect(events).toContain('library:changed')
    const views = service.listCollections()
    expect(views[0].tracks).toHaveLength(1)
    expect(views[0].tracks[0].currentVersionId).toBeTruthy()
  })

  it('getTrack returns instance + versions + branches', () => {
    const { service } = svc()
    service.ingestJobResult('j1', done('a'))
    const view = service.listCollections()[0]
    const detail = service.getTrack(view.tracks[0].id)!
    expect(detail.versions).toHaveLength(1)
    expect(detail.branches[0].name).toBe('main')
  })

  it('deleteTrack removes the row, derefs the blob, logs activity, emits change', () => {
    const { service, repo, store, events } = svc()
    service.ingestJobResult('j1', done('a'))
    const view = service.listCollections()[0]
    const versionId = view.tracks[0].currentVersionId
    const hash = repo.getVersion(versionId)!.blobHash!
    events.length = 0
    service.deleteTrack(view.tracks[0].id)
    expect(repo.getBlob(hash)).toBeNull()
    expect(existsSync(store.pathFor(hash))).toBe(false)
    expect(events).toContain('library:changed')
    expect(service.listActivity().some((a) => a.type === 'deleted')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/service.test.ts`
Expected: FAIL — `createLibraryService` not found.

- [ ] **Step 3: Implement the service (Phase-2 surface)**

```ts
// src/main/library/service.ts
import { randomUUID } from 'node:crypto'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { JobResult } from '../pipeline'
import { foldJobResultIntoLibrary } from './ingest'
import type { CollectionView, TrackDetail, ActivityEvent } from '../../shared/library'

export interface LibraryDeps {
  repo: Repo
  store: ContentStore
  /** Push a renderer event (e.g. 'library:changed', 'library:activityChanged'). */
  emit: (event: 'library:changed' | 'library:activityChanged') => void
}

export function createLibraryService(deps: LibraryDeps) {
  const { repo, store, emit } = deps
  const clock = { idGen: () => randomUUID(), now: () => new Date().toISOString() }

  const listCollections = (): CollectionView[] =>
    repo.listCollections().map((c) => ({
      ...c,
      tracks: repo.listTracks(c.id).map((t) => ({
        id: t.id, title: t.title, orderIndex: t.orderIndex,
        currentVersionId: repo.getBranch(t.activeBranchId)!.tipVersionId
      }))
    }))

  const getTrack = (trackId: string): TrackDetail | null => {
    const instance = repo.getTrack(trackId)
    if (!instance) return null
    return { instance, versions: repo.listVersions(trackId), branches: repo.listBranches(trackId) }
  }

  const listActivity = (limit = 200): ActivityEvent[] => repo.listActivity(limit)

  return {
    listCollections,
    getTrack,
    listActivity,

    ingestJobResult(jobId: string, result: JobResult): string {
      const id = foldJobResultIntoLibrary(repo, store, clock, jobId, result)
      emit('library:changed')
      emit('library:activityChanged')
      return id
    },

    deleteTrack(trackId: string): void {
      const t = repo.getTrack(trackId)
      repo.deleteTrack(trackId, store)
      if (t) repo.insertActivity({ id: clock.idGen(), type: 'deleted', ts: clock.now(), summary: `Deleted track “${t.title}”` })
      emit('library:changed'); emit('library:activityChanged')
    },

    deleteCollection(collectionId: string): void {
      const c = repo.getCollection(collectionId)
      repo.deleteCollection(collectionId, store)
      if (c) repo.insertActivity({ id: clock.idGen(), type: 'deleted', ts: clock.now(), summary: `Deleted “${c.title}”` })
      emit('library:changed'); emit('library:activityChanged')
    }
  }
}

export type LibraryService = ReturnType<typeof createLibraryService>
```

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/service.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add src/main/library/service.ts src/main/library/service.test.ts
git commit -m "feat: add LibraryService for ingest, reads and delete"
```

### Task 9: Remove `history` from settings (fresh start)

**Files:**
- Modify: `src/shared/types.ts` (Settings)
- Modify: `src/shared/defaults.ts`
- Modify: `src/main/settings.ts`
- Delete: `src/main/history.ts` and any `src/main/history.test.ts`

- [ ] **Step 1: Remove the field and its uses**

In `src/shared/types.ts`, delete the `history: HistoryEntry[]` line from the `Settings` interface (lines around 41). Leave `HistoryEntry`/`HistoryTrack`/`JobOutcome`/`HistoryTrackStatus` definitions in place — `pipeline.ts` `JobResult.tracks` still uses `HistoryTrack`.

In `src/shared/defaults.ts`, remove the `history: []` (or equivalent) entry from `DEFAULT_SETTINGS`.

In `src/main/settings.ts`:
- Remove `import { normalizeHistory } from './history'` (line 14).
- Remove the `history: normalizeHistory(p.history),` line from `mergeDefaults` (line 66).

- [ ] **Step 2: Delete the history module**

Run:
```bash
git rm src/main/history.ts
git rm --ignore-unmatch src/main/history.test.ts
```

- [ ] **Step 3: Typecheck — expect errors pointing at remaining history consumers**

Run: `pnpm run typecheck`
Expected: FAIL with errors in `src/main/index.ts` (uses `loadSettings().history`, `addEntry`, `removeEntry`, `entryFiles`, `updateTrack`, `removeTrack`) and possibly the renderer history view. These are fixed in Tasks 10–12; this step just confirms the blast radius.

- [ ] **Step 4: Commit the settings change (compiles after Task 10)**

> Do not commit yet — this change leaves the tree non-compiling. Proceed to Task 10 and commit them together. (Skip this step's commit.)

### Task 10: Wire the fold into the Library; remove history IPC

**Files:**
- Modify: `src/main/index.ts`
- Test: `src/main/library/ingest.test.ts` (already covers fold correctness)

- [ ] **Step 1: Construct the service and store once at startup**

In `src/main/index.ts`, near where the job pool is created, add (imports at top):

```ts
import { getLibraryDb } from './library/db'
import { createRepo } from './library/repo'
import { createContentStore } from './library/content-store'
import { createLibraryService } from './library/service'
import { collectGarbage } from './library/gc'
import { join } from 'node:path'
import { pluckerDir } from './settings'
```

```ts
const libraryStore = createContentStore(join(pluckerDir(), 'blobs'))
const libraryRepo = createRepo(getLibraryDb())
collectGarbage(libraryRepo, libraryStore) // reconcile after any crash
const library = createLibraryService({
  repo: libraryRepo,
  store: libraryStore,
  emit: (event) => win()?.webContents.send(event)
})
```

- [ ] **Step 2: Replace the `download`/`resume` branches of `foldJobResult`**

Delete the history-writing bodies for `kind === 'download'` and `kind === 'resume'` (lines ~338–379) and replace with a Library ingest. The `retransform`/`retryFailed` branches are removed entirely in Phase 4 (Task 18); for now, neutralize them so they don't reference deleted history helpers:

```ts
  const foldJobResult = (jobId: string, payload: JobStartPayload, result: JobResult): void => {
    win()?.setProgressBar(-1)
    const cancelled = result.outcome === 'cancelled'
    if (payload.kind === 'download' || payload.kind === 'resume') {
      library.ingestJobResult(jobId, result)
      if (!cancelled) deleteCheckpoint(jobsDir(), jobId)
      if (cancelled) win()?.webContents.send('jobs:interruptedChanged')
      return
    }
    // retransform / retryFailed: re-implemented as library operations in Phase 4.
  }
```

- [ ] **Step 3: Simplify `foldJobError`**

Replace its body so it no longer writes history; just log + surface the error (downloads that fail before producing a result simply aren't ingested):

```ts
  const foldJobError = (jobId: string, payload: JobStartPayload, e: { message: string; cancelled: boolean }): void => {
    win()?.setProgressBar(-1)
    deleteCheckpoint(jobsDir(), jobId)
    if (!e.cancelled) {
      log.error('app', 'job failed:', e.message)
      win()?.webContents.send('job:status', jobId, { phase: 'error', error: e.message })
    } else {
      log.info('app', 'job cancelled')
    }
  }
```

- [ ] **Step 4: Delete the `history:*` IPC handlers**

Remove the three handlers `history:get`, `history:removeEntry`, `history:removeTrack` (lines ~264–288) and the now-unused imports (`addEntry`, `removeEntry`, `entryFiles`, `removeTrack`, `updateTrack`, `mergeResumed`, `outcomeFromTracks`, `rmSync` if unused, `HistoryEntry` type if unused).

- [ ] **Step 5: Typecheck + test**

Run: `pnpm run typecheck && pnpm test`
Expected: node typecheck PASS; web typecheck may still FAIL on the renderer history view (fixed in Phase 3, Task 13). If so, commit main-side now and proceed.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/settings.ts src/main/index.ts
git commit -m "feat: write downloads into the Library and drop history persistence"
```

### Task 11: Manual smoke — confirm the bug is dead

**Files:** none (manual verification)

- [ ] **Step 1: Run the app and download a playlist**

Run: `pnpm dev`
Download any small playlist, then re-download one of its tracks as a single video into the same base folder.

- [ ] **Step 2: Inspect the store**

Run: `sqlite3 ~/.plucker/library.db 'SELECT count(*) FROM blobs; SELECT hash,refcount FROM blobs;'`
Expected: the re-downloaded track's identical raw bytes share a blob at refcount 2 (or two blobs if tags differed — either way each is independently refcounted).

- [ ] **Step 3: Delete one and confirm the other survives**

Delete the single-video collection via the (temporary) DB or the Phase-3 UI once built; confirm the playlist's file/blob still exists. (This is automated by the regression test in Task 5; this step is a real-app sanity check.)

# Phase 3 — Library UI + activity log

> **Prerequisite:** the in-flight job-rail/pending-job renderer changes (uncommitted at plan time) should be committed and the renderer typechecking clean before starting Phase 3.

### Task 12: `library:*` IPC handlers + preload API

**Files:**
- Modify: `src/main/index.ts` (register handlers)
- Modify: `src/preload/index.ts` (expose API; remove history API)
- Modify: `src/renderer/src/env.d.ts` if it mirrors the API (follow existing pattern)

- [ ] **Step 1: Register the read/delete handlers in `index.ts`**

After the `library` service is constructed (Task 10), register:

```ts
  ipcMain.handle('library:getCollections', () => library.listCollections())
  ipcMain.handle('library:getTrack', (_e, trackId: string) => library.getTrack(trackId))
  ipcMain.handle('library:getActivity', (_e, limit?: number) => library.listActivity(limit))
  ipcMain.handle('library:deleteTrack', (_e, trackId: string) => { library.deleteTrack(trackId); return library.listCollections() })
  ipcMain.handle('library:deleteCollection', (_e, id: string) => { library.deleteCollection(id); return library.listCollections() })
```

- [ ] **Step 2: Replace the History block of the preload API**

In `src/preload/index.ts`, delete the `// History` block (lines 116–126: `getHistory`, `removeHistoryEntry`, `removeHistoryTrack`, `onHistoryChanged`) and the `HistoryEntry` import. Add a Library block and import the shared types:

```ts
import type {
  CollectionView, TrackDetail, ActivityEvent
} from '../shared/library'
```

```ts
  // Library (editor model)
  getCollections: (): Promise<CollectionView[]> => ipcRenderer.invoke('library:getCollections'),
  getLibraryTrack: (trackId: string): Promise<TrackDetail | null> =>
    ipcRenderer.invoke('library:getTrack', trackId),
  getActivity: (limit?: number): Promise<ActivityEvent[]> =>
    ipcRenderer.invoke('library:getActivity', limit),
  deleteLibraryTrack: (trackId: string): Promise<CollectionView[]> =>
    ipcRenderer.invoke('library:deleteTrack', trackId),
  deleteLibraryCollection: (id: string): Promise<CollectionView[]> =>
    ipcRenderer.invoke('library:deleteCollection', id),
  onLibraryChanged: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('library:changed', fn)
    return () => ipcRenderer.removeListener('library:changed', fn)
  },
  onLibraryActivityChanged: (cb: () => void): (() => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('library:activityChanged', fn)
    return () => ipcRenderer.removeListener('library:activityChanged', fn)
  },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: node side PASS; web side will still error in `history-view.tsx`/`app.tsx` until Task 13.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: expose library IPC and preload API"
```

### Task 13: `useLibrary` hook + delete the history view

**Files:**
- Create: `src/renderer/src/library/use-library.ts`
- Delete: `src/renderer/src/history-view.tsx` (+ test if present)
- Test: `src/renderer/src/library/use-library.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/use-library.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLibrary } from './use-library'

const sample = [{ id: 'c1', kind: 'single', title: 'T', createdAt: 't', tracks: [] }]

beforeEach(() => {
  ;(globalThis as any).window = Object.assign((globalThis as any).window ?? {}, {
    plucker: {
      getCollections: vi.fn().mockResolvedValue(sample),
      onLibraryChanged: vi.fn().mockReturnValue(() => {})
    }
  })
})

describe('useLibrary', () => {
  it('loads collections on mount', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.collections).toHaveLength(1))
    expect(result.current.collections[0].title).toBe('T')
  })
})
```

> If `@testing-library/react` is not already a dev dependency, the existing renderer tests use `react-dom/server` `renderToStaticMarkup` (see `job-rail.test.tsx`). In that case, skip the hook test and test the components directly with `renderToStaticMarkup` as those tests do. Choose whichever matches the repo; do not add a new test framework.

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/use-library.test.tsx`
Expected: FAIL — `useLibrary` not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/renderer/src/library/use-library.ts
import { useEffect, useState, useCallback } from 'react'
import type { CollectionView } from '../../../shared/library'

export function useLibrary(): {
  collections: CollectionView[]
  refresh: () => Promise<void>
} {
  const [collections, setCollections] = useState<CollectionView[]>([])
  const refresh = useCallback(async () => {
    setCollections(await window.plucker.getCollections())
  }, [])
  useEffect(() => {
    void refresh()
    return window.plucker.onLibraryChanged(() => void refresh())
  }, [refresh])
  return { collections, refresh }
}
```

- [ ] **Step 4: Delete the history view**

Run:
```bash
git rm src/renderer/src/history-view.tsx
git rm --ignore-unmatch src/renderer/src/history-view.test.tsx
```
Remove every import/usage of `HistoryView` and the history preload methods (`getHistory`, `removeHistoryEntry`, `removeHistoryTrack`, `onHistoryChanged`, `retransform`, `retryFailed` UI) from `src/renderer/src/app.tsx`. Replace the History nav target's content with the Library view (Task 14) and activity log (Task 15) — temporarily render a placeholder `<div>` until those tasks land so the file compiles.

- [ ] **Step 5: Run + typecheck**

Run: `pnpm test -- src/renderer/src/library/use-library.test.tsx && pnpm run typecheck`
Expected: hook test PASS; typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer/src/library src/renderer/src/app.tsx
git commit -m "feat: add useLibrary hook and remove the history view"
```

### Task 14: Library view — collections & tracks

**Files:**
- Create: `src/renderer/src/library/library-view.tsx`
- Test: `src/renderer/src/library/library-view.test.tsx`

- [ ] **Step 1: Write the failing test (renderToStaticMarkup, matching `job-rail.test.tsx`)**

```tsx
// src/renderer/src/library/library-view.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LibraryView } from './library-view'
import type { CollectionView } from '../../../shared/library'

const collections: CollectionView[] = [
  { id: 'c1', kind: 'playlist', title: 'Road Trip', createdAt: 't',
    tracks: [{ id: 't1', title: 'Song A', orderIndex: 1, currentVersionId: 'v1' }] }
]

describe('LibraryView', () => {
  it('renders each collection title and its track count', () => {
    const html = renderToStaticMarkup(
      <LibraryView collections={collections} onOpenTrack={() => {}} onDeleteCollection={() => {}} />
    )
    expect(html).toContain('Road Trip')
    expect(html).toContain('Song A')
  })

  it('shows an empty state when there are no collections', () => {
    const html = renderToStaticMarkup(
      <LibraryView collections={[]} onOpenTrack={() => {}} onDeleteCollection={() => {}} />
    )
    expect(html.toLowerCase()).toContain('empty')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/library-view.test.tsx`
Expected: FAIL — `LibraryView` not found.

- [ ] **Step 3: Implement the view**

```tsx
// src/renderer/src/library/library-view.tsx
import { useTranslation } from 'react-i18next'
import type { CollectionView } from '../../../shared/library'

export function LibraryView({
  collections,
  onOpenTrack,
  onDeleteCollection
}: {
  collections: CollectionView[]
  onOpenTrack: (trackId: string) => void
  onDeleteCollection: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  if (collections.length === 0) {
    return <div className="library-empty">{t('library.empty')}</div>
  }
  return (
    <div className="library-view">
      {collections.map((c) => (
        <section key={c.id} className="library-collection">
          <header>
            <h2>{c.title}</h2>
            <span className="library-kind">{t(`library.kind.${c.kind}`)}</span>
            <button onClick={() => onDeleteCollection(c.id)}>{t('common.delete')}</button>
          </header>
          <ul>
            {c.tracks.map((tr) => (
              <li key={tr.id}>
                <button className="library-track" onClick={() => onOpenTrack(tr.id)}>
                  {tr.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Add i18n strings**

In `src/renderer/src/i18n/locales/en.ts` add under a new `library` key: `empty: 'Your library is empty — download something to get started.'`, `kind: { playlist: 'Playlist', album: 'Album', single: 'Single' }`. Add German equivalents in `de.ts`. Ensure `common.delete` exists (reuse if present).

- [ ] **Step 5: Run + typecheck**

Run: `pnpm test -- src/renderer/src/library/library-view.test.tsx && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/library/library-view.tsx src/renderer/src/library/library-view.test.tsx src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat: add Library collections/tracks view"
```

### Task 15: Activity log view

**Files:**
- Create: `src/renderer/src/library/activity-log.tsx`
- Test: `src/renderer/src/library/activity-log.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/activity-log.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActivityLog } from './activity-log'
import type { ActivityEvent } from '../../../shared/library'

const events: ActivityEvent[] = [
  { id: 'a1', type: 'ingested', ts: '2026-06-02T10:00:00.000Z', summary: 'Downloaded “Mix” (3 tracks)' },
  { id: 'a2', type: 'deleted', ts: '2026-06-02T11:00:00.000Z', summary: 'Deleted track “Song A”' }
]

describe('ActivityLog', () => {
  it('renders each event summary, most recent first', () => {
    const html = renderToStaticMarkup(<ActivityLog events={events} />)
    expect(html).toContain('Downloaded “Mix” (3 tracks)')
    expect(html).toContain('Deleted track “Song A”')
  })

  it('shows an empty state with no events', () => {
    const html = renderToStaticMarkup(<ActivityLog events={[]} />)
    expect(html.toLowerCase()).toContain('no activity')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/activity-log.test.tsx`
Expected: FAIL — `ActivityLog` not found.

- [ ] **Step 3: Implement the view**

```tsx
// src/renderer/src/library/activity-log.tsx
import { useTranslation } from 'react-i18next'
import type { ActivityEvent } from '../../../shared/library'

export function ActivityLog({ events }: { events: ActivityEvent[] }): React.JSX.Element {
  const { t } = useTranslation()
  if (events.length === 0) return <div className="activity-empty">{t('activity.empty')}</div>
  return (
    <ul className="activity-log">
      {events.map((e) => (
        <li key={e.id} className={`activity activity-${e.type}`}>
          <time dateTime={e.ts}>{new Date(e.ts).toLocaleString()}</time>
          <span>{e.summary}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Add i18n + wire into app**

Add `activity.empty: 'No activity yet.'` to `en.ts`/`de.ts`. In `app.tsx`, fetch activity via `window.plucker.getActivity()` (subscribe with `onLibraryActivityChanged`) and render `<ActivityLog>` where the old history detail used to be; render `<LibraryView>` as the primary surface for the (renamed) library nav target.

- [ ] **Step 5: Run + typecheck**

Run: `pnpm test -- src/renderer/src/library/activity-log.test.tsx && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/library/activity-log.tsx src/renderer/src/library/activity-log.test.tsx src/renderer/src/app.tsx src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat: add read-only activity log view"
```

# Phase 4 — Versioning & editing

**Determinism model (resolved):** the only non-deterministic transform is `auto-tag` (it fetches tags/cover from the network). Every other transform is **deterministic given its input blob** (its inputs — including any previously-fetched cover — already live in the parent blob). So:
- A version is **replayable** iff every step's transform is `deterministicGivenInput`.
- Replayable cold versions are recomputed by re-running their chain on the nearest materialized ancestor.
- Non-replayable versions (any chain containing `auto-tag`) are **pinned materialized** — never evicted — so they never need recompute. The default-chain first version (which contains `auto-tag`) is also a branch tip, so it is already always materialized.
- `recipe.resolved` ({tags, outputName}) is stored for every version so the UI/export can show/name a version without materializing it.

### Task 16: `deterministicGivenInput` flag + recipe build/replay

**Files:**
- Modify: `src/main/transforms/types.ts` (add flag to `TransformDefinition`)
- Modify: `src/main/transforms/auto-tag.ts`, `rename.ts`, `analyze-key-bpm.ts`, `square-cover.ts`, `trim-silence.ts` (set the flag)
- Create: `src/main/library/recipe.ts`
- Test: `src/main/library/recipe.test.ts`

- [ ] **Step 1: Add the flag to the transform contract**

In `src/main/transforms/types.ts`, add to `TransformDefinition`:
```ts
  /**
   * True when re-running this transform on the same input blob always yields the
   * same bytes (no network/clock/random). Used by the Library to decide whether a
   * cold version can be recomputed (replayed) or must stay materialized. `auto-tag`
   * is the only `false` — it fetches tags/cover from the network.
   */
  deterministicGivenInput: boolean
```
Set `deterministicGivenInput: false` in `auto-tag.ts`'s definition; set `true` in `rename.ts`, `analyze-key-bpm.ts`, `square-cover.ts`, `trim-silence.ts`.

- [ ] **Step 2: Write the failing test for recipe helpers**

```ts
// src/main/library/recipe.test.ts
import { describe, it, expect } from 'vitest'
import { buildRecipe, isReplayable } from './recipe'
import type { TransformDefinition } from '../transforms/types'

const reg = new Map<string, TransformDefinition>([
  ['auto-tag', { deterministicGivenInput: false } as TransformDefinition],
  ['trim-silence', { deterministicGivenInput: true } as TransformDefinition],
  ['rename', { deterministicGivenInput: true } as TransformDefinition]
])

describe('recipe helpers', () => {
  it('buildRecipe captures steps + resolved tags/outputName', () => {
    const recipe = buildRecipe(
      [{ instanceId: 'a', type: 'trim-silence', enabled: true, config: { db: -40 } }],
      { outputFile: '/x/Artist - Song.mp3', tags: { artist: 'Artist', title: 'Song' }, failed: false }
    )
    expect(recipe.steps).toEqual([{ type: 'trim-silence', config: { db: -40 } }])
    expect(recipe.resolved?.tags?.artist).toBe('Artist')
    expect(recipe.resolved?.outputName).toBe('Artist - Song')
  })

  it('isReplayable is false when any step is non-deterministic (auto-tag)', () => {
    expect(isReplayable({ steps: [{ type: 'trim-silence', config: {} }] }, reg)).toBe(true)
    expect(isReplayable({ steps: [{ type: 'auto-tag', config: {} }, { type: 'rename', config: {} }] }, reg)).toBe(false)
  })

  it('isReplayable treats unknown transform types as non-replayable', () => {
    expect(isReplayable({ steps: [{ type: 'mystery', config: {} }] }, reg)).toBe(false)
  })
})
```

- [ ] **Step 3: Run it (expect failure)**

Run: `pnpm test -- src/main/library/recipe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `recipe.ts`**

```ts
// src/main/library/recipe.ts
import { basename } from 'node:path'
import type { TransformInstance } from '../../shared/transforms'
import type { ChainResult, TransformDefinition, TransformServices } from '../transforms/types'
import { runTransformChain } from '../transforms/run-chain'
import type { Recipe } from '../../shared/library'

/** Build a stored recipe from the instances that ran and the chain's result. */
export function buildRecipe(instances: TransformInstance[], result: ChainResult): Recipe {
  return {
    steps: instances.map((i) => ({ type: i.type, config: i.config })),
    resolved: { tags: result.tags, outputName: basename(result.outputFile).replace(/\.mp3$/i, '') }
  }
}

/** A recipe is replayable iff every step is deterministic given its input blob. */
export function isReplayable(recipe: Recipe, registry: Map<string, TransformDefinition>): boolean {
  return recipe.steps.every((s) => registry.get(s.type)?.deterministicGivenInput === true)
}

/**
 * Recompute a replayable version: re-run its chain on a copy of the parent blob.
 * Caller MUST have verified `isReplayable` (non-replayable versions are pinned and
 * never reach here). Returns the produced file path.
 */
export async function replayChain(
  parentFile: string,
  destFolder: string,
  recipe: Recipe,
  registry: Map<string, TransformDefinition>,
  services: Omit<TransformServices, 'reportProgress'>,
  index = 1
): Promise<string> {
  const instances: TransformInstance[] = recipe.steps.map((s, i) => ({
    instanceId: `${s.type}-${i}`, type: s.type, enabled: true, config: s.config
  }))
  const result = await runTransformChain(
    parentFile, destFolder,
    { index, rawTitle: recipe.resolved?.tags?.title ?? basename(parentFile), sourceFile: parentFile },
    instances, registry, services, () => {}
  )
  if (result.failed) throw new Error(`replay failed: ${result.reason}`)
  return result.outputFile
}
```

- [ ] **Step 5: Run it (expect pass)**

Run: `pnpm test -- src/main/library/recipe.test.ts && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/transforms src/main/library/recipe.ts src/main/library/recipe.test.ts
git commit -m "feat: add recipe build/replay and transform determinism flag"
```

### Task 17: Materialization — recompute cold versions + LRU eviction

**Files:**
- Create: `src/main/library/materialize.ts`
- Test: `src/main/library/materialize.test.ts`

**Policy:** always-materialized = root + every branch tip + any non-replayable version. Plus an LRU (default capacity 8) of recently-materialized interior versions; materializing beyond capacity evicts the coldest *replayable, non-tip, non-root* version (deref its blob).

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/materialize.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { createMaterializer } from './materialize'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-mat-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('materializer', () => {
  it('returns the existing blob path when a version is already materialized', async () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const f = join(dir, 'root.mp3'); writeFileSync(f, 'root-bytes')
    const blob = store.put(f); repo.refBlob(blob, store)
    repo.insertCollection({ id: 'c1', kind: 'single', title: 'T', createdAt: 't' })
    repo.insertTrack({ id: 't1', collectionId: 'c1', orderIndex: 1, title: 'T', activeBranchId: 'b1' })
    repo.insertVersion({ id: 'v1', trackId: 't1', parentId: null, blobHash: blob.hash, recipe: { steps: [] }, materialized: true, createdAt: 't' })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })

    // a registry whose every transform is deterministic, and a fake replay that copies
    const mat = createMaterializer({ repo, store, registry: new Map(), services: {} as any, lruCapacity: 8 })
    const path = await mat.ensureMaterialized('v1')
    expect(path).toBe(store.pathFor(blob.hash))
  })
})
```

> The recompute path (cold version → replay) is integration-tested against real transforms in Task 19's manual check; this unit test pins the already-materialized fast path and the LRU bookkeeping. Add an LRU eviction unit test that inserts 9 interior materialized versions and asserts the coldest replayable one gets `materialized=false` after the 9th `ensureMaterialized`.

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/materialize.test.ts`
Expected: FAIL — `createMaterializer` not found.

- [ ] **Step 3: Implement the materializer**

```ts
// src/main/library/materialize.ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { TransformDefinition, TransformServices } from '../transforms/types'
import { isReplayable, replayChain } from './recipe'
import type { Version } from '../../shared/library'

export interface MaterializerDeps {
  repo: Repo
  store: ContentStore
  registry: Map<string, TransformDefinition>
  services: Omit<TransformServices, 'reportProgress'>
  lruCapacity?: number
}

export function createMaterializer(deps: MaterializerDeps) {
  const { repo, store, registry, services } = deps
  const capacity = deps.lruCapacity ?? 8
  const lru: string[] = [] // version ids, most-recent last

  const isProtected = (v: Version, tips: Set<string>): boolean =>
    v.parentId === null || tips.has(v.id) || !isReplayable(v.recipe, registry)

  const touch = (versionId: string): void => {
    const i = lru.indexOf(versionId)
    if (i >= 0) lru.splice(i, 1)
    lru.push(versionId)
  }

  /** Walk parent links up to the nearest materialized ancestor. */
  const ancestorsToReplay = (v: Version): Version[] => {
    const chain: Version[] = []
    let cur: Version | null = v
    while (cur && !cur.materialized) {
      chain.unshift(cur)
      cur = cur.parentId ? repo.getVersion(cur.parentId) : null
    }
    if (!cur) throw new Error(`no materialized ancestor for version ${v.id}`)
    return [cur, ...chain] // [materializedAncestor, ...coldDescendants]
  }

  const evictIfNeeded = (): void => {
    if (lru.length <= capacity) return
    const tips = new Set(
      repo.db.prepare('SELECT tip_version_id AS id FROM branches').all().map((r: any) => r.id as string)
    )
    for (let i = 0; i < lru.length; i++) {
      const v = repo.getVersion(lru[i])
      if (!v || isProtected(v, tips)) continue
      if (v.blobHash) repo.derefBlob(v.blobHash, store)
      repo.setVersionBlob(v.id, null, false)
      lru.splice(i, 1)
      return
    }
  }

  return {
    /** Ensure a version's blob exists on disk; recompute it if cold. Returns the file path. */
    async ensureMaterialized(versionId: string): Promise<string> {
      const v = repo.getVersion(versionId)
      if (!v) throw new Error(`unknown version ${versionId}`)
      if (v.materialized && v.blobHash && store.has(v.blobHash)) {
        touch(versionId)
        return store.pathFor(v.blobHash)
      }
      const chain = ancestorsToReplay(v) // [matAncestor, ...cold]
      let currentFile = store.pathFor(chain[0].blobHash!)
      const work = mkdtempSync(join(tmpdir(), 'plucker-replay-'))
      for (let i = 1; i < chain.length; i++) {
        const cold = chain[i]
        currentFile = await replayChain(currentFile, work, cold.recipe, registry, services)
        const blob = store.put(currentFile)
        repo.refBlob(blob, store)
        repo.setVersionBlob(cold.id, blob.hash, true)
        touch(cold.id)
        evictIfNeeded()
      }
      return store.pathFor(repo.getVersion(versionId)!.blobHash!)
    }
  }
}

export type Materializer = ReturnType<typeof createMaterializer>
```

- [ ] **Step 4: Run it (expect pass)**

Run: `pnpm test -- src/main/library/materialize.test.ts && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/materialize.ts src/main/library/materialize.test.ts
git commit -m "feat: add cold-version materialization with LRU eviction"
```

### Task 18: Two-node ingest (raw root + default-chain child)

**Files:**
- Modify: `src/main/pipeline.ts` (surface the raw download path + applied chain per track)
- Modify: `src/main/workers/job-protocol.ts` (carry the richer per-track result)
- Modify: `src/main/library/ingest.ts` (build root + child when raw is present)
- Test: `src/main/library/ingest.test.ts` (add a two-node case)

> **Pipeline change (precise instructions).** The pipeline currently returns `JobResult.tracks: HistoryTrack[]` with only the final file. Add two optional fields to the per-track terminal record it builds: `rawFile?: string` (the yt-dlp download before the chain ran — keep the per-track scratch dir alive until the job's `done` is folded; do NOT reap it earlier) and `appliedChain?: RecipeStep[]` (the enabled `settings.transforms` instances that ran, mapped to `{type, config}`). Thread these from `runTransformChain`'s inputs (the `sourceFile` is the raw file; the `instances` are the chain) back into the result record. Because the worker serializes the result over IPC, `rawFile` must be a path the **main** process can read — keep raw files under the job's scratch dir and have main copy them into the store during fold, then signal the worker to reap (or have main delete the scratch dir after fold).

- [ ] **Step 1: Extend the per-track result type**

In `src/shared/types.ts`, add to `HistoryTrack` (now a pipeline-internal type): `rawFile?: string` and `appliedChain?: { type: string; config: Record<string, unknown> }[]`. (Reuse `RecipeStep` shape; do not import from shared/library to avoid a cycle — inline the `{type,config}` literal.)

- [ ] **Step 2: Update the ingest test for two nodes**

Add to `src/main/library/ingest.test.ts`:
```ts
  it('builds a raw root + default-chain child when rawFile + appliedChain are present', () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const raw = fileWith('raw-audio'); const finalF = fileWith('tagged-audio')
    const result: JobResult = {
      title: 'X', folder: dir, url: 'u', kind: 'video', outcome: 'completed',
      tracks: [{ title: 'X', status: 'done', file: finalF, rawFile: raw,
        appliedChain: [{ type: 'auto-tag', config: {} }], artist: 'A', hash: 'h' }]
    }
    foldJobResultIntoLibrary(repo, store, { idGen: ids, now }, 'job1', result)
    const track = repo.listTracks(repo.listCollections()[0].id)[0]
    const versions = repo.listVersions(track.id)
    expect(versions).toHaveLength(2)
    const root = versions.find((v) => v.parentId === null)!
    const child = versions.find((v) => v.parentId === root.id)!
    expect(root.recipe.steps).toEqual([])
    expect(child.recipe.steps[0].type).toBe('auto-tag')
    expect(child.recipe.resolved?.tags?.artist).toBe('A')
    // main branch tip is the child (current)
    expect(repo.getBranch(track.activeBranchId)!.tipVersionId).toBe(child.id)
  })
```

- [ ] **Step 3: Run it (expect failure)**

Run: `pnpm test -- src/main/library/ingest.test.ts`
Expected: FAIL on the new case (still single-node).

- [ ] **Step 4: Upgrade `foldJobResultIntoLibrary`**

Replace the per-track body so that when `t.rawFile` is present it creates two versions:

```ts
  for (const t of result.tracks) {
    if (t.status !== 'done' || !t.file) continue
    order += 1
    const trackId = clock.idGen()
    const branchId = clock.idGen()
    const finalBlob = store.put(t.file)

    if (t.rawFile && t.appliedChain && t.appliedChain.length > 0) {
      const rootBlob = store.put(t.rawFile)
      const rootId = clock.idGen()
      const childId = clock.idGen()
      repo.insertTrack({ id: trackId, collectionId, sourceVideoId: t.videoId, sourceUrl: result.url, sourceAudioHash: t.hash, orderIndex: order, title: t.title, activeBranchId: branchId })
      repo.insertVersion({ id: rootId, trackId, parentId: null, blobHash: rootBlob.hash, recipe: { steps: [] }, materialized: true, createdAt: clock.now() })
      repo.insertVersion({
        id: childId, trackId, parentId: rootId, blobHash: finalBlob.hash, materialized: true, createdAt: clock.now(),
        recipe: { steps: t.appliedChain, resolved: { tags: { artist: t.artist, album: t.album, year: t.year, title: t.title }, outputName: undefined } }
      })
      repo.insertBranch({ id: branchId, trackId, name: 'main', tipVersionId: childId })
      repo.refBlob(rootBlob, store)
      repo.refBlob(finalBlob, store)
    } else {
      // fallback: single root version (no raw captured)
      const versionId = clock.idGen()
      repo.insertTrack({ id: trackId, collectionId, sourceVideoId: t.videoId, sourceUrl: result.url, sourceAudioHash: t.hash, orderIndex: order, title: t.title, activeBranchId: branchId })
      repo.insertVersion({ id: versionId, trackId, parentId: null, blobHash: finalBlob.hash, recipe: { steps: [] }, materialized: true, createdAt: clock.now() })
      repo.insertBranch({ id: branchId, trackId, name: 'main', tipVersionId: versionId })
      repo.refBlob(finalBlob, store)
    }
  }
```

- [ ] **Step 5: Run it (expect pass)**

Run: `pnpm test -- src/main/library/ingest.test.ts && pnpm run typecheck`
Expected: PASS (single-node and two-node cases).

- [ ] **Step 6: Commit**

```bash
git add src/main/pipeline.ts src/main/workers/job-protocol.ts src/main/library/ingest.ts src/main/library/ingest.test.ts src/shared/types.ts
git commit -m "feat: capture raw root + default chain as a two-node version graph"
```

### Task 19: Edit operation — produce a new version on the active branch

**Files:**
- Modify: `src/main/workers/job-protocol.ts` (add `libraryEdit` payload)
- Modify: worker source builder (single-file source for `libraryEdit`, reusing `buildRetransformSource` shape with a chain override)
- Modify: `src/main/library/service.ts` (`edit`, plus `foldEditResult`)
- Modify: `src/main/index.ts` (route `libraryEdit` job results to `library.foldEditResult`; add `library:edit` IPC)
- Modify: `src/preload/index.ts` (`editTrack`)
- Test: `src/main/library/service.test.ts` (edit appends a child version on the tip)

- [ ] **Step 1: Add the payload kind**

In `job-protocol.ts`:
```ts
  | { kind: 'libraryEdit'; trackId: string; branchId: string; parentVersionId: string; sourceFile: string; chain: { instanceId: string; type: string; enabled: boolean; config: Record<string, unknown> }[] }
```
The worker handles it by building a single-file `JobSource` over `sourceFile` (clone `buildRetransformSource` to `buildEditSource(sourceFile, title)`) and running the provided `chain` instead of `settings.transforms`. Thread a `chainOverride?: TransformInstance[]` through `RunJobDeps`/the worker so the pipeline runs the override when present.

- [ ] **Step 2: Write the failing service test**

```ts
  it('edit appends a child version on the active branch tip and advances the tip', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const view = service.listCollections()[0]
    const trackId = view.tracks[0].id
    const before = repo.getTrack(trackId)!
    const tipBefore = repo.getBranch(before.activeBranchId)!.tipVersionId
    // simulate a finished edit job result (one done track)
    const editedFile = join(dir, 'edited.mp3'); writeFileSync(editedFile, 'edited')
    service.foldEditResult({
      trackId, branchId: before.activeBranchId, parentVersionId: tipBefore,
      chainSteps: [{ type: 'trim-silence', config: { db: -40 } }],
      result: { title: 'T', folder: dir, url: '', kind: 'video', outcome: 'completed',
        tracks: [{ title: 'T', status: 'done', file: editedFile, artist: 'A' }] }
    })
    const after = repo.listVersions(trackId)
    expect(after).toHaveLength(2)
    const child = after.find((v) => v.parentId === tipBefore)!
    expect(child.recipe.steps[0].type).toBe('trim-silence')
    expect(repo.getBranch(before.activeBranchId)!.tipVersionId).toBe(child.id)
    expect(service.listActivity().some((a) => a.type === 'edited')).toBe(true)
  })
```

- [ ] **Step 3: Run it (expect failure)**

Run: `pnpm test -- src/main/library/service.test.ts`
Expected: FAIL — `foldEditResult` not found.

- [ ] **Step 4: Implement `foldEditResult` + `edit` in the service**

```ts
    /** Fold a finished libraryEdit job into a new child version on the branch tip. */
    foldEditResult(args: {
      trackId: string; branchId: string; parentVersionId: string
      chainSteps: { type: string; config: Record<string, unknown> }[]
      result: JobResult
    }): void {
      const track = repo.getTrack(args.trackId)
      const done = args.result.tracks.find((t) => t.status === 'done' && t.file)
      if (!track || !done?.file) { emit('library:changed'); return }
      const blob = store.put(done.file)
      const versionId = clock.idGen()
      repo.insertVersion({
        id: versionId, trackId: args.trackId, parentId: args.parentVersionId, blobHash: blob.hash,
        materialized: true, createdAt: clock.now(),
        recipe: { steps: args.chainSteps, resolved: { tags: { artist: done.artist, album: done.album, year: done.year, title: done.title } } }
      })
      repo.refBlob(blob, store)
      repo.setBranchTip(args.branchId, versionId)
      repo.insertActivity({ id: clock.idGen(), type: 'edited', ts: clock.now(), trackId: args.trackId, versionId, summary: `Edited “${track.title}”` })
      emit('library:changed'); emit('library:activityChanged')
    },
```

For the `edit` entry point (called by IPC), the service needs the materializer + a job dispatcher. Inject them via `LibraryDeps`:
```ts
  // add to LibraryDeps:
  materialize?: (versionId: string) => Promise<string>
  dispatchEdit?: (payload: { trackId: string; branchId: string; parentVersionId: string; sourceFile: string; chain: TransformInstance[] }) => Promise<void>
```
```ts
    /** Start an edit job: materialize the branch tip, run `chain`, fold into a child version. */
    async edit(trackId: string, chain: TransformInstance[]): Promise<void> {
      const track = repo.getTrack(trackId); if (!track) return
      const branch = repo.getBranch(track.activeBranchId)!
      const sourceFile = await deps.materialize!(branch.tipVersionId)
      await deps.dispatchEdit!({ trackId, branchId: branch.id, parentVersionId: branch.tipVersionId, sourceFile, chain })
      // foldEditResult is called by index.ts when the job completes
    },
```

- [ ] **Step 5: Wire in `index.ts`**

Construct a `Materializer` (Task 17) with the transform registry + services used by the pipeline, pass `materialize: (id) => materializer.ensureMaterialized(id)` and a `dispatchEdit` that starts a `libraryEdit` job on the pool. In `foldJobResult`, add: `if (payload.kind === 'libraryEdit') { library.foldEditResult({ trackId: payload.trackId, branchId: payload.branchId, parentVersionId: payload.parentVersionId, chainSteps: payload.chain.map(c => ({ type: c.type, config: c.config })), result }); return }`. Register `ipcMain.handle('library:edit', (_e, trackId, chain) => library.edit(trackId, chain))`.

- [ ] **Step 6: Preload**

Add to the Library block:
```ts
  editTrack: (trackId: string, chain: TransformInstance[]): Promise<void> => ipcRenderer.invoke('library:edit', trackId, chain),
```
(import `TransformInstance` from `../shared/transforms`.)

- [ ] **Step 7: Run + typecheck + commit**

Run: `pnpm test -- src/main/library/service.test.ts && pnpm run typecheck`
Expected: PASS.
```bash
git add src/main/library/service.ts src/main/library/service.test.ts src/main/index.ts src/main/workers/job-protocol.ts src/preload/index.ts src/main/pipeline.ts
git commit -m "feat: add Library edit operation producing a new version"
```

### Task 20: Version-graph view + track editor wiring

**Files:**
- Create: `src/renderer/src/library/version-graph.tsx` (+`.test.tsx`)
- Create: `src/renderer/src/library/track-editor.tsx` (+`.test.tsx`)
- Modify: `src/renderer/src/app.tsx` (open a track → editor)

- [ ] **Step 1: Write the failing test for the version graph**

```tsx
// src/renderer/src/library/version-graph.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VersionGraph } from './version-graph'
import type { Version, Branch } from '../../../shared/library'

const versions: Version[] = [
  { id: 'v1', trackId: 't1', parentId: null, blobHash: 'h1', recipe: { steps: [] }, materialized: true, createdAt: 't1', label: 'Original' },
  { id: 'v2', trackId: 't1', parentId: 'v1', blobHash: 'h2', recipe: { steps: [{ type: 'trim-silence', config: {} }] }, materialized: true, createdAt: 't2' }
]
const branches: Branch[] = [{ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v2' }]

describe('VersionGraph', () => {
  it('renders a node per version and marks the current (tip) one', () => {
    const html = renderToStaticMarkup(
      <VersionGraph versions={versions} branches={branches} currentVersionId="v2" onSelect={() => {}} />
    )
    expect(html).toContain('Original')
    expect(html).toContain('trim-silence')
    expect(html).toContain('is-current') // class on the current node
  })
})
```

- [ ] **Step 2: Run it (expect failure), then implement**

Run: `pnpm test -- src/renderer/src/library/version-graph.test.tsx` → FAIL.

```tsx
// src/renderer/src/library/version-graph.tsx
import type { Version, Branch } from '../../../shared/library'

function label(v: Version): string {
  if (v.label) return v.label
  if (v.parentId === null) return 'Original'
  return v.recipe.steps.map((s) => s.type).join(' + ') || 'Edit'
}

export function VersionGraph({
  versions, branches, currentVersionId, onSelect
}: {
  versions: Version[]
  branches: Branch[]
  currentVersionId: string
  onSelect: (versionId: string) => void
}): React.JSX.Element {
  const tipFor = new Map(branches.map((b) => [b.tipVersionId, b.name]))
  return (
    <ol className="version-graph">
      {versions.map((v) => (
        <li key={v.id} className={`version-node${v.id === currentVersionId ? ' is-current' : ''}`}>
          <button onClick={() => onSelect(v.id)}>{label(v)}</button>
          {tipFor.has(v.id) && <span className="branch-tag">{tipFor.get(v.id)}</span>}
          {!v.materialized && <span className="cold" title="Recomputes on open">cold</span>}
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Step 3: Track editor**

```tsx
// src/renderer/src/library/track-editor.tsx
import { useTranslation } from 'react-i18next'
import type { TrackDetail } from '../../../shared/library'
import { VersionGraph } from './version-graph'

export function TrackEditor({
  detail, onEdit, onExport, onClose
}: {
  detail: TrackDetail
  onEdit: (trackId: string) => void
  onExport: (trackId: string) => void
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const current = detail.branches.find((b) => b.id === detail.instance.activeBranchId)!
  return (
    <div className="track-editor">
      <header>
        <button onClick={onClose}>{t('common.back')}</button>
        <h2>{detail.instance.title}</h2>
      </header>
      <VersionGraph
        versions={detail.versions} branches={detail.branches}
        currentVersionId={current.tipVersionId} onSelect={() => {}}
      />
      <footer>
        <button onClick={() => onEdit(detail.instance.id)}>{t('library.applyTransforms')}</button>
        <button onClick={() => onExport(detail.instance.id)}>{t('library.export')}</button>
      </footer>
    </div>
  )
}
```
Write an analogous `track-editor.test.tsx` asserting the title + both footer buttons render. Add i18n keys `library.applyTransforms`, `library.export`, `common.back`.

- [ ] **Step 4: Wire into app.tsx**

When `onOpenTrack(trackId)` fires, call `window.plucker.getLibraryTrack(trackId)`, store the `TrackDetail`, and render `<TrackEditor>`; `onEdit` calls `window.plucker.editTrack(trackId, settings.transforms)` (the enabled chain) for the MVP; `onExport` is wired in Phase 6.

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library src/renderer/src/app.tsx src/renderer/src/i18n/locales
git commit -m "feat: add version graph and track editor UI"
```

# Phase 5 — Named branches

**Branch rule:** `edit(trackId, chain)` always appends to the **active branch's tip**. To branch off a historical node, the user creates a *named branch* off that node (which becomes active); subsequent edits advance it. This makes "editing a non-tip node" impossible without an explicit named branch, satisfying ADR-005.

### Task 21: Branch operations in the repo + service

**Files:**
- Modify: `src/main/library/service.ts` (createBranch / switchBranch / renameBranch / renameVersion)
- Test: `src/main/library/service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('createBranch forks off a node, sets it active; editing then advances only that branch', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const trackId = service.listCollections()[0].tracks[0].id
    const main = repo.getBranch(repo.getTrack(trackId)!.activeBranchId)!
    const rootTip = main.tipVersionId

    const clubId = service.createBranch(trackId, rootTip, 'club edit')
    const track = repo.getTrack(trackId)!
    expect(track.activeBranchId).toBe(clubId)              // new branch is active
    expect(repo.getBranch(clubId)!.tipVersionId).toBe(rootTip) // starts at the fork point
    expect(repo.listBranches(trackId).map((b) => b.name).sort()).toEqual(['club edit', 'main'])
    expect(service.listActivity().some((a) => a.type === 'branched')).toBe(true)
  })

  it('switchBranch changes the active branch and logs activity', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const trackId = service.listCollections()[0].tracks[0].id
    const main = repo.getTrack(trackId)!.activeBranchId
    const other = service.createBranch(trackId, repo.getBranch(main)!.tipVersionId, 'b2')
    service.switchBranch(trackId, main)
    expect(repo.getTrack(trackId)!.activeBranchId).toBe(main)
    expect(service.listActivity().some((a) => a.type === 'switched')).toBe(true)
  })
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/service.test.ts`
Expected: FAIL — `createBranch`/`switchBranch` not found.

- [ ] **Step 3: Implement in the service**

```ts
    createBranch(trackId: string, fromVersionId: string, name: string): string {
      const branchId = clock.idGen()
      repo.insertBranch({ id: branchId, trackId, name, tipVersionId: fromVersionId })
      repo.setActiveBranch(trackId, branchId)
      repo.insertActivity({ id: clock.idGen(), type: 'branched', ts: clock.now(), trackId, summary: `Branched “${name}”` })
      emit('library:changed'); emit('library:activityChanged')
      return branchId
    },
    switchBranch(trackId: string, branchId: string): void {
      repo.setActiveBranch(trackId, branchId)
      const b = repo.getBranch(branchId)
      repo.insertActivity({ id: clock.idGen(), type: 'switched', ts: clock.now(), trackId, summary: `Switched to “${b?.name ?? branchId}”` })
      emit('library:changed'); emit('library:activityChanged')
    },
    renameBranch(branchId: string, name: string): void {
      repo.setBranchName(branchId, name); emit('library:changed')
    },
    renameVersion(versionId: string, label: string): void {
      repo.setVersionLabel(versionId, label); emit('library:changed')
    },
```

- [ ] **Step 4: Run + commit**

Run: `pnpm test -- src/main/library/service.test.ts && pnpm run typecheck` → PASS.
```bash
git add src/main/library/service.ts src/main/library/service.test.ts
git commit -m "feat: add named branch create/switch/rename operations"
```

### Task 22: Branch IPC + preload + editor UI

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`
- Modify: `src/renderer/src/library/track-editor.tsx` (+ test)

- [ ] **Step 1: Register IPC**

```ts
  ipcMain.handle('library:createBranch', (_e, trackId: string, fromVersionId: string, name: string) => { const id = library.createBranch(trackId, fromVersionId, name); return { id, detail: library.getTrack(trackId) } })
  ipcMain.handle('library:switchBranch', (_e, trackId: string, branchId: string) => { library.switchBranch(trackId, branchId); return library.getTrack(trackId) })
  ipcMain.handle('library:renameBranch', (_e, branchId: string, name: string) => library.renameBranch(branchId, name))
  ipcMain.handle('library:renameVersion', (_e, versionId: string, label: string) => library.renameVersion(versionId, label))
```

- [ ] **Step 2: Preload**

```ts
  createBranch: (trackId: string, fromVersionId: string, name: string): Promise<{ id: string; detail: TrackDetail | null }> => ipcRenderer.invoke('library:createBranch', trackId, fromVersionId, name),
  switchBranch: (trackId: string, branchId: string): Promise<TrackDetail | null> => ipcRenderer.invoke('library:switchBranch', trackId, branchId),
  renameBranch: (branchId: string, name: string): Promise<void> => ipcRenderer.invoke('library:renameBranch', branchId, name),
  renameVersion: (versionId: string, label: string): Promise<void> => ipcRenderer.invoke('library:renameVersion', versionId, label),
```

- [ ] **Step 3: Editor UI — branch picker + "branch from here"**

Add to `track-editor.tsx`: a branch `<select>` listing `detail.branches` (value = active branch) that calls `onSwitchBranch(branchId)`; and pass `onSelect` to `VersionGraph` so selecting a non-tip node offers a "Branch from here" action that prompts for a name and calls `onCreateBranch(versionId, name)`. Update the editor test to assert the branch select renders all branch names and the active one is selected. Wire `onSwitchBranch`/`onCreateBranch` in `app.tsx` to the preload calls, refreshing the `TrackDetail` from the resolved value.

- [ ] **Step 4: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library && pnpm run typecheck` → PASS.
```bash
git add src/main/index.ts src/preload/index.ts src/renderer/src/library/track-editor.tsx src/renderer/src/library/track-editor.test.tsx src/renderer/src/app.tsx
git commit -m "feat: add branch controls to the track editor"
```

# Phase 6 — Export

### Task 23: Export module — materialize + copy with tag-derived names

**Files:**
- Create: `src/main/library/export.ts`
- Test: `src/main/library/export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/library/export.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrate } from './schema'
import { createRepo } from './repo'
import { createContentStore } from './content-store'
import { exportTracks } from './export'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'plucker-export-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('exportTracks', () => {
  it('copies each track’s current blob to dest named by its resolved tags', async () => {
    const db = new Database(':memory:'); migrate(db)
    const repo = createRepo(db); const store = createContentStore(join(dir, 'blobs'))
    const f = join(dir, 'x.mp3'); writeFileSync(f, 'bytes')
    const blob = store.put(f); repo.refBlob(blob, store)
    repo.insertCollection({ id: 'c1', kind: 'single', title: 'T', createdAt: 't' })
    repo.insertTrack({ id: 't1', collectionId: 'c1', orderIndex: 1, title: 'Song', activeBranchId: 'b1' })
    repo.insertVersion({ id: 'v1', trackId: 't1', parentId: null, blobHash: blob.hash, recipe: { steps: [], resolved: { tags: { artist: 'Artist', title: 'Song' } } }, materialized: true, createdAt: 't' })
    repo.insertBranch({ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' })

    const dest = join(dir, 'out')
    const written = await exportTracks(
      { repo, materialize: async (id) => store.pathFor(repo.getVersion(id)!.blobHash!), buildName: (tags) => `${tags.artist} - ${tags.title}` },
      ['t1'], dest, { perPlaylistSubfolder: false }
    )
    expect(written[0]).toBe(join(dest, 'Artist - Song.mp3'))
    expect(existsSync(written[0])).toBe(true)
    expect(readdirSync(dest)).toContain('Artist - Song.mp3')
  })
})
```

- [ ] **Step 2: Run it (expect failure), then implement**

Run: `pnpm test -- src/main/library/export.test.ts` → FAIL.

```ts
// src/main/library/export.ts
import { mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Repo } from './repo'
import type { TrackTags } from '../../shared/types'
import { sanitizeFileName } from '../rename'

export interface ExportDeps {
  repo: Repo
  /** Ensure a version's blob exists and return its path (recompute if cold). */
  materialize: (versionId: string) => Promise<string>
  /** Compute a base filename (no extension) from resolved tags. */
  buildName: (tags: TrackTags) => string
}

/**
 * One-shot export: for each track, materialize its current (active-branch tip)
 * version and copy it to `destFolder` named by its resolved tags. When
 * `perPlaylistSubfolder` is set, multi-track collections export into a subfolder
 * named after the collection.
 */
export async function exportTracks(
  deps: ExportDeps,
  trackIds: string[],
  destFolder: string,
  opts: { perPlaylistSubfolder: boolean }
): Promise<string[]> {
  const written: string[] = []
  for (const trackId of trackIds) {
    const track = deps.repo.getTrack(trackId)
    if (!track) continue
    const tipVersionId = deps.repo.getBranch(track.activeBranchId)!.tipVersionId
    const version = deps.repo.getVersion(tipVersionId)!
    const tags = version.recipe.resolved?.tags ?? { title: track.title }
    const src = await deps.materialize(tipVersionId)
    const collection = deps.repo.getCollection(track.collectionId)!
    const folder =
      opts.perPlaylistSubfolder && collection.kind !== 'single'
        ? join(destFolder, sanitizeFileName(collection.title))
        : destFolder
    mkdirSync(folder, { recursive: true })
    const base = sanitizeFileName(deps.buildName(tags) || track.title)
    const target = join(folder, `${base}.mp3`)
    copyFileSync(src, target)
    written.push(target)
  }
  return written
}
```

- [ ] **Step 3: Run + commit**

Run: `pnpm test -- src/main/library/export.test.ts && pnpm run typecheck` → PASS.
```bash
git add src/main/library/export.ts src/main/library/export.test.ts
git commit -m "feat: add one-shot export of current versions"
```

### Task 24: Export wired through service, IPC, and UI

**Files:**
- Modify: `src/main/library/service.ts` (`exportTracks` + activity), `src/main/index.ts` (IPC + folder dialog), `src/preload/index.ts`, `src/renderer/src/library/track-editor.tsx` + `library-view.tsx`

- [ ] **Step 1: Service method**

```ts
    async exportTracks(trackIds: string[], destFolder: string): Promise<string[]> {
      const written = await exportTracks(
        { repo, materialize: deps.materialize!, buildName: deps.buildName! },
        trackIds, destFolder, { perPlaylistSubfolder: deps.perPlaylistSubfolder?.() ?? false }
      )
      repo.insertActivity({ id: clock.idGen(), type: 'exported', ts: clock.now(), summary: `Exported ${written.length} track${written.length === 1 ? '' : 's'} to ${destFolder}` })
      emit('library:activityChanged')
      return written
    },
```
Add `buildName?: (tags) => string` and `perPlaylistSubfolder?: () => boolean` to `LibraryDeps`. In `index.ts`, supply `buildName` using the existing `buildFileName` + the rename transform's default template (or the configured one) and `perPlaylistSubfolder: () => loadSettings().downloads.perPlaylistSubfolder`.

- [ ] **Step 2: IPC + preload**

```ts
  ipcMain.handle('library:export', async (_e, trackIds: string[], destFolder: string) => library.exportTracks(trackIds, destFolder))
```
```ts
  exportTracks: (trackIds: string[], destFolder: string): Promise<string[]> => ipcRenderer.invoke('library:export', trackIds, destFolder),
```

- [ ] **Step 3: UI**

In `track-editor.tsx`, `onExport(trackId)` calls `window.plucker.chooseFolder()`; if a folder is returned, call `window.plucker.exportTracks([trackId], folder)` and surface a toast/confirmation. Add a collection-level "Export all" button in `library-view.tsx` that exports every track id in the collection. Add i18n `library.exportDone` (e.g. `'Exported {{count}} track(s)'`).

- [ ] **Step 4: Run + typecheck + commit**

Run: `pnpm test && pnpm run typecheck` → PASS.
```bash
git add src/main/library/service.ts src/main/index.ts src/preload/index.ts src/renderer/src/library src/renderer/src/i18n/locales
git commit -m "feat: wire export through service, IPC and UI"
```

### Task 25: Full-suite verification + manual end-to-end

**Files:** none

- [ ] **Step 1: Full check**

Run: `pnpm run lint && pnpm run typecheck && pnpm test`
Expected: all PASS.

- [ ] **Step 2: Manual end-to-end (the spec's acceptance walk)**

Run: `pnpm dev` and verify:
1. Download a playlist → appears in Library; activity shows "Downloaded …".
2. Open a track → version graph shows Original (root) + the default-chain version (current).
3. Apply transforms → a new version appears and becomes current.
4. Create a named branch off the original → branch tag shows; switch between branches.
5. Re-download one playlist track as a single → second instance; delete it → the playlist track's audio survives (the bug, gone).
6. Export a collection → files land in the chosen folder named by tags.
7. Quit mid-download (or `kill`) and relaunch → orphan GC runs, no crash, partial blobs cleaned.

- [ ] **Step 3: Commit any fixes; final commit**

```bash
git add -A && git commit -m "test: verify library/editor end-to-end"
```

---

## Self-Review

**Spec coverage (each requirement → task):**
- F1 managed store / export-only egress → Tasks 2, 23–24.
- F2 stable identity + version graph + raw root → Tasks 4, 7, 18.
- F3 navigate + named branches → Tasks 20, 21–22.
- F4 refcounted delete (no shared-file loss) → Task 5 (regression test) + 8.
- F5 ingest via existing engine → Tasks 7, 10, 18.
- F6 library ops reuse transform runner → Tasks 16, 19, 23.
- F7 one-shot export → Tasks 23–24.
- F8 library primary + activity log → Tasks 13–15.
- F9 fresh start (discard history) → Task 9.
- N1 integrity / transactions → Task 5. N2 crash safety / GC → Tasks 2, 6, 11. N3 determinism → Tasks 16–17. N4 disk discipline / LRU → Task 17. N5 reuse → Tasks 10, 18, 19.
- ADR-001..009 → all realized by the above; the only intentional intermediate deviation is Phase-2 single-version ingest (Task 7), corrected to the raw-root/child pair in Task 18.

**Placeholder scan:** no "TBD"/"implement later"; every code step carries real code. The pipeline raw-capture (Task 18) and worker `libraryEdit` wiring (Task 19) are described as precise instructions rather than full diffs because `pipeline.ts`/the worker host are large existing files — the new types, the ingest two-node code, and the fold code are fully written; the integration points name exact functions and fields.

**Type consistency:** `Recipe` is the object form `{ steps: RecipeStep[]; resolved?: { tags?; outputName? } }` everywhere (Tasks 1, 4, 5, 6, 7, 16–24). `refBlob/derefBlob/deleteTrack/deleteCollection/deleteVersion(store)`, `ensureMaterialized`, `foldEditResult`, `exportTracks` signatures are used identically across their definition and call sites. `createContentStore`/`createRepo`/`createLibraryService`/`createMaterializer` factory names are stable.

**Risk follow-ups folded into tasks:** R1→Task 5, R2→Task 16, R3→Task 0 (electron rebuild via postinstall), R4→Task 17, R5→Task 17, R6→phasing (bug dead at Task 10), R7→Task 6.

---

## Execution Handoff

Implement with **superpowers:subagent-driven-development** (recommended) — fresh subagent per task with review between tasks — or **superpowers:executing-plans** for batched inline execution. Phases are independently shippable; the original bug is structurally dead at the end of **Phase 2 (Task 10–11)**.





