# Plucker UI Redesign — Design Spec

_2026-06-01_

## Goal

Completely redesign Plucker's interface to be **stunning**, have **better UX**, and feel
**at home among native apps** — with a visual identity **heavily inspired by pro audio
software / DAWs (Traktor Pro 4 first, then Studio One / FL Studio)**, executed tastefully
rather than as a parody.

Priority, per the user: aesthetics, native-grade UX, and flow are co-primary. The DAW
identity is the chosen _visual language_ — dense, instrument-like, precise — but kept
flat and modern, never cheesy or skeuomorphic-overload.

### What "native" means here

Native-grade **UX**, **not** native **looks**. We do **not** clone macOS chrome, system
controls, vibrancy, or stock components — that reads as a cheap knock-off. We take from
native only the _behavior_: instant feedback, real keyboard shortcuts, drag-and-drop,
correct focus handling, no web-page jank, fast and tactile. The visual identity is
entirely our own.

## Visual references (approved mockups)

Self-contained HTML mockups live in `.specs/redesign/mockups/`. These are the source of
truth for layout, spacing, color, and component structure. The plan and implementation
must match them.

- `download.html` — Download view (tabs, command bar, track browser, transport deck)
- `history.html` — History view (job cards reusing the track item)
- `settings.html` — Settings view (preferences rack + transform chain)

## Design language

### Theme

- **Always dark, single curated "studio" theme.** No light mode, no system-appearance
  switching. One designed-down-to-the-pixel surface.
- **Flat, not skeuomorphic.** Panels are separated by hairline keylines and subtle
  background steps — no heavy bevels, no glow, no faux metal. Studio One restraint with a
  Traktor layout sensibility.

### Color tokens (CSS variables)

```
--bg:        #0d0e11   /* app background        */
--panel:     #15171b   /* toolbar / deck / headers */
--panel-2:   #101216   /* recessed panel bodies */
--raise:     #1c1f24   /* buttons / hover        */
--line:      #23262c   /* primary keyline        */
--line-2:    #1a1d22   /* row dividers           */
--tx:        #c9ced6   /* primary text           */
--tx-dim:    #7c838f   /* secondary text         */
--tx-faint:  #4b515b   /* labels / placeholders  */
--grn:       #3fc97f   /* success / done         */
--red:       #ff5b52   /* error / cancel / destructive */
--amber:     #e8a23a   /* warning / partial      */
--accent:    <runtime> /* system accent — see below */
--accent-dim: rgba(accent, .16)
```

### System accent color (signature behavior)

The primary accent is **the user's OS accent color**, not a hardcoded brand color — a
deliberate native-UX touch.

- Read once in the **main process** via Electron `systemPreferences.getAccentColor()`
  (returns an RGBA hex string; supported on macOS + Windows).
- Expose it across the preload bridge (e.g. `window.plucker.getAccentColor()`), and have
  the renderer set `--accent` (and derive `--accent-dim`) as CSS variables on the root.
- **Extract this behind a small platform util** (e.g. `getAccentColor()` in the main
  process) so Windows/Linux can plug in later. Linux has no API → fall back to a sensible
  default (the macOS blue `#0a84ff` used in the mockups).
- Subscribe to accent-change events where available so the UI updates live.

### Typography

- **UI / body:** `Geist`
- **Readouts, labels, numerics, counters:** `Geist Mono` (tabular figures)
- No display/segment "LED" fonts (rejected as cheesy). The mono's tabular figures cover
  counters and meters tastefully.
- Fonts must be **bundled** (e.g. `@fontsource/geist` + `@fontsource/geist-mono`), not
  loaded from a CDN — this is an offline desktop app.

### Icons

- **Lucide** (`lucide-react`). Flat, consistent stroke. **No emojis anywhere** — all
  current emoji glyphs (🎵 ⚙︎ ♪ ⬇ ✓ ▲ ▼ ✕ 🗑 ↻ …) are replaced with Lucide icons.

## Layout & navigation

- **Frameless-feeling single window**, our own chrome (the mockups show macOS traffic
  lights inset top-left as a placeholder for the real window controls).
