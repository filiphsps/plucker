# Library Page — UI / Visual Design

**Date:** 2026-06-03
**Status:** Draft (awaiting user review)
**Companion to:** `.specs/2026-06-02-library-editor-model-design.md` (the model) and
`.specs/2026-06-02-library-editor-model-plan.md` (the build). Those specs explicitly
**deferred the visual layout** of the Library/editor "to a separate UI design pass"
(§8, §15, non-goals). **This is that pass.**

**Scope:** the *visual* layer for the already-implemented Library/Editor model. The
data model, store, IPC, and bare React components (`src/renderer/src/library/*`) exist
and work; they are unstyled `<ul>/<li>/<button>` skeletons. This document specifies how
those surfaces should look and behave, plus **one net-new feature** (hover **audio
preview**) that the model did not anticipate and that needs a small main-process
addition. It does **not** change the storage/version/branch model.

Interactive mockups produced during design persist under
`.superpowers/brainstorm/13600-1780446128/content/` (gallery, hover/waveform/audio,
collection page, version-graph iterations, full editor v1–v5).

---

## 1. Design language (what we build on)

The Library must feel native to Plucker's existing surfaces (Download view, Job Rail,
Console, Settings). Tokens are already defined in `src/renderer/src/index.css` (`@theme`)
and must be reused — **no new palette**:

- **Type:** Geist (sans) + Geist Mono. Mono is used for all micro-labels, counts,
  timestamps, technical values.
- **Surfaces (dark only):** `surface #0d0e11`, `panel #15171b`, `panel2 #101216`,
  `raise #1c1f24`; lines `#23262c` / `#1a1d22`.
- **Ink:** `#c9ced6` / dim `#7c838f` / faint `#4b515b`.
- **Accent:** **dynamic OS accent** (`--color-accent`, default Apple blue `#0a84ff`) +
  `--color-accent-dim`. Lighter companion `#4aa3ff` used for waveform gradients.
- **Semantic:** ok `#3fc97f`, bad `#ff5b52`, warn `#e8a23a`.
- **Icons:** `lucide-react`. **Primitives to reuse:** `ui/panel.tsx` (mono-uppercase
  letter-spaced section headers), `ui/page.tsx` (frozen routes), `ui/segmented.tsx`,
  `ui/tooltip.tsx`, `ui/meta/*` (`MetaStrip`, `MetaGrid`, `MetaField`, `WaveformStrip`),
  `track-row.tsx` density conventions.

**Signature motifs reused everywhere in the Library:** the mono-uppercase tracked label
(`text-[9px] tracking-[1px] text-ink-faint`), `h-12`-ish dense rows with 32–34px cover
art + mono `00` index, accent-dim selection with an inset accent bar, and — new for the
Library — **the waveform as a first-class visual element** (covers, cards, rows all
speak in waveforms).

---

## 2. Information architecture & navigation

The Library becomes the app's **primary, centerpiece surface** (design ambition:
*elevate*). Overall pattern (chosen over master-detail and three-pane consoles): a
**cover-forward gallery that drills into an editor** ("Gallery → Editor").

- **Nav rename:** the header tab currently labeled **History** (`nav.history`, clock
  icon) becomes **Library**. Implementation note: `View = 'download' | 'history'` and the
  `app.tsx` `view === 'history'` branch are kept as the internal id for now to minimize
  churn, but the **label + icon** change (`nav.library`, a `Library`/`LibraryBig` lucide
  icon). (Optional follow-up: rename the `View` union to `'library'`.)
- **Three nested views** under the Library tab, mounted where `library-page` is today:
  1. **Gallery** — grid of collections (the landing).
  2. **Collection page** — one collection's hero + track list.
  3. **Track editor** — one track's player + version graph.
- **Activity log** — a read-only timeline, presented as a **bottom dock** that collapses
  to a single most-recent line and expands upward (replaces the always-rendered
  side-by-side `ActivityLog`).
- **Job Rail / Transport / Console / Status bar** — unchanged chrome; the Library lives
  inside them exactly like the Download view does.

Back-navigation: Collection → Gallery via a breadcrumb; Editor → Collection via the
title eyebrow (see §5).

---

## 3. Gallery (collections grid) — the landing

