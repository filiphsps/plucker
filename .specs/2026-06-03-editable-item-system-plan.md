# Editable Item-Data System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, UI-agnostic editable-item foundation (shared field schema + validation, pure form state, a thin `useItemForm` hook, and an `InlineEdit` component) and wire its first consumer: inline renaming of a collection's title.

**Architecture:** Pure, framework-free logic lives in `src/shared/forms/field.ts` (validation, shared with the main process) and `src/renderer/src/ui/form/form-state.ts`. A thin `useItemForm` hook wraps the pure state; `InlineEdit` is the first presentational consumer. The main process gains a validated `renameCollection` service method exposed over IPC. A future modal editor reuses the same core.

**Tech Stack:** TypeScript, React 19, Electron (main/preload/renderer via electron-vite), better-sqlite3, Vitest (`renderToStaticMarkup` for components — no DOM), react-i18next, Tailwind.

**Conventions:** Use `pnpm` for everything (`pnpm test`, `pnpm typecheck`, `pnpm lint`) so the better-sqlite3 ABI guard runs. Commit messages follow Conventional Commits. Work on `master` (do not branch). Check LSP diagnostics after edits.

---

## File Structure

**New files:**
- `src/shared/forms/field.ts` — pure field schema + validation (cross-process). `+ field.test.ts`
- `src/renderer/src/ui/form/form-state.ts` — pure multi-field form state. `+ form-state.test.ts`
- `src/renderer/src/ui/form/use-item-form.ts` — thin React hook over `form-state` (no standalone test; logic covered by `form-state.test.ts`, render covered by `inline-edit.test.tsx`).
- `src/renderer/src/ui/form/inline-edit.tsx` — single-field inline editor. `+ inline-edit.test.tsx`

**Modified files:**
- `src/shared/library.ts` — add `COLLECTION_TITLE_FIELD` spec.
- `src/main/library/repo.ts` — add `renameCollection`. `+ repo.test.ts`
- `src/main/library/service.ts` — add `renameCollection`. `+ service.test.ts`
- `src/main/index.ts` — add `library:renameCollection` IPC handler.
- `src/preload/index.ts` — add `renameLibraryCollection` (auto-extends `PluckerApi`).
- `src/renderer/src/i18n/locales/en.ts` + `de.ts` — add strings.
- `src/renderer/src/library/collection-view.tsx` — title → `InlineEdit`. `+ collection-view.test.tsx`
- `src/renderer/src/library/collection-menu.ts` — add "Rename" item. `+ collection-menu.test.ts`
- `src/renderer/src/library/collection-tile.tsx`, `gallery.tsx`, `app.tsx` — thread begin-rename.

---

## Task 1: Shared field validation core

**Files:**
- Create: `src/shared/forms/field.ts`
- Test: `src/shared/forms/field.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/forms/field.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateField, normalizeFieldValue, type FieldSpec } from './field'

const title: FieldSpec = {
  key: 'title',
  type: 'text',
  labelKey: 'x',
  required: true,
  maxLength: 5,
  trim: true
}

describe('normalizeFieldValue', () => {
  it('trims by default', () => expect(normalizeFieldValue(title, '  hi  ')).toBe('hi'))
  it('keeps whitespace when trim is false', () =>
    expect(normalizeFieldValue({ ...title, trim: false }, ' hi ')).toBe(' hi '))
})

describe('validateField', () => {
  it('passes a valid value', () => expect(validateField(title, 'abc')).toBeNull())
  it('flags required on empty or whitespace-only', () => {
    expect(validateField(title, '')).toBe('required')
    expect(validateField(title, '   ')).toBe('required')
  })
  it('flags tooLong only past maxLength, measured after trim', () => {
    expect(validateField(title, 'abcde')).toBeNull() // exactly 5
    expect(validateField(title, 'abcdef')).toBe('tooLong')
    expect(validateField(title, '  abcde  ')).toBeNull() // trims to 5
  })
  it('is valid when not required and empty', () =>
    expect(validateField({ ...title, required: false }, '')).toBeNull())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/forms/field.test.ts`
