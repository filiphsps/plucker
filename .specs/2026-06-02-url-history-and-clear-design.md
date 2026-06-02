# Download page: clear action, input lock & URL history

**Date:** 2026-06-02
**Status:** Approved

## Goal

Improve the download page command bar with three related behaviors:

1. **Clear the page** when no download is active — via an explicit affordance and
   by emptying the URL input.
2. **Lock the input + submit button** while tracks are resolving, downloading, or
   transforming; unlock when the job is no longer active.
3. **URL history + suggestions** — persist past valid URLs, surface them as a
   suggestions dropdown under the input, and allow deleting individual entries.

## Data model & persistence

Add one additive field to `Settings` (`src/shared/types.ts`):

```ts
urlHistory: string[] // most-recent-first, deduped, no cap
```

- `src/shared/defaults.ts` → `urlHistory: []`.
- `mergeDefaults` in `src/main/settings.ts` → `urlHistory: Array.isArray(p.urlHistory) ? p.urlHistory : []`.
- No `version` bump: additive, defaults cover old configs.

### Shared utilities (unit-tested, per CLAUDE.md)

- `src/shared/url-providers.ts` — extensible **provider registry**. One entry now
  (YouTube: `youtube.com`, `music.youtube.com`, `youtu.be`, including playlist
  URLs). Exposes `isSupportedUrl(url: string): boolean`. Future suppliers are added
  as new registry entries with no other changes.
- `src/shared/url-history.ts` — pure helpers:
  - `addUrl(list: string[], url: string): string[]` — dedupe + move-to-top, no cap.
  - `removeUrl(list: string[], url: string): string[]`.

### IPC (mirrors the existing `history:*` pattern)

In `src/main/index.ts` + `src/preload/index.ts`:

- `urlHistory:add(url)` → load settings, apply `addUrl`, save, broadcast
  `settings:changed`, return new list.
- `urlHistory:remove(url)` → same with `removeUrl`.
- Reads piggyback on the existing `getSettings()` (urlHistory is part of `Settings`).

## Input lock

`download-view.tsx` computes a `locked` boolean from props it already receives:

- **Resolving:** `statusLog !== null && progress === null` → locked.
- **Active tracks:** `progress` has any track with status `queued | downloading |
  transforming` → locked.
- Otherwise unlocked (including when all tracks finished/failed/skipped/cancelled).

While locked: `<input>` is `disabled`, submit button disabled (replaces the current
`busy`-only disable, which doesn't cover the live download phase), suggestions
suppressed.

## Invalid-input state

The command bar reflects URL validity live:

- **Empty** (trimmed) → neutral; submit disabled, no error styling.
- **Non-empty + `isSupportedUrl` false** → invalid: the leading status dot and the
  input border use an error/danger color, and the submit button is disabled.
- **Non-empty + `isSupportedUrl` true** → normal accent styling; submit enabled.

Invalid styling is suppressed while `locked` (a running job owns the bar). This uses
the same `isSupportedUrl` check that gates history writes, so validity is defined in
one place (the provider registry).

## Clearing the page

"Clear" resets the page to the empty state. `progress`, `statusLog`, and
`jobLogStart` live in `app.tsx`, so add an `onClear` callback prop (alongside
`onStart`/`onRunningChange`) that resets them; download-view clears its local `url`.

Three triggers, all **only when unlocked**:

1. **× button** in the command bar — shown only when there is something to clear
   (input has text, or `progress`/`statusLog` present) and not locked.
2. **Context menu** — a "Clear" item added to the download view's right-click menu.
3. **Emptying the input** — when `url` becomes empty via editing and unlocked.

## Suggestions dropdown

New focused component `src/renderer/src/ui/url-suggestions.tsx` under the input:

- Opens on focus (recent history) and filters by case-insensitive substring while
  typing; hidden when locked or when there are no matches.
- Each row: URL + an **× delete** button → `urlHistory:remove`.
- Click a row → fills the input (no auto-submit).
- Keyboard: ↑/↓ move, Enter selects highlighted (else submits), Esc closes.
  Click-outside closes.

## Writing to history

A URL is committed via `urlHistory:add` when `isSupportedUrl(url.trim())` is true
and either:

- the input **loses focus** (blur), or
- **Enter/submit** is hit (committed inside `start()`).

Blur commits even without downloading (pasting a valid URL and clicking away saves
it). `app.tsx` holds `urlHistory` state, seeded from `getSettings()` and updated via
the `onSettingsChanged` broadcast, passed to `download-view` → `url-suggestions`.

## Testing

- `url-providers.test.ts` — YouTube match/non-match, playlist URLs, malformed input.
- `url-history.test.ts` — dedupe, move-to-top, remove, no-cap.
- Extend `settings.test.ts` with an `urlHistory` merge assertion.
- Manual: lock during download, clear via all three triggers, suggestion
  filtering/selection/deletion, blur-commit.

## Out of scope

- Auto-submitting on suggestion click.
- Capping or expiring history.
- Non-YouTube providers (registry is ready for them; none added yet).
