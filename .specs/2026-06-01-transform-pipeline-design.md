# Plucker Transform Pipeline — Design

**Date:** 2026-06-01
**Status:** Approved for planning

## 1. Goal

Replace the monolithic per-file loop in `runJob` (`src/main/pipeline.ts`) with an
**ordered, configurable chain of transforms** applied per-track. A transform can do
anything to a track — tag it, trim it, rename it, compute BPM. Transforms are
order-independent in position (any transform may come before or after any other) and
pass the modified track forward; when two transforms touch the same field, the last one
wins. The interface is **versioned** so user-authored custom transforms can be supported
later. The settings UI gains a Transforms section to add/remove/configure/reorder them.

This iteration ships the framework plus two built-in transforms migrated from today's
hardcoded logic: **auto-tag** and **rename**. It also restructures the download
orchestration so each track is transformed the instant it finishes downloading, shows the
full tracklist upfront, and drives the Electron progress bar.

## 2. Key decisions (from brainstorming)

1. **Pipeline scope:** `resolve` + `download` stay fixed. Transforms run **post-download,
   per-track**. Tagging, rename (and future trim/bpm) are transforms.
2. **State model:** each track is transformed on a **temp working copy on disk**.
   Transforms mutate that copy; on success it **atomically replaces** the original. On a
   fatal failure the temp is discarded and the pristine download is kept. This gives
   crash-safety and idempotent re-runs.
3. **Config UI:** **schema-driven** generic form now; a per-transform custom component is
   a documented future escape hatch, not built now.
4. **Multiplicity:** the transform **definition declares `allowMultiple`**. Config is
   always an ordered list of instances; the UI refuses a second instance of a type whose
   definition says `allowMultiple: false`.
5. **Error policy:** the transform **definition declares `failureMode: 'fatal' | 'skip'`**.
   `skip` = log, skip this transform's effect, continue the chain. `fatal` = stop the
   chain for that track, discard temp, keep pristine download, mark `failed`.
6. **Rename** is migrated to a transform in this iteration too. Default chain:
   `auto-tag → rename` (rename must run after auto-tag because it reads final tags).
7. **Migration:** schema bumps v1 → v2. On load of any version < 2, **reset to the
   default transform chain and discard old `tagging`/`rename` config** (app is v0.1.0).
8. **Concurrency:** keep a **single playlist yt-dlp process**; **watch for per-track
   completions** and dispatch each track's transform chain immediately, concurrently.
9. **Tracklist-first:** resolve the full entry list before downloading and show **all**
   tracks as `queued` upfront (fixes "tracks appear one at a time").
10. **Progress:** transforms can report progress; the job exposes a single `overall`
    fraction using a **two-phase weighted-per-track** model (download 0–0.8, transforms
    0.8–1.0, mean across all tracks). The main process drives `win.setProgressBar`.

## 3. The versioned transform interface

Lives main-side (the `run` function never crosses to the renderer).

```ts
export interface TransformDefinition<C = Record<string, unknown>> {
  type: string                       // stable id: 'auto-tag', 'rename'
  apiVersion: 1                      // contract version for future custom transforms
  labelKey: string                   // i18n key
  descriptionKey: string             // i18n key
  allowMultiple: boolean             // may this type appear >1× in a chain?
  failureMode: 'fatal' | 'skip'
  configSchema: ConfigField[]        // drives the generic settings form
  defaultConfig: C
  run(ctx: TrackContext, config: C, services: TransformServices): Promise<void>
}
```

### Config schema field types

Only the types auto-tag/rename need now (extensible later):

```ts
type ConfigField =
  | { key: string; labelKey: string; type: 'boolean'; default: boolean }
  | { key: string; labelKey: string; type: 'number';  default: number; min?: number; max?: number }
  | { key: string; labelKey: string; type: 'string';  default: string }
  | { key: string; labelKey: string; type: 'enum';    default: string; options: { value: string; labelKey: string }[] }
```

*Escape hatch (future, not built):* a definition may later carry an optional renderer
component id for configs a schema cannot express.

## 4. What flows through — `TrackContext` and `TransformServices`

```ts
interface TrackContext {
  workingFile: string        // temp copy path; audio-rewriting transforms mutate it & may reassign it
  tags: TrackTags            // in-memory, last-wins; tag transforms write to workingFile AND update this
  info: { videoId?: string; rawTitle: string; sourceFile: string; index: number }
  outputName?: string        // rename sets desired final basename (no extension); used at commit
}

interface TransformServices {
  bin: BinaryPaths                       // e.g. ffmpeg path for trim
  fetch: typeof fetch                    // injectable for tests
  signal?: AbortSignal
  log: (msg: string) => void
  reportProgress: (fraction: number) => void   // 0..1 within this transform's step (optional to call)
}
```

**Commit step (framework, after the chain):** atomically move `workingFile` →
`<dest>/<outputName ?? originalBaseName>.mp3`, then delete the temp and the `.info.json`
sidecar. On a fatal failure: discard the temp, keep the pristine download, mark the track
`failed` with a reason.

## 5. Built-in transforms

### `auto-tag` — `allowMultiple: false`, `failureMode: 'skip'`

Absorbs today's inline tagging logic (including `mergeTags`, which leaves `pipeline.ts`):

- Read YouTube/ID3 tags from the working file.
- `parseTitle` on the sidecar/ID3 title.
- Optional MusicBrainz enrichment, gated by config.
- `mergeTags(yt, mb, primarySource)`.
- Write tags to the working file; embed cover art if enabled.
- Update `ctx.tags` so later transforms see the final tags.