Expected: FAIL — cannot resolve `./field`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/forms/field.ts`:

```ts
// Pure, framework-free field schema + validation. Shared by the renderer form core and
// the main process (defense-in-depth). Returns error *codes*, not messages, so callers
// own i18n. Extend FieldType / FieldErrorCode as new field kinds appear.

export type FieldType = 'text'

export interface FieldSpec {
  key: string
  type: FieldType
  /** i18n key for the field's label (used by labelled form UIs). */
  labelKey: string
  required?: boolean
  maxLength?: number
  /** Trim surrounding whitespace before validating/normalizing. Defaults to true. */
  trim?: boolean
}

export type FieldErrorCode = 'required' | 'tooLong'

/** Normalize a raw input value per its spec (currently: optional trim). */
export function normalizeFieldValue(spec: FieldSpec, raw: string): string {
  return spec.trim === false ? raw : raw.trim()
}

/** Validate a raw value; returns the first failing rule's code, or null when valid. */
export function validateField(spec: FieldSpec, raw: string): FieldErrorCode | null {
  const value = normalizeFieldValue(spec, raw)
  if (spec.required && value.length === 0) return 'required'
  if (spec.maxLength != null && value.length > spec.maxLength) return 'tooLong'
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/forms/field.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/forms/field.ts src/shared/forms/field.test.ts
git commit -m "feat(forms): add shared field validation core"
```

---

## Task 2: Pure form-state core

**Files:**
- Create: `src/renderer/src/ui/form/form-state.ts`
- Test: `src/renderer/src/ui/form/form-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/ui/form/form-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initForm, setValue, validateAll, isDirty, firstError } from './form-state'
import type { FieldSpec } from '../../../../shared/forms/field'

const specs: FieldSpec[] = [
  { key: 'title', type: 'text', labelKey: 'x', required: true, maxLength: 5, trim: true }
]

