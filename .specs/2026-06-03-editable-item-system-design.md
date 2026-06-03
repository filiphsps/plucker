# Editable item-data system — design

**Date:** 2026-06-03
**Status:** Approved (design); pending implementation plan
**First consumer:** Rename a collection's title (inline)

## Problem & goal

Collections (`{ id, kind, title, sourceUrl, createdAt }`) cannot be renamed today.
More broadly, the app has no reusable way to *edit a domain entity's data* with a
form + validation. The only existing form, `schema-form.tsx`, is transform-config
specific (controlled-only, no validation, no submit/dirty lifecycle), and the only
"rename" UX in the app is a crude native `window.prompt()` for version labels.

**Goal:** build a small, **UI-agnostic** editable-item foundation (field schema,
validation, form state — the "boilerplate") and wire its **first consumer**: inline
editing of a collection's title. The foundation must be reusable so a later
modal/panel editor is just another consumer with no rework.

### Decisions captured from brainstorming

- **UI now = inline editing** (click title / pencil-on-hover → input; Enter/blur
  saves, Esc cancels). **Later = form panel/modal** — must reuse the same core.
- **Scope of "rename"** = the **collection** title only. Single-track collections are
  still collections and are renameable. Renaming individual track instances / branches
  is explicitly out of scope for now (version label rename keeps its current
  `window.prompt` until migrated later).
- **Title validation** = trim + non-empty + max length 200.

## Approach

Chosen: **headless form core + inline consumer.** All real logic lives in pure,
framework-free modules (the repo tests React only via `renderToStaticMarkup` — no DOM
— so logic must be unit-testable without a DOM, matching the existing `*-utils` + thin
`.tsx` convention). Rejected alternatives: inline-only ad-hoc (not the generic system
asked for; modal later = rework) and extending `schema-form.tsx` (would muddy its
single, transform-config purpose).

## Architecture (layers)

```
shared/forms/field.ts        pure: FieldSpec, validate, normalize   ← used by BOTH renderer + main
        │
        ├── renderer: ui/form/form-state.ts   pure form state over N fields
        │              ui/form/use-item-form.ts   thin useState wrapper (hook)
        │              ui/form/inline-edit.tsx     presentational single-field inline editor
        │                       │
        │                       └── collection-view.tsx (hero <h2> → InlineEdit, via onRename prop)
        │                           collection-menu.ts  ("Rename" item activates the editor)
        │
        └── main: library/repo.ts      renameCollection(id, title)  → UPDATE collections SET title
                  library/service.ts   renameCollection (validate, activity 'renamed', emit)
                  index.ts             ipcMain.handle('library:renameCollection')
       preload/index.ts               renameLibraryCollection(id, title)  → extends PluckerApi
```

## Components

### 1. `src/shared/forms/field.ts` (pure, cross-process)

```ts
export type FieldType = 'text' // open union; add 'number' | 'enum' | 'boolean' later
export interface FieldSpec {
  key: string
  type: FieldType
  labelKey: string      // i18n key
  required?: boolean
  maxLength?: number
  trim?: boolean        // default true for text
}
export type FieldErrorCode = 'required' | 'tooLong'

export function normalizeFieldValue(spec: FieldSpec, raw: string): string  // trims when spec.trim !== false
export function validateField(spec: FieldSpec, value: string): FieldErrorCode | null
```

- Pure and dependency-free → reused by the renderer form core **and** the main
  service (defense-in-depth: main normalizes + rejects invalid before writing).
- Returns an **error code**, not a message — the renderer maps the code to a
  translation (`forms.error.<code>`), keeping the core UI-agnostic.
- Colocated `field.test.ts`: trim, required (empty/whitespace), tooLong boundaries.

### 2. `src/renderer/src/ui/form/form-state.ts` (pure)

Generic over an ordered list of `FieldSpec`s and a values record.

```ts
export interface FormState {
  specs: FieldSpec[]
  values: Record<string, string>
  initial: Record<string, string>
  errors: Record<string, FieldErrorCode | null>
}
export function initForm(specs: FieldSpec[], initial: Record<string, string>): FormState
export function setValue(s: FormState, key: string, raw: string): FormState   // re-validates that field
export function validateAll(s: FormState): FormState
export function isDirty(s: FormState): boolean        // any normalized value !== initial
export function firstError(s: FormState): FieldErrorCode | null
```

- Framework-free → `form-state.test.ts` covers init/setValue/validateAll/isDirty.

### 3. `src/renderer/src/ui/form/use-item-form.ts` (hook, thin)

`useState<FormState>` wrapper exposing `{ values, errors, dirty, submitting, setValue,
submit, reset }`. `submit()` runs `validateAll`; if there are no errors **and** the
form is dirty, it `await`s the supplied `onSubmit(values)` (toggling `submitting`);
otherwise no-op. `reset(initial?)` re-seeds from initial (used on Esc and after the
upstream data refreshes). Logic delegates to `form-state.ts` so the hook stays trivial.

### 4. `src/renderer/src/ui/form/inline-edit.tsx` (presentational)

Single-field inline editor, built on `useItemForm` with a one-field spec.

- **Display mode:** renders the current text plus a pencil affordance on hover; click
  (on text or pencil) enters edit mode. Caller controls the rendered text element
  (passed as children / className) so it can sit in the collection hero `<h2>`.
- **Edit mode:** an `<input>` seeded with the current value, autofocused + selected.
  **Enter** or **blur** → `submit()` (saves only when valid & changed); **Esc** →
  `reset()` + exit. Invalid state shows the translated error (`forms.error.<code>`)
  and blocks save.
- **Externally activatable:** accepts an optional `editing` / `onEditingChange` (or
  imperative `activate()`) so the context-menu "Rename" item can open it.
