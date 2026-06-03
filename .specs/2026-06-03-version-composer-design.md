# Version Composer — create a child version from a chosen transform chain

**Date:** 2026-06-03
**Status:** Design (spec)
**Area:** Library / Editor (`src/renderer/src/library/`, `src/main/library/`)

## Problem

The Track Editor already renders a **version DAG** (Collection → Track → Version,
with named **Branches** pointing at tips). But the only way to make a new version
today is the **"Apply transforms"** button, which:

1. Applies the **global Settings transform chain** (`settings.transforms`) — the
   user can't compose a one-off chain for this specific edit.
2. Always forks off the **active branch's tip** (`service.edit` →
   `parentVersionId = branch.tipVersionId`), **ignoring whichever version is
   selected** in the graph.

We want to **properly support creating a new version**:

- The user composes an **ordered list of transformers** (1 ≤ n), in a specific
  order, for this edit only.
- The new version is placed as a **child of the *selected* version** (not the
  branch tip).
- The **currently-selected version is made visually obvious** in the graph (today
  the "selected" ring is the same accent as the "current" ring, so they're
  indistinguishable).

## Current architecture (what we build on)

- **Model** (`src/shared/library.ts`): `Version { id, trackId, parentId, blobHash,
  recipe, materialized, label, createdAt }`. `Branch { id, trackId, name,
  tipVersionId }`. `TrackInstance.activeBranchId` selects the "current" tip.
  `Recipe { steps: RecipeStep[]; resolved? }`, `RecipeStep { type, config }`.
- **Transforms**: registry of `TransformDefinition`s surfaced to the renderer as
  `TransformManifest[]` via `getTransformCatalog()` (`transforms:catalog`). A
  configured step is a `TransformInstance { instanceId, type, enabled, config }`.
- **Chain-builder UI already exists**: `TransformsSection` (`transforms-section.tsx`)
  + `transform-list-utils.ts` (`move`/`addInstance`/`canAdd`/`hasConfig`) +
  `transform-config-registry.ts` + `SchemaForm`. It renders an ordered,
  drag-reorderable, per-step-configurable, enable/disable chain. **Reuse it.**
- **Edit job flow**: `service.edit(trackId, chain)` → materialize tip →
  `dispatchEdit({ trackId, branchId, parentVersionId, sourceFile, chain })` →
  `libraryEdit` job runs the chain → `foldEditResult` inserts a child version off
  `parentVersionId` and calls `setBranchTip(branchId, newVersionId)`.
- **Graph layout invariant** (`version-graph-layout.ts`): every version must lie on
  **some branch's root→tip path**, else it collapses to lane 0 and can collide.
  *Consequence:* any new leaf we create must be reachable as a branch tip.

## Design

### 1. Per-edit transform chain (the composer)

A new **Version Composer** surface, opened from the editor, anchored to the
**selected version**. It:

- Loads the catalog (`getTransformCatalog()`), starts with an **empty** chain.
- Reuses `TransformsSection` for add / reorder / configure / enable-disable.
- Shows the **parent** it will build from: "From: «selected version label»".
- Has a primary **Create version** action, **disabled until ≥1 enabled step**.
- A **Cancel** action returns to the graph.
- Convenience: a **"Load from Settings chain"** affordance to seed the composer
  with `settings.transforms` (so the old one-click behavior is still one click).

Exact view shape / placement (overlay vs. routed panel) and visual design are owned
by the **frontend-design plan** (`2026-06-03-version-composer-plan*.md`). The spec
only fixes the *requirements* above and the *contract* below.

### 2. Parent = the selected version (branch semantics)

`createVersion(trackId, parentVersionId, chain)` replaces the implicit "fork off
active tip". On fold, the branch pointer is resolved by where the parent sits:

