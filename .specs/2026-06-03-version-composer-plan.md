# Version Composer — frontend-design plan

**Date:** 2026-06-03
**Status:** Design plan (implements `2026-06-03-version-composer-design.md`)
**Aesthetic:** Plucker's existing **dark studio / DAW-console** language — extended,
not replaced.

## 1. Design north star

Plucker already reads like a **signal-chain workstation**: waveform cards, a
git-graph of versions, faint mono labels, hairline racks, one OS-accent hue. The
composer leans *all the way* into that metaphor instead of bolting on a generic
"form modal":

> **Building a version is patching a signal chain.** The selected version is the
> **source** plugged into the top of a vertical rack of transform modules; the
> chain's **output** is a ghost node that will drop into the graph as a new child.

This gives us a memorable, context-true surface — a **patch rack** — while reusing
`TransformsSection`, `Button`, and the `@theme` tokens verbatim. No new fonts, no
new palette; we add exactly **one** new semantic role (a "focus/selected" hue,
borrowed from the existing `warn` amber) so *selected* never collides with the
cool-blue *current*.

### Design tokens used (all existing, from `index.css`)

| Role | Token |
| --- | --- |
| Surfaces | `surface`, `panel`, `panel2`, `raise` |
| Hairlines | `line`, `line2` |
| Text | `ink`, `ink-dim`, `ink-faint` |
| **Current** (branch tip) | `accent` (cool blue, OS-themed) |
| **Selected / source** (NEW role) | `warn` `#e8a23a` (amber) |
| Destructive | `bad` |
| Type | `font-sans` (Geist), `font-mono` (Geist Mono) |

The amber-for-selected choice is deliberate: it is the one warm hue already in the
system, it never appears on version cards today, and amber-vs-blue is the clearest
two-state contrast we can make without inventing a color.

## 2. The selection language (the "make it obvious" requirement)

Two *different* states must be legible at a glance, sometimes on the **same** node:

- **Current** = the active branch tip / what the player is showing. → cool **accent**
  ring + `● current` eyebrow. (Unchanged.)
- **Selected** = the node the composer & action bar act on (the future parent). →
  **amber focus**: a 2px amber border **plus** an offset outer ring
  (`shadow-[0_0_0_3px_rgba(232,162,58,.22)]`), a tiny **`◆ from`** chip pinned to
  the card's top-left, and a subtle `scale-[1.03]` lift.

`VersionCard` resolves the composed states:

```
                accent ring   amber focus   eyebrow         chip
current+selected   ✓             ✓          ● current      ◆ from
current only       ✓             —          ● current        —
selected only      —             ✓          edit / cold     ◆ from
neither            —             —          edit / cold      —
```

A connecting cue ties the graph to the rack: while the composer is open, the
selected card grows a short amber **stub edge** on its right toward the rack (the
"patch cable" leaving the source), and every *other* card dims to `opacity-40` so
the source is unmistakable.

The selection is **also** echoed outside the graph:
- **EditorPlayer eyebrow** already prints `showing «version» · current`; we append a
  `from «selected»` token in amber when selected ≠ current.
- The composer header restates it (below).

## 3. Surfaces & flow

Three surfaces, all inside the existing Track Editor page (the Library "history"
Page) — no router changes:

1. **Version graph** (existing) — gains the selection language above. The action bar
   gains a primary **`+ New version`** that opens (2).
2. **Composer rack** (NEW, `version-composer.tsx`) — an over-graph panel that slides
   up from the action bar, covering the graph with a scrim (mirrors the existing
   `MetadataDrawer` motion, but rising from the bottom). It owns the chain.
3. **Inline create feedback** — the existing `library:editFailed` → toast path
   (failure) and `library:changed` re-pull (success) cover results; the composer
   closes optimistically on submit and the new child animates into the graph.

### Why an over-graph panel, not a centered modal

