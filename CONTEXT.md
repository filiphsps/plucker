# CONTEXT.md

Single-context domain doc for Plucker. Non-obvious architecture and shared
vocabulary — the things that are expensive to re-derive from the file tree.
Historical decisions live in `.specs/<YYYY-MM-DD-…>.md`; this file is the
current map. (For toolchain gotchas — pnpm, the better-sqlite3 ABI guard, LSP —
see `CLAUDE.md`.)

## What it is

Plucker is an **Electron desktop app** (electron-vite + React + TypeScript) that
downloads audio from URLs (yt-dlp), runs it through a transform pipeline
(ffmpeg + analysis: trim, key/BPM, auto-tag, cover, rename), tags it
(MusicBrainz), and files the result into a managed local **library**. macOS is
the primary target; releases ship unsigned arm64 + x64 DMGs.

## Process model

Four source roots, one per Electron tier plus shared code:

- **`src/main/`** — the Electron **main** process (Node). Owns everything
  privileged: spawning yt-dlp/ffmpeg, the job/transform pipeline, the library DB
  and blob store, settings, the menu/tray, auto-update.
- **`src/preload/`** — the **contextBridge** boundary. `index.ts` is the _entire_
  IPC surface the renderer can see (`window.api.*`); `index.d.ts` types it. New
  main-side capability is only reachable from the UI once it's exposed here.
- **`src/renderer/src/`** — the **React** UI. No Node access; talks to main only
  through `window.api`.
- **`src/shared/`** — cross-process, UI-agnostic code: pure utils
  (`format-bytes`, `camelot`, `chroma`, `fft`, `tempo`, `silence-filter`,
  `string-similarity`, `youtube-url`, …) and the shared type/contract modules
  (`types.ts`, `transforms.ts`, `library.ts`, `context-menu.ts`). This is the
  shared language between main and renderer — keep it the source of truth for
  IPC payload shapes.

`src/icon/` is the app-icon source (compiled by `scripts/build-icon.mjs`), not
runtime code.

## Download → transform → library flow

1. **Resolve.** `job:resolve` (→ `ytdlp.ts`, `source-metadata.ts`) expands a URL
   into entries without downloading — drives the renderer's **staging list**, where
   the user curates/reorders before committing.
2. **Start.** `job:start` takes a `StartJobRequest` (the curated entry list) and
   enqueues a **job**. Jobs run through the **job pool** (`job-pool.ts`,
   `pool.ts`, `throttle.ts`) with checkpointing (`job-checkpoint.ts`,
   `pipeline-checkpoint.ts`) so paused/interrupted jobs **resume** rather than
   restart (`resume-merge.ts`, renderer `resume-banner`).
3. **Pipeline.** `pipeline.ts` orchestrates per-track: download → ffmpeg decode →
   the **transform chain** → tagging → produces a `JobResult`.
4. **Transforms** (`src/main/transforms/`) are a registry of composable steps —
   `trim-silence`, `analyze-key-bpm`, `auto-tag`, `square-cover`, `rename` —
   assembled by `run-chain.ts`. Manifests/instances are typed in
   `src/shared/transforms.ts`.
5. **Tagging.** `musicbrainz.ts` + `mb-select.ts` / `mb-verify.ts` +
   `metadata-fusion.ts` + `title-parser.ts` resolve canonical track metadata;
   `tagger.ts` writes tags.
6. **Ingest.** `library/ingest.ts` folds the finished `JobResult` into the
   library (see below).

### Workers (CPU isolation)

Heavy/native work runs in **utilityProcess workers**, each a host/client/protocol
trio in `src/main/workers/`:

- **`job-*`** — runs a download/transform job off the main thread.
- **`media-*`** — ffmpeg/media decode work.
- **`analyze-*`** — audio analysis (key/BPM/chroma via essentia/FFT).

The `*-client.ts` runs in main and speaks the `*-protocol.ts` message contract to
the `*-worker.ts`. Keep client/protocol/worker in sync when changing messages.

## Library model (the core subsystem)

`src/main/library/` is a **content-addressed blob store + SQLite index**, not a
flat folder of files. This replaced the old flat history (the redesign that fixed
the shared-file deletion bug). Vocabulary:

- **Content store** (`content-store.ts`) — blobs addressed by **SHA-256** of their
  bytes. `put()` ingests a file and returns `{ hash, path, size }`; identical audio
  is stored once. Lives under the Plucker config dir.
- **Library DB** (`db.ts`, `schema.ts`) — **better-sqlite3** at
  `~/.plucker/library.db`, opened as a migrated singleton (WAL mode). The index
  over the blob store; never the bytes themselves.
- **Track → Branch → Version.** A **Track** is a logical song. A **Branch** is an
  editable line of edits on it. A **Version** is one concrete result, produced by
  applying a **recipe** (a transform chain) to a parent version
  (`recipe.ts`, `repo.ts`). A version points at a blob hash.
- **Materialize** (`materialize.ts`) — recompute/realize a version's blob on demand
  (cold versions can be regenerated from their recipe rather than stored forever).
- **Edit jobs** — re-running a transform chain on a track goes through a
  **`libraryEdit`** job (`service.ts` `dispatchEdit` → `{ trackId, branchId,
parentVersionId, sourceFile, chain }`); the result is folded back via `ingest.ts`.
- **Export** (`export.ts`) materializes chosen tracks out to a user folder.
- **GC** (`gc.ts`) refcounts blobs and reclaims unreferenced ones — why deleting one
  track no longer corrupts another that shared a file.
- **Service** (`service.ts`) is the façade the IPC layer calls; it `emit()`s
  `library:changed` / `library:activityChanged` so the renderer's library views
  (`src/renderer/src/library/`) refresh.

## External binaries

`yt-dlp` and `ffmpeg` are **not** npm deps — `scripts/fetch-binaries.mjs`
downloads platform binaries into `resources/bin/` (gitignored) on `postinstall`,
located at runtime by `binaries.ts`. `--all` fetches every platform for packaging
(`build:mac`).

## Config & data directory

Everything user-state lives under **`~/.plucker/`** (`settings.ts` →
`pluckerDir()`): `settings.json`, `library.db`, the blob store, and logs
(`log-file.ts`). `settings:reset` deletes config and relaunches into defaults.

## Updates

Auto-update via `updater.ts` + `update-cache.ts`, with **differential** downloads
(`differential.ts`, `blockmap.ts`) to ship only changed blocks between DMG
versions. Releases are cut by release-please (see `CLAUDE.md` → Releases).

## UI notes (non-obvious)

- **Custom titlebar / traffic-light handling** — the toolbar drops the macOS
  traffic-light gap in fullscreen (`use-fullscreen`, `isFullscreen` IPC).
- **Undockable console** — the log console (`console-drawer`, `console-panel`,
  `console-window`) can pop out into its own window with an independent zoom and
  a custom titlebar; its position and zoom persist across launches, and its
  position resets when re-docked.
