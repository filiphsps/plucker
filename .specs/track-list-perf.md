# Track list performance & re-render correctness

## Problem

`TrackRow` is rendered in lists by `download-view`, `history-view`, and `cache-view`.
Two issues:

1. **Wasteful re-renders.** `TrackRow` is not memoized, so any parent state change
   re-renders every row. The hot path is `download-view`: `progress` updates many
   times per second during a download, and each tick produces a brand-new
   `progress.tracks` array of brand-new track objects, so all rows re-render even
   though only the active track changed. `history-view` re-renders all rows on every
   selection click and every history refresh.

2. **Lost local state / redundant recompute.** `history-view` keyed rows with
   `key={tk.file || i}`. When a track's `file` appears or changes (download finishes,
   re-download, re-transform), the key flips and React unmounts + remounts the row.
   That throws away the row's local state (`open`, `cover`, `fetched`, `waveform`)
   and forces cover/metadata/waveform to be re-fetched.

## Fix

### 1. Memoize `TrackRow`
Wrap the component in `React.memo` with a custom comparator (`track-row-equal.ts`,
unit-tested). The comparator compares the **data** props by value — `variant`,
`index`, the flags, every rendered `track` field, and `source` fields — so the
identical-but-newly-allocated objects that IPC hands us each tick no longer force a
re-render. Handler props (`onSelect`, `onContextMenu`, …) and `actions` are compared
only by **presence** (truthiness), because their presence affects render output but
their identity is recreated every parent render. `meta` is compared by reference
(callers keep it stable).

### 2. Stable keys
History rows key on a stable per-track identity that survives file/status changes
and keeps identity across deletions: `videoId ?? hash ?? entryId#index`
(`trackRowKey` in `history-selection.ts`). Download (`tr.index`) and cache
(`it.hash`) keys are already stable.

### 3. Safe handler identity
Because the comparator ignores handler identity, a memoized row may keep an older
handler closure. `history-view` routes the handlers that read changing state
(`selected`, `anchor`, `orderedKeys`, `history`, `missing`) through refs so a stale
closure still acts on current state — notably `onRowSelect`, whose stale `anchor`
would otherwise break shift-range selection.

### 4. Stable cache row props
`cache-view` builds each row's `track`/`meta`/`source` objects via a `useMemo` map
keyed by hash so typing in the search box no longer re-renders every row.