The graph *is* the spatial context ("child of *this* node"). A centered modal would
sever that. Sliding the rack up from the action bar while keeping the amber source
card peeking at the top edge preserves the "this plugs into that" reading and
matches `MetadataDrawer`'s established drawer idiom (consistency > novelty).

## 4. Composer rack — anatomy

```
┌───────────────────────────────────────────────────────────────────┐
│  NEW VERSION                                                   ✕    │  ← mono eyebrow, close
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ◆ FROM                                                       │  │  ← amber source slab
│  │ «selected version label»            v3 · trim + auto-tag     │  │     (mirrors VersionCard:
│  │ ▁▂▅▇▅▂▁▂▅▇▅▂▁  (the source's real waveform, amber-tinted)   │  │      tiny waveform, mono meta)
│  └─────────────────────────────────────────────────────────────┘  │
│                          ╎  (patch cable: amber dotted vertical)    │
│  ┌─ SIGNAL CHAIN ───────────────────────  load settings chain ↧ ┐  │  ← rack header + seed action
│  │  ⠿ 1  [on] Trim silence              ▲ ▼  ⌄  ✕                │  │  ← TransformsSection (reused
│  │  ⠿ 2  [on] Auto-tag                  ▲ ▼  ⌄  ✕                │  │     verbatim: drag, reorder,
│  │       └ (expanded config: SchemaForm / custom)               │  │     enable, configure, remove)
│  │  ⊕  Add transform…                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                          ╎                                          │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ◇ OUTPUT  →  new child of «selected»          on branch: main │  │  ← ghost output node;
│  │            (interior fork → "new branch: edit 2")            │  │     states the branch result
│  └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│  2 steps                                  [ Cancel ]  [ Create ◇ ] │  ← footer; Create disabled @0
└───────────────────────────────────────────────────────────────────┘
```

### 4.1 Source slab
A compact echo of the selected `VersionCard`: amber 1px border on `panel2`, the
version label (Geist 500), a mono meta line (`v{depth} · {recipe summary}` or
`Original`), and the version's **real waveform** (reuse `useVersionWaveform`,
amber-tinted gradient instead of blue). This visually *is* the card the user picked,
lifted into the rack.

### 4.2 Signal chain (reused `TransformsSection`)
Dropped in **unchanged**. It already gives: numbered steps, grip-drag reorder,
up/down, enable `Switch`, expandable per-step config (`SchemaForm` / custom
registry), remove, and the dashed `⊕ Add transform…` selector seeded from
`getTransformCatalog()`. The composer owns the `instances` state and passes
`onChange`. A right-aligned **`load settings chain ↧`** ghost-link in the rack header
seeds `instances` from `settings.transforms` (keeps the old one-click path one
click).

### 4.3 Output ghost node
A dashed-border (`border-dashed border-line`) slab reading `◇ output → new child of
«selected»`, with a live **branch-result** hint computed in the renderer from the
selected version vs. branch tips:
- selected **is** active tip → `on branch: «activeBranch.name»`
- selected **is** another tip → `on branch: «that branch»` (will switch)
- selected **is** interior → `new branch: «auto-name»` (amber emphasis — a fork)

This makes the §2 branch semantics from the spec *visible before* the user commits.

### 4.4 Footer
Left: live `{n} steps` mono counter (amber when n≥1, `ink-faint` at 0). Right:
`Cancel` (default Button) + `Create ◇` (primary Button), **disabled until ≥1 enabled
step**. On click → `createTrackVersion(trackId, selected.id, instances)`, then close.

## 5. Motion (restrained, matches the app)

- **Open:** rack translateY `101% → 0`, `duration-300 ease-out`; scrim `opacity 0→1`;
  graph cards (non-source) dim to `opacity-40` over 200ms; source card lifts
  (`scale-1.03`) and grows its amber stub. Mirrors `MetadataDrawer`.
- **Patch cables:** the dotted amber vertical connectors between slabs draw in with a
  2px dash; purely CSS, static after mount.
