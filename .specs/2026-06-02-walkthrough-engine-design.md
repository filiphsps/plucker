# Walkthrough Engine — Design

**Date:** 2026-06-02
**Status:** Approved (design); pending implementation plan
**Scope:** A flexible, node-graph-based walkthrough / tutorial / getting-started /
update-walkthrough runtime for Plucker. This document plans the **system**, not the
content of any specific walkthrough.

## Goal

Build a walkthrough engine that is extremely flexible and dynamic, lives **outside**
the main business logic (injected once at the app's body level), and executes
**graphs** of typed nodes — branching or straight paths — that can highlight UI,
present coach-marks, demo automated input, run vetted actions, and branch on app
state.

Modeled conceptually on node-based scripting (e.g. Unity's node graphs): a walkthrough
is a graph of typed nodes connected by conditional edges, not a linear array of steps.

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | **Graph runtime only.** Walkthroughs authored as typed TS/JSON shaped like a node graph. **No visual editor** in v1. |
| 2 | Element anchoring | **Hybrid** — opt-in anchor IDs (`data-tour` / `useTourAnchor`) are the blessed path; raw CSS `{selector}` is an escape hatch for one-offs. |
| 3 | Demoing / automated input | **Hybrid** — ghost-cursor + fake-typing **illusion by default** (zero side effects); a node may opt into a **vetted, registered safe-intent** when the real app should move. |
| 4 | Advance/branch signals | **All four** — anchor interaction, app-state predicate (event/probe), manual Next/Back, timeout/delay. |
| 5 | Triggers | **All four** — first-launch onboarding, version-bump update walkthrough, contextual/state-reached, manual/Help-menu replay. |
| 6 | Input model | **Per-node modality** — each node declares `block` (modal spotlight) or `passthrough` (live app, highlight only). |
| 7 | Recovery | **Graph-native fallback edges** (`onTimeout` / `onError` / `onStray`) with anchor resolve-retry; safe global default (Skip / Exit) when no fallback authored. |
| 8 | Resume | **Persist current node + branch variables**; offer resume on restart (mirrors existing job-resume concept). |
| 9 | Engine implementation | **Pure-core interpreter + host adapter.** Framework-agnostic engine; React overlay is a thin subscriber; the host adapter is the only Plucker-aware seam. |

## Architecture at a glance

```
src/shared/walkthrough/        # pure, framework-agnostic, no DOM, no React
  types.ts        # Walkthrough · Node · Edge · Condition · EngineState · Progress
  engine.ts       # createEngine(adapter) — holds current node + vars, evaluates edges
  engine.test.ts
  validate.ts     # graph integrity (entry exists, every edge.to resolves, …)
  validate.test.ts

src/renderer/src/walkthrough/  # Plucker-aware glue + visual layer
  host-adapter.ts          # the ONE seam: resolveAnchor / subscribeState / readProbe / runIntent / load+save
  anchor-registry.ts       # data-tour attrs + {selector} resolution + registration map
  use-tour-anchor.ts       # ref hook to register an element under an anchor id
  walkthrough-provider.tsx # triggers, resume-offer, startWalkthrough() context
  walkthrough-layer.tsx    # the body-level overlay (spotlight, coach-marks, controls)
  ghost-cursor.tsx         # demo illusion (fake cursor + typing)
  coach-mark.tsx           # positioned tooltip/card
  spotlight.tsx            # backdrop + cutout highlight
  intents.ts               # registry of vetted safe-intents (navigate, prefillUrl, …)
  content/
    manifest.ts            # registry of shipped walkthroughs + their trigger specs
    <id>.ts                # each walkthrough as a typed TS graph (i18n keys for text)
  *.test.tsx
```

The engine never touches the DOM or `window.plucker`. It asks the **host adapter**.
This is what keeps it "outside business logic" *and* unit-testable with zero DOM.

The engine and data model live in `src/shared/` because they are UI-agnostic and pure,
consistent with the project convention that cross-process / UI-agnostic helpers belong
in `src/shared/`.

## Component design

### Graph data model (`src/shared/walkthrough/types.ts`)

Every node shares one envelope:

```ts
type NodeId = string

interface BaseNode {
  id: NodeId
  // Outgoing transitions, evaluated top-to-bottom; first edge whose `when` matches
  // wins. A `when`-less edge is the default/Next transition.
  edges: Edge[]
  // Graph-native recovery routes (optional):
  onTimeout?: NodeId   // a node-level wait elapsed with no matching edge
  onError?: NodeId     // anchor unresolved past the retry window
  onStray?: NodeId     // user interacted off-path (block violation / wrong target)
}

interface Edge {
  to: NodeId
  when?: Condition     // omitted => unconditional default transition
}

type AnchorRef = { anchor: string } | { selector: string }

type Condition =
  | { kind: 'anchorEvent'; anchor: AnchorRef; event: 'click' | 'focus' | 'input' | 'change' }
  | { kind: 'state'; probe?: string; event?: string; predicate: SerializablePredicate }
  | { kind: 'manual'; control: 'next' | 'back' | 'custom'; label?: I18nKey }
  | { kind: 'timeout'; ms: number }
```

`SerializablePredicate` is a small JSON-expressible comparison (e.g.
`{ op: 'eq' | 'gt' | 'truthy' | 'matches'; value?: unknown }`) evaluated against a
probe value or an event payload — kept serializable so graphs stay pure data and the
resume snapshot can round-trip.

Five node `kind`s (a small, composable taxonomy), all extending `BaseNode`:

| kind | does | typical advance |
|---|---|---|
| `step` | highlight optional anchor + coach-mark content; `modality: 'block' \| 'passthrough'` | manual / anchorEvent / state |
| `demo` | ghost-cursor + fake-typing sequence (illusion), **or** invoke a safe-intent | auto when sequence done |
| `intent` | invoke a vetted safe-intent (e.g. `navigate`), no UI | auto when done |
| `branch` | no UI; evaluate `state` edges immediately and route | instant |
| `end` | terminal; records completion | — |

- A **linear tour** is `step`s each with a single default edge.
- **Branching** is a node with multiple `when` edges (`anchorEvent` / `state` / `timeout`).
- **Recovery** uses `onTimeout` / `onError` / `onStray`, falling back to a global safe
  default (Skip / Exit control) when unauthored.

`step` content fields (title/body/labels) are **i18next keys**, not literal strings.

A `Walkthrough` is:

```ts
interface Walkthrough {
  id: string
  version: string          // content version, for re-show logic
  entry: NodeId
  nodes: Record<NodeId, Node>
  // Trigger spec lives in the content manifest, not here, so triggering is
  // declarative and centrally evaluated (see Triggers).
}
```

### Engine (`src/shared/walkthrough/engine.ts`)

```ts
createEngine(adapter: HostAdapter): Engine

interface Engine {
  start(wt: Walkthrough, opts?: { fromNode?: NodeId; vars?: Record<string, unknown> }): void
  signal(sig: Signal): void          // anchorEvent | manual | stateUpdate | tick | anchorError | stray
  subscribe(cb: (state: EngineState) => void): Unsubscribe
  exit(): void                       // user-dismissed
}

interface EngineState {
  walkthroughId: string | null
  node: Node | null
  status: 'idle' | 'running' | 'waiting' | 'done' | 'error'
  vars: Record<string, unknown>
}
```

The engine holds the current node + a variable bag (branch memory), evaluates the
current node's edges against incoming signals, transitions, and emits new state to
subscribers. It runs node *effects* (demo/intent) by calling the adapter. It persists
`inProgress` via the adapter on each transition. It is pure with respect to the DOM and
Plucker — all outside contact goes through the adapter.

### Host adapter (`src/renderer/src/walkthrough/host-adapter.ts`) — the seam

```ts
interface HostAdapter {
  resolveAnchor(ref: AnchorRef): Element | null
  subscribeState(spec: StateSpec, cb: (value: unknown) => void): Unsubscribe // window.plucker events / DOM
  readProbe(id: string): unknown
  runIntent(id: string, args?: unknown): Promise<void>   // vetted, side-effect-controlled
  loadProgress(): WalkthroughProgress
  saveProgress(p: WalkthroughProgress): void             // → window.plucker → Settings
}
```

This is the only file that knows it is running inside Plucker. State subscriptions wire
to existing broadcasts (`onJobsChanged`, `onProgress`, `history:changed`) and/or DOM;
`runIntent` dispatches to a vetted registry (`intents.ts`).

### Anchor registry (`anchor-registry.ts` + `use-tour-anchor.ts`)

- `useTourAnchor(id)` returns a ref; mounting registers the element under `id`,
  unmounting clears it.
- `data-tour="id"` attributes are discovered by DOM query as an alternative.
- `{ selector }` refs resolve via `document.querySelector` (escape hatch).
- The overlay resolves the current node's anchor with a **short retry window**
  (rAF/interval up to a timeout) to tolerate pages animating in; on failure it signals
  `anchorError` so the engine routes `onError` or the safe default.

### Overlay layer (`walkthrough-layer.tsx`)

Mounted **once at the `app.tsx` root** (the "body-level" injection). Subscribes to
engine state and, for the current node:

- Renders `spotlight` (block: dim backdrop + cutout, only the anchor interactive) or a
  non-blocking highlight (passthrough: live app, highlight + coach-mark only).
- Positions the `coach-mark` relative to the resolved anchor rect; repositions on
  scroll/resize (ResizeObserver + scroll listeners).
- For `demo` nodes, renders `ghost-cursor` + fake typing animation.
- Renders Next / Back / Skip / Exit controls; forwards anchor DOM events back to the
  engine as `signal`s.

### Triggers, persistence, resume (`walkthrough-provider.tsx`)

New `Settings.walkthroughs` field (main process is sole writer, via `window.plucker`;
bump `Settings.version` and add a migration default):

```ts
walkthroughs?: {
  lastSeenVersion: string
  seen: Record<string, { version: string; at: number }>
  inProgress?: { id: string; nodeId: string; vars: Record<string, unknown> }
}
```

`WalkthroughProvider` on mount:

1. If `inProgress` exists → show a **resume-offer banner** (mirrors the existing
   `ResumeBanner` pattern) to resume from `nodeId` with `vars`, or dismiss.
2. Else evaluate launch triggers:
   - **First-run**: no `seen` entry and no `lastSeenVersion` → start onboarding.
   - **Version bump**: `appVersion > lastSeenVersion` → start that version's update
     walkthrough once. Update `lastSeenVersion` afterward.
3. **Contextual**: subscribe to state signals; a contextual-trigger registry maps a
   `condition → walkthroughId`, firing once (tracked in `seen`).
4. **Manual**: expose `startWalkthrough(id)` via context for the Help-menu item.

The engine persists `inProgress` on each transition; reaching an `end` node records the
`seen` entry and clears `inProgress`.

On resume, anchors are re-resolved and conditions re-evaluated; if the app state no
longer matches the persisted node, the graph-native recovery edges / safe default keep
it from getting stuck (Decision 7 covers this).

### Safe-intents (`intents.ts`)

A small registry of vetted, side-effect-controlled actions the graph may invoke, reusing
existing app handlers. Initial set (illustrative, grown as content needs):

- `navigate(view)` → `setView` (page navigation; no data effects).
- `prefillUrl(url)` → `setPrefill` (fills the command bar without resolving/downloading).

Each intent must be authored to avoid irreversible effects (no surprise
downloads/deletes). The illusion path remains the default for anything not vetted.

## The intentional touch-points in the app (all small)

1. Mount `<WalkthroughProvider><WalkthroughLayer/></WalkthroughProvider>` once at the
   `app.tsx` root.
2. Add `data-tour` / `useTourAnchor` to teachable elements **incrementally**, as content
   needs them — not required up front.
3. Register a few safe-intents in `intents.ts` that reuse existing handlers.
4. Add a Help-menu item → `startWalkthrough('getting-started')`.
5. Wire the host adapter's `subscribeState` / `readProbe` to existing `window.plucker`
   events.

## Main-process changes

- Extend `Settings` with `walkthroughs`; bump `Settings.version` and add a migration
  default.
- IPC handlers `walkthrough:loadProgress` / `walkthrough:saveProgress` (or fold into the
  existing settings save path); expose via preload.
- Provide the app version (already available via Electron `app.getVersion()`).

## i18n

All user-facing node text is referenced by **i18next keys**; translations are added to
the existing `en.ts` / `de.ts` locale files. Content graphs reference keys only.

## Testing strategy

- **Engine** (`engine.test.ts`): pure unit tests — transitions, condition matching,
  branching, fallback edges (`onTimeout`/`onError`/`onStray`), resume-from-node, variable
  bag. Zero DOM.
- **Validator** (`validate.test.ts`): every shipped graph passes integrity (entry exists,
  every `edge.to`/recovery target resolves, no orphan nodes, anchors are well-formed).
- **Anchor registry / overlay**: focused RTL / jsdom tests — registration lifecycle,
  anchor resolution + retry, coach-mark positioning, control wiring.
- **Host adapter**: thin; tested with mocked `window.plucker`.

## Out of scope (v1)

- Visual node editor (drag-and-connect canvas). The data model + serialization are
  designed so an editor can be a separate future project without rework.
- Authoring walkthroughs by end-users. Walkthroughs are authored by developers as typed
  TS and shipped with the app.
- Real synthetic DOM-event automation. Automation is illusion-by-default with vetted
  safe-intents only.
- Authoring any specific walkthrough *content* — this spec covers the system only.