- **Top toolbar** holds: wordmark `PLUCKER` (with accent `U`), a divider, **labeled tabs**
  (`Download`, `History`), a flexible spacer, a small **THRUPUT** activity meter, and a
  **Settings** icon button on the right.
  - Decision: navigation is **labeled tabs in the toolbar** (the earlier side-rail idea
    was dropped at the user's request).
  - Tab style: soft accent-filled pills with icon + label.
- **Persistent transport deck** pinned to the bottom — the signature DAW element. It is
  the **active-job status bar**, _not_ a media transport (no playback yet). It shows: the
  now-plucking track's cover + name + subtitle, a segmented **JOB PROGRESS** meter, a
  `done/total` counter, and a **Cancel** (×) button.
  - The deck is **contextual**: visible only while a job is running; hidden when idle
    (e.g. History with no active job).

## Components

### Track item (shared, expandable)

One component used by **both** the Download browser and History — this is an explicit
requirement.

- Collapsed row: disclosure **chevron**, index (`01`, mono), cover thumbnail (Lucide music
  glyph placeholder, real cover lazy-loaded), title + `artist · album · year` subtitle,
  and a context-dependent trailing region.
- **Trailing region varies by context:**
  - Download: a **segmented progress meter** + status (`64%` / `DONE` / `QUEUED`).
    Active row gets an accent tint + left accent stripe. **No faux waveform** — honest
    segmented meter (rejected the waveform-as-progress idea since audio isn't analyzed).
  - History: track **duration** (mono) + hover row-actions (Reveal, Re-pluck, Delete).
- **Expandable detail panel** (click chevron): a labeled `key → value` grid
  (Source / Format / Size / Destination or File), the applied transform chain as chips,
  and per-track actions. Designed as the home for **future data/views**.
- Failed track state: red × cover, red subtitle reason, Retry action (shown in History
  mock, job 2).

### Track browser (Download view)

- A `#` / `TRACK` / `PROGRESS` / `STATUS` column header strip (mono, uppercase, faint).
- Rows = the shared track item. ~48px row height.

### Command bar (Download view)

- Recessed URL field (mono) with a live accent status dot, resolving to the detected
  playlist title; a solid-accent **PLUCK** button with a download icon.

### History view

- Optional **search** field at the top.
- **Job cards** (DAW "group" panels): header with cover, title, `date · N tracks · size`
  meta, a status badge (`COMPLETE` green / `N FAILED` amber), and actions
  (Open folder, Re-pluck, Delete). Body = a list of the shared track items.

### Settings view (full page)

- Full-page **preferences rack**; each section is a panel with a mono uppercase header +
  Lucide glyph, and rows of `label + description ⟶ control`.
- Sticky **save bar** at the bottom (Cancel / Save changes).
- Sections map 1:1 to the existing settings surface:
  - **General** — Language (System / English / Deutsch)
  - **Downloads** — library folder (path + Choose…), per-playlist subfolder (toggle)
  - **Audio** — preferred bitrate (segmented 320/256/192/128), minimum quality
    (Off/64/96/128/160 select)
  - **Network & Cookies** — cookie source select (auto/none/chrome/edge/safari/firefox/brave)
  - **Transform Chain** — see below
  - **Performance** — parallel downloads stepper (1–16)
  - **Updates** — check-on-launch toggle (+ shows current version)
- Controls: styled selects, segmented control, toggle switches, path field, `− N +`
  stepper — all themed.

### Transform chain (the centerpiece)

Rendered as a DAW **insert/effects rack**. Preserves all current capability of
`TransformsSection` + `SchemaForm`:

- Ordered list of **module strips**; header note "runs top → bottom on every track".
- Each module: **drag grip** (reorder), index, **enable switch**, name, reorder ↑↓,
  **expand-to-configure**, **remove ×**. Disabled modules are dimmed.
- Expanded config is **schema-driven** (the existing `ConfigField` types: boolean / number
  / enum / text) laid out in the rack panel.
- Dashed **ADD TRANSFORM** slot at the bottom; respects catalog availability rules
  (`canAdd`).
- Drag-to-reorder is a UX upgrade over the current ▲/▼ buttons (keep keyboard/▲▼ as a
  fallback for accessibility).

## Scope & file impact

This is a renderer-layer redesign plus one small main-process addition. Expected touch
points (final list determined in the plan):

- **Main process:** new accent-color util + IPC; subscribe to accent changes.
- **Preload:** expose `getAccentColor()` (+ change subscription) on `window.plucker`.
- **Renderer:** theme tokens & font/icon setup in `index.css` + a theme bootstrap;
  rewrite of `app.tsx` (tabs + deck shell), `header.tsx` → toolbar, `download-view.tsx`,
  `history-view.tsx`, `track-row.tsx` (shared expandable item), `settings-panel.tsx`
  (full-page rack), `transforms-section.tsx` (insert rack), `schema-form.tsx` (themed
  fields). Add a `transport-deck` component and small primitives (Switch, Segmented,
  Stepper, Panel, Icon wrapper).
- **Deps:** `lucide-react`, `@fontsource/geist`, `@fontsource/geist-mono`.
- **i18n:** reuse existing keys; add any new labels (e.g. THRUPUT, column headers) to
  `en`/`de`.

### Non-goals

- No audio playback (and therefore no media-transport controls).
- No light mode / system-appearance theming.
- No change to download/transform engine behavior, settings schema, or persistence.
- Windows/Linux accent-color sourcing is stubbed behind the util, not implemented now.

## Open / deferred decisions

- **THRUPUT meter** in the toolbar: kept as a subtle aggregate-activity indicator; can be
  cut during build if it reads as decoration.
- Exact window-control treatment (custom vs standard frame) to be confirmed in the plan.