- **Create:** rack slides down; on the next `library:changed` re-pull, the new child
  card mounts and its waveform bars run the existing `wave-rise` stagger — it "lands"
  in the graph.
- **Reduced motion:** all of the above collapse to opacity-only / none under
  `@media (prefers-reduced-motion: reduce)` (the project already guards `wave-rise`).

## 6. Component / file plan

| File | Change |
| --- | --- |
| `library/version-composer.tsx` *(new)* | The rack surface (source slab, reused `TransformsSection`, output ghost, footer). Owns `instances` + open state via props. Colocated `version-composer.test.tsx`. |
| `library/version-source-slab.tsx` *(new, optional)* | The amber source echo (waveform + meta). May inline into composer if small. |
| `library/branch-outcome.ts` *(new)* | Pure helper: `(versions, branches, activeBranchId, selectedId) → { kind: 'advance'|'switch'|'fork'; branchName }`. Unit-tested; also drives the output ghost hint **and** is reusable by the main-side fold (share via `src/shared/` if it needs the same logic — see spec §2). |
| `library/version-graph.tsx` | `VersionCard`: amber focus ring + `◆ from` chip + scale; dim non-source when `composing`; amber stub on source. New props: `composing?: boolean`. |
| `library/track-editor.tsx` | Replace "Apply transforms" with `+ New version` opening the composer; hold composer open + `instances` state; wire `onCreateVersion`. Keep branch/rename/delete/export actions. |
| `library/editor-player.tsx` | Append amber `from «selected»` token to the eyebrow when selected ≠ current. |
| `app.tsx` | `onEdit` → `onCreateVersion(trackId, parentVersionId, chain)` → `window.plucker.createTrackVersion(...)`. |
| `i18n/locales/en.ts` + `de.ts` | New `library.*` keys (below). |

### New i18n keys (`library.*`, both locales)
`newVersion` ("New version"), `newVersionTitle` ("NEW VERSION"), `fromVersion`
("From"), `signalChain` ("Signal chain"), `loadSettingsChain` ("Load settings
chain"), `addTransform` ("Add transform…"), `composerEmpty` ("Add at least one
transform to build a version."), `output` ("Output"), `newChildOf` ("new child of
{{version}}"), `onBranch` ("on branch: {{name}}"), `newBranch` ("new branch:
{{name}}"), `stepsN` ("{{count}} steps"), `create` ("Create version"), `selected`
("selected"), `from` ("from").

## 7. Accessibility

- Composer is a labelled region (`role="dialog"`/`aria-modal` semantics optional
  since it's an in-app drawer; at minimum `aria-label="New version"`), focus moves to
  the first chain control on open, `Esc` cancels, focus returns to `+ New version`.
- Amber-vs-blue is reinforced by **text** (`● current`, `◆ from`) and shape, never
  color alone (colour-blind safe).
- `Create` button keeps the existing `disabled` styling/`aria-disabled` from
  `Button`; the empty-state hint explains *why* it's disabled.
- Drag-reorder retains the existing keyboard up/down arrows from `TransformsSection`.

## 8. Acceptance (UI slice of the spec)

1. `+ New version` opens the rack anchored to the **selected** card; the source slab
   mirrors that exact version (label, meta, waveform).
2. Empty chain → `Create` disabled + hint; adding/ordering/configuring steps via the
   reused `TransformsSection` enables it.
3. The output ghost correctly previews **advance / switch / new branch** before
   commit, matching what the fold does.
4. Selected vs. current are unmistakable in the graph **and** the editor eyebrow;
   verified by `version-graph.test.tsx` (focus ring + chip present only when
   selected) and `branch-outcome.test.ts`.
5. Motion respects `prefers-reduced-motion`. `pnpm typecheck/lint/test` green.

## 9. Out of scope (UI)

No new transform *types*, no recipe editing of existing versions, no merge UI, no
drag-from-graph-into-rack (the selection *is* the anchor). Settings-chain semantics
unchanged; the composer only *borrows* it via the seed link.