describe('form-state', () => {
  it('initForm seeds values and clears errors; not dirty', () => {
    const s = initForm(specs, { title: 'Hi' })
    expect(s.values.title).toBe('Hi')
    expect(s.errors.title).toBeNull()
    expect(isDirty(s)).toBe(false)
  })
  it('setValue revalidates just that field and marks dirty', () => {
    let s = initForm(specs, { title: 'Hi' })
    s = setValue(s, 'title', '')
    expect(s.errors.title).toBe('required')
    expect(isDirty(s)).toBe(true)
  })
  it('isDirty compares normalized values (trimmed)', () => {
    let s = initForm(specs, { title: 'Hi' })
    s = setValue(s, 'title', '  Hi  ')
    expect(isDirty(s)).toBe(false)
  })
  it('validateAll + firstError surface the first failing rule', () => {
    let s = initForm(specs, { title: 'toolong' })
    s = validateAll(s)
    expect(firstError(s)).toBe('tooLong')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/ui/form/form-state.test.ts`
Expected: FAIL — cannot resolve `./form-state`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/ui/form/form-state.ts`:

```ts
import {
  validateField,
  normalizeFieldValue,
  type FieldSpec,
  type FieldErrorCode
} from '../../../../shared/forms/field'

export interface FormState {
  specs: FieldSpec[]
  values: Record<string, string>
  initial: Record<string, string>
  errors: Record<string, FieldErrorCode | null>
}

/** Build a fresh form state from specs + initial values (no validation run yet). */
export function initForm(specs: FieldSpec[], initial: Record<string, string>): FormState {
  const values: Record<string, string> = {}
  const errors: Record<string, FieldErrorCode | null> = {}
  for (const s of specs) {
    values[s.key] = initial[s.key] ?? ''
    errors[s.key] = null
  }
  return { specs, values, initial: { ...values }, errors }
}

const specFor = (s: FormState, key: string): FieldSpec | undefined =>
  s.specs.find((f) => f.key === key)

/** Set one field's value and re-validate just that field. */
export function setValue(s: FormState, key: string, raw: string): FormState {
  const spec = specFor(s, key)
  return {
    ...s,
    values: { ...s.values, [key]: raw },
    errors: { ...s.errors, [key]: spec ? validateField(spec, raw) : null }
  }
}

/** Validate every field; returns a new state with all errors populated. */
export function validateAll(s: FormState): FormState {
  const errors: Record<string, FieldErrorCode | null> = {}
  for (const spec of s.specs) errors[spec.key] = validateField(spec, s.values[spec.key] ?? '')
  return { ...s, errors }
}

/** True when any field's normalized value differs from its initial value. */
export function isDirty(s: FormState): boolean {
  return s.specs.some((spec) => {
    const now = normalizeFieldValue(spec, s.values[spec.key] ?? '')
    const was = normalizeFieldValue(spec, s.initial[spec.key] ?? '')
    return now !== was
  })
}

/** The first non-null error across fields (in spec order), or null. */
export function firstError(s: FormState): FieldErrorCode | null {
  for (const spec of s.specs) {
    const e = s.errors[spec.key]
    if (e) return e
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/ui/form/form-state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/ui/form/form-state.ts src/renderer/src/ui/form/form-state.test.ts
git commit -m "feat(forms): add pure form-state core"
```

---

## Task 3: useItemForm hook

**Files:**
- Create: `src/renderer/src/ui/form/use-item-form.ts`

No standalone test: this is a thin `useState` wrapper whose logic is fully covered by `form-state.test.ts` (Task 2) and whose render path is covered by `inline-edit.test.tsx` (Task 4). The repo's other hooks (`use-library`, `use-editor-transport`, `use-hover-preview`) are likewise untested directly, and there is no DOM/`@testing-library` in the toolchain.

- [ ] **Step 1: Write the hook**

Create `src/renderer/src/ui/form/use-item-form.ts`:

```ts
import { useCallback, useState } from 'react'
import type { FieldSpec } from '../../../../shared/forms/field'
import {
  initForm,
  setValue as setFieldValue,
  validateAll,
  isDirty as formIsDirty,
  firstError as formFirstError,
  type FormState
} from './form-state'

export interface ItemForm {
  values: Record<string, string>
  errors: FormState['errors']
  dirty: boolean
  submitting: boolean
  error: ReturnType<typeof formFirstError>
  setValue: (key: string, raw: string) => void
  submit: () => Promise<void>
  reset: (initial?: Record<string, string>) => void
}

/** Headless form state for editing an item's fields. UI-agnostic: an inline editor or a
 * modal can both drive it. `submit()` validates, then (only if valid AND dirty) awaits
 * `onSubmit` with the current raw values. */
export function useItemForm(opts: {
  specs: FieldSpec[]
  initial: Record<string, string>
  onSubmit: (values: Record<string, string>) => void | Promise<void>
}): ItemForm {
  const { specs, initial, onSubmit } = opts
  const [state, setState] = useState<FormState>(() => initForm(specs, initial))
  const [submitting, setSubmitting] = useState(false)

  const setValue = useCallback((key: string, raw: string) => {
    setState((s) => setFieldValue(s, key, raw))
  }, [])

  const reset = useCallback(
    (next?: Record<string, string>) => setState(initForm(specs, next ?? initial)),
    [specs, initial]
  )

  const submit = useCallback(async () => {
    const validated = validateAll(state)
    setState(validated)
    if (formFirstError(validated) || !formIsDirty(validated)) return
    setSubmitting(true)
    try {
      await onSubmit(validated.values)
    } finally {
      setSubmitting(false)
    }
  }, [state, onSubmit])

  return {
    values: state.values,
    errors: state.errors,
    dirty: formIsDirty(state),
    submitting,
    error: formFirstError(state),
    setValue,
    submit,
    reset
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/ui/form/use-item-form.ts
git commit -m "feat(forms): add useItemForm hook"
```

---

## Task 4: InlineEdit component

**Files:**
- Create: `src/renderer/src/ui/form/inline-edit.tsx`
- Test: `src/renderer/src/ui/form/inline-edit.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/ui/form/inline-edit.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../../i18n'
import { InlineEdit } from './inline-edit'
import type { FieldSpec } from '../../../../shared/forms/field'

const spec: FieldSpec = {
  key: 'title',
  type: 'text',
  labelKey: 'x',
  required: true,
  maxLength: 200,
  trim: true
}

describe('InlineEdit', () => {
  it('renders the value and an accessible edit affordance in display mode', () => {
    const html = renderToStaticMarkup(
      <InlineEdit value="Summer Mix" spec={spec} onSave={() => {}} ariaLabel="Rename" />
    )
    expect(html).toContain('Summer Mix')
    expect(html).toContain('aria-label="Rename"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/ui/form/inline-edit.test.tsx`
Expected: FAIL — cannot resolve `./inline-edit`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/src/ui/form/inline-edit.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import type { FieldSpec, FieldErrorCode } from '../../../../shared/forms/field'
import { useItemForm } from './use-item-form'

const ERROR_KEY: Record<FieldErrorCode, string> = {
  required: 'forms.error.required',
  tooLong: 'forms.error.tooLong'
}

/** Inline single-field editor: click the value to edit it; Enter/blur saves (only when
 * valid AND changed), Esc cancels. The first consumer of the editable-item form core; a
 * future modal can drive `useItemForm` the same way. Set `autoEdit` to open it from an
 * external command (e.g. a "Rename" context-menu item); call `onAutoEditDone` so the
 * caller can clear the one-shot intent. */
export function InlineEdit({
  value,
  spec,
  onSave,
  autoEdit = false,
  onAutoEditDone,
  displayClassName = '',
  inputClassName = '',
  ariaLabel
}: {
  value: string
  spec: FieldSpec
  onSave: (next: string) => void | Promise<void>
  autoEdit?: boolean
  onAutoEditDone?: () => void
  displayClassName?: string
  inputClassName?: string
  ariaLabel?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const key = spec.key
  const [editing, setEditing] = useState(false)
  const form = useItemForm({
    specs: [spec],
    initial: { [key]: value },
    onSubmit: async (vals) => {
      await onSave(vals[key])
      setEditing(false)
    }
  })

  const begin = (): void => {
    form.reset({ [key]: value })
    setEditing(true)
  }
  const cancel = (): void => {
    form.reset({ [key]: value })
    setEditing(false)
  }

  // One-shot external activation (e.g. a "Rename" command from a context menu).
  const armed = useRef(false)
  useEffect(() => {
    if (autoEdit && !armed.current) {
      armed.current = true
      begin()
      onAutoEditDone?.()
    } else if (!autoEdit) {
      armed.current = false
    }
    // begin/onAutoEditDone are stable enough for this one-shot trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={begin}
        aria-label={ariaLabel ?? t('library.rename')}
        className={'group/inline inline-flex max-w-full items-center gap-2 text-left ' + displayClassName}
      >
        <span className="truncate">{value}</span>
        <Pencil
          size={14}
          className="flex-none opacity-0 transition-opacity group-hover/inline:opacity-60"
        />
      </button>
    )
  }

  const err = form.error
  return (
    <span className="inline-flex flex-col gap-1">
      <input
        autoFocus
        value={form.values[key]}
        disabled={form.submitting}
        onChange={(e) => form.setValue(key, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (form.error) return
            if (form.dirty) void form.submit()
            else cancel()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        onBlur={() => {
          if (form.dirty && !form.error) void form.submit()
          else cancel()
        }}
        className={inputClassName}
      />
      {err && <span className="font-mono text-[10px] text-red-400">{t(ERROR_KEY[err])}</span>}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/ui/form/inline-edit.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Check diagnostics, then commit**

Run: `pnpm typecheck && pnpm lint`
Expected: typecheck PASS; lint may emit warnings only (no errors). Then:

```bash
git add src/renderer/src/ui/form/inline-edit.tsx src/renderer/src/ui/form/inline-edit.test.tsx
git commit -m "feat(forms): add InlineEdit component"
```

---

## Task 5: repo.renameCollection

**Files:**
- Modify: `src/main/library/repo.ts` (the `Repo` interface near line 91, the `stmt` map near line 119, the returned `repo` object near line 165)
- Test: `src/main/library/repo.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/main/library/repo.test.ts` inside the `describe('repo — basic CRUD & reads', …)` block (after the first test):

```ts
  it('renames a collection title', () => {
    const repo = freshRepo()
    repo.insertCollection({ id: 'c1', kind: 'album', title: 'Old', createdAt: 't' })
    repo.renameCollection('c1', 'New')
    expect(repo.getCollection('c1')?.title).toBe('New')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/library/repo.test.ts`
Expected: FAIL — `repo.renameCollection is not a function` / TS error.

- [ ] **Step 3: Implement**

In `src/main/library/repo.ts`, add to the `Repo` interface right after `listCollections: () => Collection[]`:

```ts
  renameCollection: (id: string, title: string) => RunResult
```

Add to the `stmt` object (after the `listCollections` prepare near line 123):

```ts
    renameCollection: db.prepare('UPDATE collections SET title=? WHERE id=?'),
```

Add to the returned `repo` object (right after the `listCollections:` line near line 171):

```ts
    renameCollection: (id: string, title: string) => stmt.renameCollection.run(title, id),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/library/repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/repo.ts src/main/library/repo.test.ts
git commit -m "feat(library): add repo.renameCollection"
```

---

## Task 6: service.renameCollection (validated, with activity)

**Files:**
- Modify: `src/shared/library.ts` (add the shared spec)
- Modify: `src/main/library/service.ts` (interface near line 32, imports near lines 6/9, method body)
- Test: `src/main/library/service.test.ts`

- [ ] **Step 1: Add the shared collection-title field spec**

In `src/shared/library.ts`, add at the top after the existing `import type { TrackTags } from './types'`:

```ts
import type { FieldSpec } from './forms/field'
```

And add at the end of the file:

```ts
/** Editable fields for a collection (first member: title). Shared by the inline editor
 * and the main-process service so validation rules match on both sides. */
export const COLLECTION_TITLE_FIELD: FieldSpec = {
  key: 'title',
  type: 'text',
  labelKey: 'library.collectionTitle',
  required: true,
  maxLength: 200,
  trim: true
}
```

- [ ] **Step 2: Write the failing test**

Append to `src/main/library/service.test.ts` inside the `describe('LibraryService', …)` block:

```ts
  it('renameCollection trims, persists, emits, and records a renamed activity', () => {
    const { service, repo, events } = svc()
    service.ingestJobResult('j1', done('a'))
    const id = service.listCollections()[0].id
    events.length = 0
    service.renameCollection(id, '  Fresh Name  ')
    expect(repo.getCollection(id)?.title).toBe('Fresh Name')
    expect(events).toContain('library:changed')
    expect(service.listActivity().some((e) => e.type === 'renamed')).toBe(true)
  })

  it('renameCollection ignores an empty or unchanged title', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const id = service.listCollections()[0].id
    const before = repo.getCollection(id)!.title
    service.renameCollection(id, '   ') // invalid → no-op
    service.renameCollection(id, before) // unchanged → no-op
    expect(repo.getCollection(id)?.title).toBe(before)
    expect(service.listActivity().some((e) => e.type === 'renamed')).toBe(false)
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/main/library/service.test.ts`
Expected: FAIL — `service.renameCollection is not a function` / TS error.

- [ ] **Step 4: Implement**

In `src/main/library/service.ts`:

Replace the existing `'../../shared/library'` import (currently `import type { CollectionView, TrackDetail, ActivityEvent } from '../../shared/library'`) with a single merged import that also brings in the spec as a value (avoids an `import/no-duplicates` lint error), and add the field-validation import:

```ts
import {
  COLLECTION_TITLE_FIELD,
  type CollectionView,
  type TrackDetail,
  type ActivityEvent
} from '../../shared/library'
import { normalizeFieldValue, validateField } from '../../shared/forms/field'
```

Add to the `LibraryService` interface (after `deleteCollection: (collectionId: string) => void`):

```ts
  renameCollection: (collectionId: string, title: string) => void
```

Add the method to the returned object (right after the `deleteCollection(...) { … }` block):

```ts
    renameCollection(collectionId: string, title: string): void {
      const c = repo.getCollection(collectionId)
      if (!c) return
      const next = normalizeFieldValue(COLLECTION_TITLE_FIELD, title)
      if (validateField(COLLECTION_TITLE_FIELD, title) || next === c.title) return
      repo.renameCollection(collectionId, next)
      repo.insertActivity({
        id: clock.idGen(),
        type: 'renamed',
        ts: clock.now(),
        collectionId,
        summary: `Renamed “${c.title}” → “${next}”`
      })
      emit('library:changed')
      emit('library:activityChanged')
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/main/library/service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/library.ts src/main/library/service.ts src/main/library/service.test.ts
git commit -m "feat(library): rename collections in the library service"
```

---

## Task 7: Expose renameCollection over IPC

**Files:**
- Modify: `src/main/index.ts` (near the other `library:rename*` handlers, ~line 386)
- Modify: `src/preload/index.ts` (near `deleteLibraryCollection`, ~line 133)

No unit test: IPC wiring mirrors existing `library:*` handlers and is covered by typecheck + the service tests.

- [ ] **Step 1: Add the main-process handler**

In `src/main/index.ts`, after the `ipcMain.handle('library:renameVersion', …)` block, add:

```ts
  ipcMain.handle('library:renameCollection', (_e, id: string, title: string) =>
    library.renameCollection(id, title)
  )
```

- [ ] **Step 2: Add the preload bridge method**

In `src/preload/index.ts`, after the `deleteLibraryCollection:` entry, add:

```ts
  renameLibraryCollection: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('library:renameCollection', id, title),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `PluckerApi` (= `typeof api`) now includes `renameLibraryCollection`.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(library): expose renameCollection over IPC"
```

---

## Task 8: i18n strings

**Files:**
- Modify: `src/renderer/src/i18n/locales/en.ts`
- Modify: `src/renderer/src/i18n/locales/de.ts`

`de.ts` is typed `typeof en`, so both files must gain identical keys or typecheck fails.

- [ ] **Step 1: Add keys to en.ts**

In `src/renderer/src/i18n/locales/en.ts`, extend the `common` block:

```ts
  common: {
    delete: 'Delete',
    back: 'Back',
    open: 'Open',
    save: 'Save',
    cancel: 'Cancel'
  },
```

Add `collectionTitle` inside the `library` block (e.g. right after the existing `rename: 'Rename',`):

```ts
    collectionTitle: 'Title',
```

Add a new top-level `forms` namespace immediately after the `common` block:

```ts
  forms: {
    error: {
      required: 'Required',
      tooLong: 'Too long'
    }
  },
```

- [ ] **Step 2: Add the matching keys to de.ts**

In `src/renderer/src/i18n/locales/de.ts`, extend `common`:

```ts
  common: {
    delete: 'Löschen',
    back: 'Zurück',
    open: 'Öffnen',
    save: 'Speichern',
    cancel: 'Abbrechen'
  },
```

Add inside `library` (after `rename: 'Umbenennen',`):

```ts
    collectionTitle: 'Titel',
```

Add after the `common` block:

```ts
  forms: {
    error: {
      required: 'Erforderlich',
      tooLong: 'Zu lang'
    }
  },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (en/de shapes match).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(i18n): add form-error and save/cancel strings"
```

---

## Task 9: Inline-edit the collection title in the hero

**Files:**
- Modify: `src/renderer/src/library/collection-view.tsx`
- Test: `src/renderer/src/library/collection-view.test.tsx`

- [ ] **Step 1: Update the test (add the new props; title must still render)**

In `src/renderer/src/library/collection-view.test.tsx`, add `onRename={noop}` to the rendered `<CollectionView … />` props (alongside the existing `onDelete={noop}`). The existing `expect(html).toContain('Road Trip')` assertion stays — `InlineEdit`'s display mode still renders the title text.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/library/collection-view.test.tsx`
Expected: FAIL — TS error: `onRename` is not a known prop yet.

- [ ] **Step 3: Implement**

In `src/renderer/src/library/collection-view.tsx`:

Add imports near the top (after the existing `Button` import):

```ts
import { InlineEdit } from '../ui/form/inline-edit'
import { COLLECTION_TITLE_FIELD } from '../../../shared/library'
```

Add two props to the component's destructured params and its type. Params list — add after `onRedownloadTrack`:

```ts
  onRename,
  autoBeginRename = false,
  onAutoRenameConsumed
```

Type block — add after `onRedownloadTrack: (url: string) => void`:

```ts
  onRename: (id: string, title: string) => void
  autoBeginRename?: boolean
  onAutoRenameConsumed?: () => void
```

Replace the hero title element:

```tsx
            <h2 className="my-1.5 truncate text-[30px] font-bold leading-none tracking-[-.5px] text-white">
              {collection.title}
            </h2>
```

with:

```tsx
            <InlineEdit
              value={collection.title}
              spec={COLLECTION_TITLE_FIELD}
              onSave={(title) => onRename(collection.id, title)}
              autoEdit={autoBeginRename}
              onAutoEditDone={onAutoRenameConsumed}
              ariaLabel={t('library.rename')}
              displayClassName="my-1.5 text-[30px] font-bold leading-none tracking-[-.5px] text-white"
              inputClassName="my-1.5 w-full rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[30px] font-bold leading-none tracking-[-.5px] text-white outline-none"
            />
```

- [ ] **Step 4: Run test + diagnostics**

Run: `pnpm test src/renderer/src/library/collection-view.test.tsx && pnpm typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/library/collection-view.tsx src/renderer/src/library/collection-view.test.tsx
git commit -m "feat(library): inline-edit a collection title in the hero"
```

---

## Task 10: Rename from the context menu (thread begin-edit end-to-end)

**Files:**
- Modify: `src/renderer/src/library/collection-menu.ts`
- Test: `src/renderer/src/library/collection-menu.test.ts`
- Modify: `src/renderer/src/library/collection-tile.tsx`
- Modify: `src/renderer/src/library/gallery.tsx`
- Modify: `src/renderer/src/app.tsx`

- [ ] **Step 1: Update the menu test (failing)**

In `src/renderer/src/library/collection-menu.test.ts`:

Add `onBeginRename: vi.fn()` to BOTH `collectionMenuItems({ … })` calls (it will be a required option).

Add a new test inside the `describe` block:

```ts
  it('includes a Rename item that fires its begin-rename handler', () => {
    const onBeginRename = vi.fn()
    const items = collectionMenuItems({
      t,
      onOpen: vi.fn(),
      onBeginRename,
      onRedownload: vi.fn(),
      onExportAll: vi.fn(),
      onDelete: vi.fn()
    })
    const rename = items.find((i) => i.label === 'library.rename')!
    expect(rename).toBeTruthy()
    rename.onClick!()
    expect(onBeginRename).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/library/collection-menu.test.ts`
Expected: FAIL — `onBeginRename` not in the options type / Rename item missing.

- [ ] **Step 3: Implement the menu item**

In `src/renderer/src/library/collection-menu.ts`, add `onBeginRename: () => void` to the `opts` type, and add the Rename item so the initial `items` array is:

```ts
  const items: MenuItem[] = [
    { label: t('common.open'), symbol: 'rectangle.stack', onClick: opts.onOpen },
    { label: t('library.rename'), symbol: 'pencil', onClick: opts.onBeginRename }
  ]
```

- [ ] **Step 4: Run the menu test**

Run: `pnpm test src/renderer/src/library/collection-menu.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the callback through the tile**

In `src/renderer/src/library/collection-tile.tsx`:

Add `onBeginRename: (id: string) => void` to the component's destructured props and its type (after `onRedownload`). Then in the `collectionMenuItems({ … })` call, add:

```ts
            onBeginRename: () => onBeginRename(collection.id),
```

- [ ] **Step 6: Thread through the gallery**

In `src/renderer/src/library/gallery.tsx`:

Add `onBeginRenameCollection` to the destructured props (after `onRedownloadCollection`) and to its type:

```ts
  onBeginRenameCollection: (id: string) => void
```

Pass it to `<CollectionTile … />`:

```tsx
              onBeginRename={onBeginRenameCollection}
```

- [ ] **Step 7: Wire app.tsx (state + both consumers)**

In `src/renderer/src/app.tsx`:

Add state near the other library UI state (e.g. by `openCollectionId`):

```ts
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null)
```

In the `<CollectionView … />` usage, add these props (alongside the existing `onDelete`/`onRedownloadTrack`):

```tsx
                  onRename={(id, title) => {
                    void window.plucker.renameLibraryCollection(id, title)
                  }}
                  autoBeginRename={renameTargetId === openCol.id}
                  onAutoRenameConsumed={() => setRenameTargetId(null)}
```

In the `<Gallery … />` usage, add:

```tsx
                  onBeginRenameCollection={(id) => {
                    setRenameTargetId(id)
                    setOpenCollectionId(id)
                  }}
```

> Note: the `CollectionView` branch condition is `openCol ? (…)`. Use `openCol.id` in `autoBeginRename` (it is non-null inside that branch). If the local is named differently, use the same variable the branch guards on.

- [ ] **Step 8: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all tests PASS; typecheck clean; lint warnings-only (no errors).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/library/collection-menu.ts src/renderer/src/library/collection-menu.test.ts src/renderer/src/library/collection-tile.tsx src/renderer/src/library/gallery.tsx src/renderer/src/app.tsx
git commit -m "feat(library): rename a collection from its context menu"
```

---

## Final verification

- [ ] Run `pnpm test` — all suites pass (expect ~13 new tests across field, form-state, inline-edit, repo, service, collection-menu).
- [ ] Run `pnpm typecheck` — clean.
- [ ] Run `pnpm lint` — no new errors (warnings only).
- [ ] Manual smoke (optional, `pnpm dev`): open a collection → click its title → edit → Enter saves; Esc reverts; emptying it shows the error and blocks save; right-click a gallery tile → Rename opens the collection with its title in edit mode.

---

## Self-review notes (addressed)

- **Spec coverage:** field core (T1), form-state (T2), useItemForm (T3), InlineEdit (T4), repo (T5), service + shared spec + `'renamed'` activity (T6), IPC/preload (T7), i18n incl. `forms.error.*` + `common.save/cancel` + `library.collectionTitle` (T8), collection-view wiring (T9), context-menu "Rename" + begin-edit threading (T10). All spec sections map to a task.
- **Refinement vs spec:** the spec's "begin-edit signal (nonce/imperative)" is implemented as a one-shot `autoEdit` boolean + `onAutoEditDone` consume callback driven by an app-level `renameTargetId`. This avoids the persisted-nonce ambiguity where reopening a collection for viewing would wrongly auto-open the editor.
- **Type consistency:** `FieldSpec`/`FieldErrorCode` (T1) used unchanged in T2–T4, T6, T9. `renameCollection` signature `(id, title)` consistent across repo (T5), service (T6), IPC/preload (T7). InlineEdit props (`value`, `spec`, `onSave`, `autoEdit`, `onAutoEditDone`, `displayClassName`, `inputClassName`, `ariaLabel`) used identically in T9. Menu option `onBeginRename` consistent across T10 menu/tile/gallery/app.
- **No placeholders:** every code step contains complete code.