**Config:** `enabled`-equivalent handled by the instance's `enabled` flag. Fields:
`primarySource` (enum youtube|musicbrainz), `enrichWithMusicBrainz` (bool),
`fetchCoverArt` (bool), `fetchGenre` (bool), `fetchTrackNumber` (bool),
`minMatchScore` (number), `userAgentEmail` (string — moved here from a global).

### `rename` — `allowMultiple: false`, `failureMode: 'skip'`

- Reads `ctx.tags`, computes `buildFileName(template, tags)`, sets `ctx.outputName`.
- **Config:** `template` (string). Must run after `auto-tag`.

## 6. Registry & IPC

- `src/main/transforms/registry.ts`: `Map<type, TransformDefinition>` with the built-ins.
- New IPC `getTransformCatalog()` returns a **serializable manifest** (every field except
  `run`) so the renderer can build the add-list and config forms without main-side code.

## 7. Settings schema v2

```ts
interface TransformInstance {
  instanceId: string                 // unique per instance
  type: string                       // references a registered definition
  enabled: boolean
  config: Record<string, unknown>
}

interface Settings {
  version: 2                         // bumped
  // ... unchanged groups: language, history, downloads, audio, cookies, performance
  transforms: TransformInstance[]    // ordered
  // REMOVED: tagging, rename
}
```

**Default chain:** `[ auto-tag (defaults), rename (defaults) ]`.

**Migration:** `mergeDefaults` resets `transforms` to the default chain whenever the loaded
version is `< 2`; old `tagging`/`rename` blocks are dropped. `performance.parallel`,
`downloads`, `audio`, `cookies`, `language`, `history` are preserved.

## 8. Per-track concurrency & tracklist-first

### Resolve all entries upfront

`resolveJob` becomes `resolvePlaylist`, returning:
```ts
{ kind: 'playlist' | 'video'; title: string; entries: { videoId: string; title: string; index: number }[] }
```
`runJob` pre-populates `tracks[]` with **every** entry as `status: 'queued'` and emits once
immediately, so the UI lists the whole playlist before any byte is downloaded.

### Single yt-dlp + completion watch

- `buildDownloadArgs` adds `--print "after_move:PLUCKERDONE %(filepath)s"`. yt-dlp prints
  this once per file **after** all post-processing, giving the final path reliably.
- `runYtDlp` gains an `onComplete(filePath: string)` callback that parses `PLUCKERDONE`
  lines (alongside the existing `onProgress` percent parsing).
- Download progress lines update the matching pre-populated track (by video id) to
  `downloading` with a percent; they no longer push new rows.

### Bounded transform pool

- Each `onComplete` enqueues a **transform task** into a pool of size
  `settings.performance.parallel`.
- A task: copy the finished mp3 to a temp working file → build the chain from
  `settings.transforms` (filter `enabled`, look up definitions, preserve order) → run each
  transform honoring its `failureMode` → commit → update progress to `done` and push the
  `HistoryTrack`.
- Tasks run concurrently with ongoing downloads and with each other.
- On yt-dlp `close`, await all in-flight transform tasks, then finalize statuses.

### Track status flow

`queued → downloading → transforming → done | failed | skipped`
(the current `tagging` status is generalized to `transforming`).

## 9. Progress aggregation

- Per track, combined progress = `download * 0.8 + transformPhase * 0.2`.
- `transformPhase` is guesstimated by **completed-step count** over the enabled transforms,
  refined within the active step by `reportProgress` when a transform supplies it.
- `overall` = mean of combined progress across all `N` tracks (failed/skipped tracks count
  as complete for the denominator so the bar can reach 1.0).
- `JobProgress` gains `overall: number` (0..1). The main process calls
  `win.setProgressBar(overall)` and clears it (`-1`) when the job ends.

### Type changes

- `TrackProgress`: add `transformPercent?: number` (0..100) and keep `percent` as the
  download percent; `status` gains `'transforming'`.
- `JobProgress`: add `overall: number`.

## 10. Settings UI — Transforms section

Replaces the **Tagging** and **Naming** sections in `SettingsPanel.tsx` with a single
reorderable instance list:

- Each row: enable checkbox · transform name (from `labelKey`) · ▲/▼ reorder buttons ·
  remove button (always removable) · expandable schema-driven config form.
- **Add transform** dropdown populated from `getTransformCatalog()`; types with
  `allowMultiple: false` that are already present are disabled.
- A generic `<SchemaForm>` renderer maps each `ConfigField` type to an input:
  `boolean → checkbox`, `number → number input` (with min/max), `string → text input`,
  `enum → select`.
- Reordering uses ▲/▼ buttons (no drag-and-drop dependency added now).

## 11. i18n

Add `en`/`de` strings for: transform labels & descriptions, each config field label, the
Transforms section heading, and the Add/Remove/Reorder controls.

## 12. Testing

- **Registry:** built-ins registered; catalog manifest is serializable and omits `run`.
- **auto-tag:** reframe existing `tagger`/`mb-select`/`musicbrainz` coverage around the
  transform; verify skip-on-failure keeps prior tags.
- **rename:** template → `outputName`; respects final tags.
- **Pipeline:** completion dispatch fires the chain per track; ordering preserved;
  `fatal` discards temp & marks `failed`; `skip` continues; tracklist pre-populated as
  `queued`; concurrency bounded by `performance.parallel`.
- **Migration:** v1 settings (with `tagging`/`rename`) load as v2 with the default chain;
  preserved groups survive.
- **Progress:** two-phase weighting math; `overall` reaches 1.0 with failed/skipped
  tracks present.
- **SchemaForm:** renders each field type and emits config changes.

## 13. Out of scope (future iterations)

- Custom user-authored transforms (the interface is versioned to allow them).
- Additional built-ins: trim start/end, BPM.
- Per-transform custom UI component escape hatch.
- Drag-and-drop reordering.
- Re-running transforms on existing history entries.