- Input styling reuses the `schema-form` input classes for visual consistency.
- Thin → `inline-edit.test.tsx` asserts static markup (display text, input seed) via
  `renderToStaticMarkup`; interactive behavior is covered by the pure core tests.

### 5. Main vertical slice (collection title)

- **`repo.renameCollection(id, title): RunResult`** — prepared
  `UPDATE collections SET title=? WHERE id=?`. Added to the `Repo` interface +
  implementation. `repo.test.ts`: insert → rename → `getCollection` reflects it.
- **`service.renameCollection(collectionId, title)`** —
  `normalizeFieldValue` + `validateField` (shared `TITLE_FIELD` spec); **no-op** when
  invalid or unchanged; else `repo.renameCollection`, insert a **`'renamed'`** activity
  (`Renamed "old" → "new"`, reusing the existing-but-unused `ActivityType`), and emit
  `library:changed` + `library:activityChanged`. `service.test.ts`: title changes +
  `'renamed'` activity recorded + emits fire; invalid/empty title is a no-op.
- **IPC** `index.ts`: `ipcMain.handle('library:renameCollection', (_e, id, title) =>
  library.renameCollection(id, title))`.
- **Preload** `index.ts`: `renameLibraryCollection: (id, title) =>
  ipcRenderer.invoke('library:renameCollection', id, title)` — auto-extends
  `PluckerApi` (derived from the `api` object), so `src/preload/index.d.ts` needs no
  manual edit.

### 6. Renderer wiring

Two distinct callbacks (different names to avoid confusion):
- **save** — `onRename(id: string, title: string): void` performs the mutation.
- **begin-edit** — `onBeginRename(): void` (no value) opens the inline editor.

- **`collection-view.tsx`:** hero `<h2>{collection.title}</h2>` → `InlineEdit`. New
  `onRename(id, title)` (save) prop keeps the component free of `window.plucker`
  (consistent with its other prop callbacks). It also accepts a begin-edit signal
  (e.g. `beginRenameNonce` / imperative activate) so an external "Rename" command can
  open the editor. The rename → `library:changed` → `useLibrary` refetch → `app.tsx`
  re-derives the open collection → `CollectionView` re-renders with the new title; the
  editor `reset()`s to it.
- **`app.tsx`:** pass `onRename={(id, title) => window.plucker.renameLibraryCollection(id, title)}`;
  the gallery/page "Rename" command flips the begin-edit signal so the inline editor opens.
- **`collection-menu.ts`:** add a `{ label: t('library.rename'), symbol: 'pencil',
  onClick: opts.onBeginRename }` item (near Open) — begin-edit intent, distinct from the
  save callback above. `collection-menu.test.ts` updated.
- **i18n (`en.ts` + `de.ts`):** add `library.rename`; `forms.error.required`,
  `forms.error.tooLong`; `common.save` / `common.cancel` if not already present.

## Data flow (rename)

1. User activates inline edit (click title / pencil, or context-menu "Rename").
2. `useItemForm` validates on change; Enter/blur → `submit()` when valid & dirty.
3. `onSubmit` → `window.plucker.renameLibraryCollection(id, title)` → IPC →
   `service.renameCollection` (re-validates, writes, activity, emit).
4. `library:changed` → `useLibrary` refetches collections → UI shows new title.

## Error handling

- **Validation** at two layers: renderer (immediate inline feedback) and main
  (authoritative — never writes an empty/oversized title even if the renderer is
  bypassed). Both use the shared `field.ts`.
- **Invalid/unchanged** submissions are silent no-ops (no activity, no emit).
- IPC handler mirrors the existing `library:*` handlers (no new error channel needed;
  validation failures simply don't mutate).

## Testing

| Module | Test | Key cases |
| --- | --- | --- |
| `shared/forms/field.ts` | `field.test.ts` | trim; required on empty/whitespace; tooLong at/over `maxLength`; valid passes |
| `ui/form/form-state.ts` | `form-state.test.ts` | init seeds values; setValue revalidates; validateAll; isDirty vs normalized initial |
| `ui/form/inline-edit.tsx` | `inline-edit.test.tsx` | static markup: display text, input seed, error text rendering |
| `library/repo.ts` | `repo.test.ts` (extend) | renameCollection updates title |
| `library/service.ts` | `service.test.ts` (extend) | renames + `'renamed'` activity + emits; invalid/unchanged = no-op |
| `library/collection-menu.ts` | `collection-menu.test.ts` (extend) | "Rename" item present + dispatches |
| `collection-view.tsx` | existing test (update) | title still renders via InlineEdit display |

Run via `pnpm test` / `pnpm typecheck` / `pnpm lint` (per CLAUDE.md, use the pnpm
scripts so the better-sqlite3 ABI guard runs).

## Out of scope (YAGNI)

- The modal/panel editor itself (later; reuses the same core).
- Renaming track instances / branches through this system (later). Version label
  rename keeps its `window.prompt` until migrated.
- Field types beyond `text` (the `FieldType` union is left open to add them).
- Editing `kind` / `sourceUrl` / other collection fields.

## Files touched

**New:** `src/shared/forms/field.ts` (+test), `src/renderer/src/ui/form/form-state.ts`
(+test), `src/renderer/src/ui/form/use-item-form.ts`,
`src/renderer/src/ui/form/inline-edit.tsx` (+test).

**Edited:** `src/main/library/repo.ts` (+test), `src/main/library/service.ts` (+test),
`src/main/index.ts`, `src/preload/index.ts`,
`src/renderer/src/library/collection-view.tsx`,
`src/renderer/src/library/collection-menu.ts` (+test), `src/renderer/src/app.tsx`,
`src/renderer/src/i18n/locales/en.ts`, `src/renderer/src/i18n/locales/de.ts`.