- **Parent is the active branch's tip** → advance that branch's tip to the new
  child (linear growth — today's behavior). Stay on the active branch.
- **Parent is a *different* branch's tip** → advance **that** branch to the new
  child and make it active.
- **Parent is an *interior* (non-tip) version** → **fork**: create a new branch
  rooted at the parent with `tipVersionId = newVersionId`, and make it active.
  Auto-name it uniquely (`edit`, `edit 2`, …, deduped against existing branch
  names for the track); it stays renamable via the existing rename-branch path.

This keeps the layout invariant (every leaf is a branch tip) intact and matches the
git-like mental model the graph already implies.

### 3. Make the selected version obvious

Today `VersionCard` rings both the *current* node and the *selected* node with
`border-accent`. Disambiguate:

- **Current** (= active branch tip / what the player shows): keep the accent ring +
  `● current` eyebrow.
- **Selected** (= the node the composer/actions act on): add a **distinct, stronger
  focus treatment** — an offset outer ring in a secondary hue + a small **`from` /
  `selected`** chip — so it reads unmistakably even when it is *not* the current
  node. When selected === current, show both affordances composed (accent ring +
  selected focus ring).
- Echo the selection in the editor header / composer ("From: …") so the anchor is
  legible without scanning the graph.

Visual specifics (colors, ring offsets, chip) are in the frontend-design plan;
`theme.ts` tokens are the source of truth for hues.

## Contract changes

### Shared types — none required
`TransformInstance` already carries the per-edit chain; `RecipeStep`/`Recipe`
already store it. No new shared types needed (a `parentVersionId: string` argument
threads through existing signatures).

### Main process

- **`LibraryService`**: add `createVersion(trackId: string, parentVersionId:
  string, chain: TransformInstance[]): Promise<void>`. (Keep `edit` as a thin
  wrapper that calls `createVersion` with the active tip, or remove it once the
  renderer is migrated — renderer is the only caller.)
  - Materialize `parentVersionId` (not the tip) for the source file.
  - `dispatchEdit({ trackId, branchId, parentVersionId, sourceFile, chain })`,
    where `branchId` is the branch that owns `parentVersionId` **if** the parent is
    a tip, else a sentinel resolved at fold time (interior fork creates the branch).
- **`foldEditResult`**: take `parentVersionId` (already does) and apply the branch
  resolution from §2 instead of unconditionally `setBranchTip(args.branchId, …)`.
  Record the right activity (`edited` vs `branched`).
- **`job-protocol.ts`**: `libraryEdit` payload already carries `parentVersionId`
  and `branchId`. For an interior fork, `branchId` may be empty/sentinel; fold
  derives the real branch. (Alternatively, the service creates the branch *before*
  dispatch and passes its id — preferred, simpler fold. Decide in the plan; either
  keeps the payload shape.)

> **Preferred:** create/resolve the target branch in `createVersion` *before*
> dispatch, so `foldEditResult` stays "insert child + setBranchTip(branchId)".
> Interior fork → `createBranch(parentVersionId, autoName)` first, dispatch with
> that branch id. This reuses `repo.insertBranch` + the existing fold path and
> needs **no** payload change.

### Preload (`src/preload/index.ts`)

- Replace/extend `editTrack(trackId, chain)` with
  `createTrackVersion(trackId, parentVersionId, chain)` → `library:edit` (or a new
  `library:createVersion` channel). Keep `getTransformCatalog` (already exposed).

### Main IPC (`src/main/index.ts`)

- Update the `library:edit` handler (or add `library:createVersion`) to call
  `library.createVersion(trackId, parentVersionId, chain)`.

### Renderer

- **`track-editor.tsx`**: the "Apply transforms" button opens the **composer** for
  the `selected` version instead of firing the settings chain. On confirm it calls
  `createTrackVersion(trackId, selected.id, composedChain)`.
- **New composer component** (e.g. `version-composer.tsx`) + colocated test.
- **`version-graph.tsx` / `VersionCard`**: distinct selected styling (§3).
- **i18n**: add `library.*` keys (`createVersion`, `newVersionFrom`, `fromVersion`,
  `addStep`, `composerEmptyHint`, `loadSettingsChain`, `selected`, …) to **both**
  `en.ts` and `de.ts`.

## Acceptance criteria

1. From the editor, selecting any version and opening the composer lets me build an
   **ordered chain of ≥1 transformer** (add, reorder, configure, remove); **Create
   version** is disabled with an empty chain.
2. Creating a version off the **active tip** advances that branch (linear), exactly
   as before.
3. Creating a version off an **interior** version produces a **new child of that
   version** on a **new branch** (visible as a fork in the graph), made active —
   no overlap/collision in the layout.
4. The **selected** version is visually unmistakable and distinct from the
   **current** version, both in the graph and the editor header.
5. A failed edit job still surfaces via `library:editFailed` (toast) and creates no
   version.
6. Unit tests cover: branch resolution (tip vs. interior), auto-name dedupe, the
   composer's "create disabled until ≥1 enabled step", and selected-vs-current
   styling. `pnpm typecheck`, `pnpm lint`, `pnpm test` green.

## Non-goals

- No new transformer *types* (compose existing ones only).
- No multi-parent merges (the DAG stays single-parent per version).
- No reordering/editing of an *already-created* version's recipe (immutable;
  compose a new child instead).
- No changes to the download→ingest path or the global Settings chain semantics.
