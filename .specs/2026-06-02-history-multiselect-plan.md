# History Track Multi-Select Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add track multi-select, keyboard delete, bulk actions, clear-vs-delete buttons, and tooltips to the History page.

**Architecture:** A pure `history-selection.ts` util holds the selection math (keys, ranges, click resolution, delete grouping, deletable predicate). `TrackRow` gains opt-in `selected` / `onSelect` / `onActivate` props. `HistoryView` owns the `selected` set + anchor, wires row clicks, a window keydown listener, bulk action handlers, and clear-vs-delete rendering.

**Tech Stack:** React, TypeScript, react-i18next, vitest + testing-library, lucide-react.

---

### Task 1: Selection util + tests

**Files:**
- Create: `src/renderer/src/history-selection.ts`
- Test: `src/renderer/src/history-selection.test.ts`

Functions: `trackKey(entryId,index)`, `parseTrackKey(key)`, `rangeBetween(ordered,anchor,key)`, `selectOnClick(current,anchor,ordered,key,{shift,meta})`, `targetsFor(selected,key)`, `groupForDelete(keys)`, `isDeletable(file,missing)`.

- [ ] Write `history-selection.test.ts` covering: key round-trip; range inclusive both directions; selectOnClick plain/meta-toggle/shift; targetsFor single vs multi; groupForDelete descending per entry; isDeletable.
- [ ] Run tests → fail (module missing).
- [ ] Implement `history-selection.ts`.
- [ ] Run tests → pass.
- [ ] Commit `feat(history): add track selection util`.

### Task 2: TrackRow selection props

**Files:**
- Modify: `src/renderer/src/track-row.tsx`
- Test: `src/renderer/src/track-row.test.tsx`

Add optional `selected?: boolean`, `onSelect?: (e: React.MouseEvent) => void`, `onActivate?: () => void`. `highlight` includes `selected`. When `onSelect` set: outer inner-row gets `onClick={onSelect}` + `onDoubleClick={onActivate}`; expand button + actions wrapper `stopPropagation`; title renders as a plain div (no reveal button).

- [ ] Add tests: selected → highlight class; onSelect fires on row click; onActivate on double-click; clicking an action button does not call onSelect.
- [ ] Run → fail.
- [ ] Implement props + wiring.
- [ ] Run → pass.
- [ ] Commit `feat(history): add opt-in selection to TrackRow`.

### Task 3: i18n `actions.clear`

**Files:** Modify `i18n/locales/en.ts` (`clear: 'Clear'`), `de.ts` (`clear: 'Entfernen'`).

- [ ] Add key to both locales. Commit with Task 4.

### Task 4: HistoryView selection + bulk + clear/delete + tooltips

**Files:** Modify `src/renderer/src/history-view.tsx`.

- `selected`/`anchor` state; prune `selected` on history change; `orderedKeys` from filtered.
- `onRowSelect(key,e)` via `selectOnClick`.
- `lookup(key)` → entry/track/index.
- `revealTargets`, `redownloadTargets` (navigate once, sequential `await startDownload`), `deleteTargets` (confirm once iff any deletable, `groupForDelete`, sequential `removeHistoryTrack`, clear selection).
- Window keydown: Delete/Backspace on non-input target with non-empty selection → `deleteTargets([...selected])`.
- Track rows: pass `selected`, `onSelect`, `onActivate`; route reveal/redownload/delete buttons + context menu through `targetsFor`. Delete button = Trash2/`actions.delete` when deletable else X/`actions.clear`. Wrap action buttons in `Tooltip`.
- Entry header: `deleteEntry(id,hasFiles)` file-gated confirm; delete icon Trash2/X by `entry.tracks.some(deletable)`; wrap icon buttons in `Tooltip`.

- [ ] Implement; run `pnpm typecheck`, `pnpm lint`, `pnpm test` → green.
- [ ] Commit `feat(history): multi-select tracks with bulk actions, clear button, tooltips`.

### Self-review
Spec coverage: selectable (T2/T4), keyboard delete (T4), bulk actions (T4), tooltips (T4), clear-vs-delete (T1 predicate + T4 render). No placeholders. Names consistent (`trackKey`, `targetsFor`, `groupForDelete`, `isDeletable`).