**Tile treatment: "Cinematic overlay" (T1).** Square tiles; the cover fills the tile;
title + `KIND · COUNT` float on a bottom gradient scrim. Collections have no cover of
their own, so:

- **Playlist** → a **2×2 mosaic** of its first four tracks' covers.
- **Album / Single** → a single cover (the album art / the track's cover).
- Missing art → the existing gradient + `Music` glyph fallback.

**Layout:** responsive grid, `repeat(auto-fill, minmax(~168px, 1fr))`, ~15px gap, inside
an 18px-padded scroll area.

**Page toolbar (above the grid):** a live **search** field (left) and a **sort**
`Segmented` control (right) — `Recent · A–Z · Kind`. A mono count sits between
(`8 collections · 47 tracks`). "Kind" sort inserts mono section headers (Playlists /
Albums / Singles). Default sort: **Recent**.

**Hover (the signature moment):** see §4 — the cover fades toward black and the
collection's waveform takes over, with audio preview. On hover the tile also lifts
(`translateY(-3px)` + shadow), and **Export** + **Delete** chips fade in top-right
(frosted, icon-only). **Click** a tile → opens the collection. **Right-click** → native
context menu (Export, Delete, Reveal source).

**Empty state:** centered, soft `Library` glyph, headline (`Your library is empty`) +
sub, and a primary button that navigates to the Download view. **Loading:** shimmer
skeleton tiles.

---

## 4. Hover preview — waveform + live audio (NEW FEATURE)

This is the Library's defining interaction and a **new feature beyond the model spec**.
On hover, a collection tile (and, smaller, a track row) **plays a snippet of the actual
audio while the track's real waveform scrolls in time with playback.**

**Visual** (locked as "A · mirror scroll, no playhead"):

1. Cover fades to near-black (`opacity .07`, `~0.7s`).
2. A **vertically-centered, symmetric** waveform of the audio **blooms in** (staggered
   bar `scaleY`) then **scrolls** horizontally, **synced to `audio.currentTime`**.
3. Soft mask fades the waveform at the left/right edges. **No center playhead line.**
4. Accent gradient bars (`#4aa3ff`→`#0a84ff`), subtle glow.

**Audio behavior (locked):**

- **On by default**, disabled via **`Settings → Audio previews`** (no toolbar mute).
- **~220 ms hover-intent** delay before sound; **one preview at a time** (new hover
  stops the prior); **gentle eased fades** — in ~850 ms / out ~650 ms (smooth S-curve).
- A small **now-playing dot** pulses while live.
- **Reduced-motion / previews-off** → silent **static** bloomed waveform (no scroll, no
  audio).
- The waveform shown is the version's real peaks (we already compute these via
  `getWaveform`). The played audio is the **collection's first track's current version**
  (tile) or **that track's current version** (row).
- Snippet: a short window (e.g. start a few seconds in, loop ~16 s). Exact window is a
  tunable; not a remembered position.

**Implementation requirements (new, main + renderer):**

- **Audio delivery:** register a privileged custom scheme **`plucker-audio://<hash>`** in
  main that streams a blob from `~/.plucker/blobs/` (range-request capable). Keeps file
  paths out of the renderer and works with a renderer `<audio>` / Web Audio element.
  (Do **not** set `crossOrigin` on the player element — plain media playback needs no
  CORS; that bug surfaced during prototyping.)
- **Settings:** add `audioPreviews: boolean` (default `true`) to settings; gate previews
  on it.
- **Renderer:** one **shared preview player** module (single active source, hover-intent
  timer, eased gain, rAF scroll synced to `currentTime`). Reused by gallery tiles and
  track rows.
- Waveform source for a *collection* tile: first track's current-version peaks (a blended
  "collection signature" is a possible later upgrade — **open question**).

---

## 5. Collection page

Opens when a gallery tile is clicked.

- **Hero (cinematic):** the cover, **blurred + darkened** as a full-width backdrop, with
  the **sharp art** (2×2 mosaic for playlists) in front; `KIND` eyebrow, large title,
  and a mono meta line (`12 tracks · 47 min · youtube.com · added Jun 1`). Actions:
  **Export all** (primary) and **Delete** (default). `‹ Library` back affordance
  top-left.
