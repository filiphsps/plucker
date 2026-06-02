# History page: track multi-select, bulk actions, clear vs delete, tooltips

Date: 2026-06-02

## Goal

Make the History page's track list directly manipulable:

1. Track rows are **selectable / multi-selectable**.
2. With one or more tracks selected, pressing **Delete/Backspace** deletes (or
   clears) them.
3. With multiple tracks selected, clicking an **action button** (reveal,
   redownload, delete/clear) on any selected row applies that action to the
   whole selection.
4. The History entry-header buttons and track-row action buttons get **styled
   tooltips** (reusing the existing `Tooltip` component).
5. The delete action renders as a **"clear" (X)** button — not a trash/delete —
   when the target has nothing on disk to remove (failed / cancelled / skipped /
   missing file). This applies at both the track level and the entry level.

Scope is the History page only. Download and Cache views are unchanged except
for the shared `TrackRow` gaining opt-in selection props (inert when unused).

## Definitions

- **Track key**: stable id for a track within the rendered list,
  `` `${entryId}#${index}` `` where `index` is the track's position in its
  entry. Used as the selection-set member and shift-range ordering token.
- **Deletable file**: a track has one when `!!track.file && !missing`. Only such
  tracks trigger the destructive confirm; everything else is a no-op "clear".

## State (HistoryView)

- `selected: Set<string>` — selected track keys.
- `anchor: string | null` — anchor for shift-range selection.
- `orderedKeys: string[]` — memoized flat list of every track key in **rendered
  (filtered) order**, used to compute shift ranges.

Selection is cleared when it would dangle: after a delete, and whenever
`history` changes from outside (the `history:changed` subscription already
re-fetches; we prune `selected` to keys that still exist).

## Selection interactions

A click on a track row body selects:

- **Plain click** → selection becomes `{key}`; anchor = key.
- **Cmd/Ctrl+click** → toggle `key` in the set; anchor = key.
- **Shift+click** → selection becomes the inclusive range between `anchor` and
  `key` in `orderedKeys` (if no anchor, behaves like a plain click).

The expand chevron and the trailing action buttons `stopPropagation` so they
never change the selection. Double-clicking a row reveals its file (preserves
the old click-to-reveal affordance, which selection now occupies).

### Keyboard

A `keydown` listener on `window` (added while the view is mounted):

- Ignored when the event target is an `input`/`textarea`/contenteditable (so the
  search box's Backspace still edits text), or when `selected` is empty.
- `Delete` or `Backspace` → run the bulk delete/clear over `selected`.

## Bulk actions

Helper `targetsFor(key)`: if `selected.has(key) && selected.size > 1` return all
selected keys, else return `[key]`. So an action on a non-selected row affects
only that row; an action on a member of a multi-selection affects the whole
selection.

- **Reveal**: `revealFile` for each target that has a file.
- **Redownload**: navigate to the Download view once, then `await
  startDownload(watchUrl(videoId), folder)` **sequentially** for each target
  with a `videoId`. Sequential because the main process runs one job at a time
  (`job:start` resolves when the job finishes), so awaiting each avoids racing
  the shared abort controller / progress channel.
- **Delete/Clear**: confirm **once** iff any target has a deletable file. Then
  remove each target. Removals are grouped by entry and applied in **descending
  index order within each entry** (so earlier indices stay valid as later ones
  are removed), awaiting each `removeHistoryTrack` call. Clear `selected`
  afterward.

## Clear vs delete rendering

A small pure helper decides the trailing-button mode from the target's deletable
state:

- has deletable file → `Trash2` icon, `actions.delete` tooltip, `hover:text-bad`.
- otherwise → `X` icon, `actions.clear` tooltip, neutral hover.

Track-row level uses the per-track deletable state. Entry-header level uses
`entry.tracks.some(deletable)` (an entry whose files are all absent/failed shows
"clear"). Both still call the same delete/remove handlers — the difference is
purely icon + tooltip + the confirm gate (already file-gated).

## TrackRow changes (shared component)

Add three optional props, all inert when omitted (Download/Cache unaffected):

- `selected?: boolean` — applies the existing accent highlight
  (`bg-accent-dim` + inset accent bar).
- `onSelect?: (e: React.MouseEvent) => void` — row-body click handler. When
  provided, the title region stops acting as a reveal button and the click
  bubbles to selection; reveal moves to the Folder action button + double-click.
- `onActivate?: () => void` — double-click handler (reveal).

Implementation: the outer row container gets `onClick={onSelect}` /
`onDoubleClick={onActivate}` when `onSelect` is set; the expand button and the
`actions` slot `stopPropagation`. When `onSelect` is set, the title is a plain
non-button element (no per-element reveal handler).

## i18n

Add `actions.clear`: EN `'Clear'`, DE `'Entfernen'`. Tooltips otherwise reuse
existing keys: `actions.openFolder`, `actions.reveal`, `actions.redownload`,
`actions.delete`.

## Testing

- `track-row.test.tsx`: selection highlight renders for `selected`; `onSelect`
  fires on row click with modifier flags; `onActivate` fires on double-click;
  action buttons don't trigger `onSelect`.
- New `history-selection.ts` pure util (range + targets + descending-delete
  grouping + deletable predicate) with `history-selection.test.ts` — keeps the
  selection math out of the component and unit-testable, per project convention.
- Existing `history-card-menu` / `track-row-menu` tests stay green.

## Out of scope

- Selection on Download/Cache views.
- A "select all" affordance or selection count chrome (can follow later).
- Backend job queueing changes (bulk redownload uses existing sequential model).