- **Track list:** Plucker's dense row idiom (reuse `track-row` conventions) — expand
  chevron, mono index, 32px cover, title + artist, duration, hover actions
  (open-editor / export / delete). Columns: `# · Title · Versions · Time`.
- **Version/branch chips:** rows whose track has history show a mono `v3` chip or a green
  `⑂ <branch>` chip + a `"N versions / N branches"` note — so edited tracks are spottable
  before opening the editor.
- **Row hover = audio preview:** same engine as the gallery (§4); the artist line is
  replaced by a **mini synced-scrolling waveform** + a green live dot **only while
  playing**. Click a row → editor.

---

## 6. Track editor

Opens when a track row is clicked. One unified header — **no duplicated title, no
separate breadcrumb bar.**

- **Header / player (single block):**
  - Cover (90px).
  - A **breadcrumb eyebrow** (`‹ Road Trip`, mono, clickable → back to collection) above
    the **title** (shown once), above one **identity line** (`Gunship · Unicorn · 2024 ·
    3:48`).
  - **Transport:** flat-accent circular play button + the **full-track waveform** with a
    played-portion (accent) and a **playhead**, + mono `1:26 / 3:48`. This is the real
    player/scrubber (distinct from the gallery's scrolling teaser).
  - **Right column:** the **branch switcher** pill (`main ▾`) and a quiet version
    indicator (`showing + EQ shelf · current`). The player loads whichever version is
    selected in the graph (current by default).
- **Version graph (middle):** see §7.
- **Metadata drawer:** a quiet **pull-tab on the seam** between player and graph (not a
  button). Clicking folds the **reused `TrackDetail` visualizer down *over* the graph**
  (overlay; the graph keeps its height behind a dim scrim) — **audio-spec strip + tag
  grid + source columns**. **The drawer omits the `WaveformStrip`** (the waveform is
  already in the player). The tab chevron flips while open; same tab closes it.
  → This means generalizing `ui/meta/track-detail.tsx` to make the waveform optional and
  to render from a *version's* metadata, not just a history row.
- **Recipe line:** the selected version's recipe spelled out (`auto-tag · normalize −14
  LUFS · loudness match · eq shelf +2 dB`).
- **Action bar:** **Apply transforms** (primary) · **Branch** · **Switch** · **Rename**
  · (right) **Delete version** · **Export**. Selecting a historical (non-tip) card swaps
  in an inline **"⑂ Branch from here"** affordance (editing the past requires a named
  branch, per the model).

---

## 7. Version graph — the centerpiece

Chosen direction: **git-graph × waveform cards.** A version-control DAG whose nodes are
waveform cards — structural clarity *and* the see/hear-the-edit payoff.

- **Node = waveform card:** a small card with that version's **waveform thumbnail** +
  label (`Original` / transform names / custom label) + state (`edit` / `raw · root` /
  `cold`). **Current** version: accent border + ring. **Cold** (recipe-only) version:
  dimmed. **Hover** a card → previews that version (§4); **click** → peek (loads it into
  the player); non-tip → "branch from here".
- **Topology:** time flows **left→right**; the active branch is the spine; branches fork
  into other lanes via **curved colored edges**; a **branch ref** sits at each tip
  (`main` accent / `radio cut` warn / `club edit` ok — colors cycle per branch). Edges
  route only through gutters.
- **Collision-proof grid layout (hard rule):** cards snap to a strict grid —
  **column = version depth (time), row = branch lane, exactly one card per cell**, with
  fixed gutters (~28px). Cards can **never overlap or touch**, regardless of how history
  branches. More branches → taller; more edits → wider. The panel **scrolls both axes**.
- **Fading intro:** on first render, faint per-branch lane bands + lane labels flash in
  to teach the row=branch layout, then **fade out**, leaving clean cards + edges + refs
  at rest (a "replay" affordance is optional). No permanent background tint.

---

## 8. Generic button (normalize)

Replace all the bespoke gradient/glow buttons used in prototyping with **one reusable
button** matching the existing Settings / tag-edit buttons:

- **default:** `bg-raise` + `border-line`, `text-ink-dim → text-ink` on hover,
  `rounded-md`, `h-[30px]`, `text-[12.5px] font-medium`.
- **primary:** flat `bg-accent`, white, `font-semibold` (no gradient, no glow).

One component, two variants, generic and reusable (icons/states can be layered later).
The flat-accent play button follows the same accent. Normalize the gallery "enable
previews" control, the collection "Export all", etc., to this.

---

## 9. Activity log (expanded)

A **bottom dock** across the Library views:

- **Collapsed:** a single line — most-recent event summary + relative time, with a `▴`
  to expand.
- **Expanded:** folds **upward** into a read-only timeline (panel-style, mono header
  `ACTIVITY`). Each row: a typed lucide icon (ingested/edited/branched/switched/
  exported/deleted/renamed), the summary, and a mono timestamp; most recent first.
  Lean **unbounded** with a manual "clear" (matches the model's open question).
- **Empty:** `No activity yet.`

---

## 10. Export flow

One-shot copy (matches model F7/ADR-009): from a collection's **Export all** or a track's
**Export**, open the native folder picker (`chooseFolder`), copy the materialized
current version(s) named by tags via `buildFileName`, honoring `perPlaylistSubfolder`,
then surface a **confirmation toast** (`Exported N track(s) → <folder>`). No remembered
destination. Cold versions recompute first (Job Rail shows progress).

---

## 11. Empty / loading / cold states

- **Gallery empty:** §3. **Collection/editor loading:** skeleton rows/cards.
- **Cold version:** card shows `cold`; opening/peeking it triggers recompute via the Job
  Rail (existing materialization), the card un-dims when materialized.
- **Broken root** (blob missing): the track/card flags broken rather than crashing
  (model R7).

---

## 12. Motion & accessibility

- Honor `prefers-reduced-motion`: disable waveform scroll, EQ/intro animations, and audio
  autoplay-on-hover → static waveforms, no sound.
- Audio previews fully disable-able in Settings; default on.
- Keyboard: tiles/rows/cards focusable and activatable; Esc closes the metadata drawer
  and returns Editor→Collection→Gallery.
- All accent-driven states also carry a non-color cue (ring, label, position) for
  contrast.

---

## 13. Component map (what changes / is added)

Restyle / rework (renderer):
- `library/library-view.tsx` → **Gallery** grid (tiles, mosaic, toolbar, hover preview).
- **New** `library/collection-view.tsx` → the Collection page (hero + track list). (Split
  out of the old flat library-view.)
- `library/track-editor.tsx` → the unified editor (header/player, metadata drawer,
  recipe, action bar). Replace the `window.prompt` branch-name flow with an inline named
  input.
- `library/version-graph.tsx` → the **git-graph × waveform cards** grid renderer
  (replace the flat `<ol>`).
- `library/activity-log.tsx` → the collapsible bottom dock + expanded timeline.
- `ui/meta/track-detail.tsx` → generalize: optional `WaveformStrip`, render from a
  version's metadata; reused as the editor metadata drawer.
- **New** `ui/button.tsx` (or equivalent) → the generic button (§8); adopt across.
- **New** `library/preview-player.ts` → shared hover-preview audio engine (§4).
- App shell: rename the nav tab label/icon (§2); mount Gallery/Collection/Editor; replace
  the always-rendered side-by-side activity with the dock.

Main / preload (for the audio-preview feature):
- Register **`plucker-audio://<hash>`** protocol; a way to resolve a track's current-
  version blob hash for playback (extend `library:getTrack` data or add an accessor).
- `audioPreviews` setting (+ default) and its `settings:*` plumbing; surface a toggle in
  the Settings panel.

i18n: add `nav.library`, gallery/collection/editor/activity/export strings (en + de),
keeping existing keys where present.

---

## 14. Open questions

- **Collection waveform source:** first track's peaks (ship) vs a blended "collection
  signature" across tracks (later upgrade).
- **Snippet window:** fixed offset + length, or smarter "hook" detection. Tune in build.
- **Sort default & singles flooding:** if single-video collections dominate the gallery,
  consider a default grouping or a "Singles" bucket affordance (currently each single is
  its own tile, Recent-sorted).
- **`View` union rename** (`'history'` → `'library'`) now vs. as a follow-up.
- Activity log cap (lean unbounded + manual clear).

---

## 15. Out of scope

No change to the storage model, refcount/delete, version/branch semantics, recipe
determinism, materialization policy, or the worker/pipeline engine — all already built.
This pass is visual + the audio-preview feature only.
