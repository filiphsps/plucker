# Walkthrough Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a node-graph walkthrough/tutorial engine for Plucker that lives outside business logic, mounted once at the app root, executing branching graphs of typed nodes that highlight UI, present coach-marks, demo automated input (illusion + vetted safe-intents), and branch on app state.

**Architecture:** A pure, framework-agnostic interpreter + data model in `src/shared/walkthrough/` talks to the app only through an injected host. A thin React overlay subscribes to engine state and renders spotlight/coach-marks/ghost-cursor. A provider handles triggers, persistence (a new optional `Settings.walkthroughs` field), and resume. Walkthroughs are authored as typed TS graphs; node text uses i18next keys.

**Tech Stack:** TypeScript, React 19, Electron, Tailwind, i18next, Vitest, React Testing Library, lucide-react.

**Conventions (from the codebase):**
- Package manager: **pnpm**. Run tests with `pnpm test` (vitest). Run a single file: `pnpm test src/shared/walkthrough/engine.test.ts`. Typecheck: `pnpm typecheck`.
- Commits: Conventional Commits. Work on `master` (no new branches).
- Tests are colocated `*.test.ts(x)`. Pure helpers go in `src/shared/`.

**Spec:** `.specs/2026-06-02-walkthrough-engine-design.md`

---

## File Structure

**Created:**
- `src/shared/walkthrough/types.ts` — graph data model + engine/host interfaces (pure types).
- `src/shared/walkthrough/fixtures.ts` — sample graphs used across engine/validator tests.
- `src/shared/walkthrough/validate.ts` + `.test.ts` — graph integrity validation.
- `src/shared/walkthrough/transitions.ts` + `.test.ts` — pure predicate/edge-matching helpers.
- `src/shared/walkthrough/engine.ts` + `.test.ts` — the interpreter.
- `src/renderer/src/walkthrough/anchor-registry.ts` + `.test.ts` — anchor id → element map.
- `src/renderer/src/walkthrough/use-tour-anchor.ts` — ref hook to register an anchor.
- `src/renderer/src/walkthrough/intents.ts` — vetted safe-intent registry.
- `src/renderer/src/walkthrough/host-adapter.ts` + `.test.ts` — Plucker host impl.
- `src/renderer/src/walkthrough/spotlight.tsx` — backdrop + cutout.
- `src/renderer/src/walkthrough/coach-mark.tsx` — positioned card.
- `src/renderer/src/walkthrough/ghost-cursor.tsx` — demo illusion renderer.
- `src/renderer/src/walkthrough/walkthrough-layer.tsx` + `.test.tsx` — the body-level overlay.
- `src/renderer/src/walkthrough/triggers.ts` + `.test.ts` — pure launch-decision logic.
- `src/renderer/src/walkthrough/walkthrough-provider.tsx` — triggers + resume + context.
- `src/renderer/src/walkthrough/content/manifest.ts` — registry of shipped walkthroughs.
- `src/renderer/src/walkthrough/content/getting-started.ts` — minimal sample graph.
- `src/renderer/src/walkthrough/content/manifest.test.ts` — validates every shipped graph.

**Modified:**
- `src/shared/types.ts` — add optional `walkthroughs` to `Settings`; add `WalkthroughProgress` types.
- `src/shared/defaults.ts` — default `walkthroughs` value.
- `src/main/settings.ts` — merge the new field in `mergeDefaults`.
- `src/main/index.ts` — IPC handlers for walkthrough progress.
- `src/preload/index.ts` + `src/preload/index.d.ts` — expose the new IPC.
- `src/renderer/src/app.tsx` — mount provider + layer; expose `startWalkthrough` to Help menu.
- `src/renderer/src/i18n/locales/en.ts` + `de.ts` — content + control strings.

---

## Task 1: Graph data model types

**Files:**
- Create: `src/shared/walkthrough/types.ts`
- Create: `src/shared/walkthrough/fixtures.ts`

- [ ] **Step 1: Write the type module**

Create `src/shared/walkthrough/types.ts`:

```ts
// Pure, framework-agnostic data model + interfaces for the walkthrough engine.
// No DOM, no React, no Electron imports allowed in this file.

export type NodeId = string

/** i18next translation key (documented marker; it is just a string). */
export type I18nKey = string

/** How the engine locates a UI element. Anchor ids are the blessed path. */
export type AnchorRef = { anchor: string } | { selector: string }

/** JSON-expressible comparison evaluated against a probe value or event payload. */
export type SerializablePredicate =
  | { op: 'truthy' }
  | { op: 'eq'; value: unknown }
  | { op: 'gt'; value: number }
  | { op: 'matches'; pattern: string }

export type Condition =
  | { kind: 'anchorEvent'; anchor: AnchorRef; event: 'click' | 'focus' | 'input' | 'change' }
  | { kind: 'state'; probe?: string; event?: string; predicate: SerializablePredicate }
  | { kind: 'manual'; control: 'next' | 'back' | 'custom'; label?: I18nKey }
  | { kind: 'timeout'; ms: number }

/** Outgoing transition. `when` omitted => default transition (manual Next / effect done). */
export interface Edge {
  to: NodeId
  when?: Condition
}

interface BaseNode {
  id: NodeId
  edges: Edge[]
  onTimeout?: NodeId
  onError?: NodeId
  onStray?: NodeId
}

/** Visual demo op (illusion only — never touches real app state). */
export type DemoOp =
  | { op: 'moveCursor'; anchor: AnchorRef }
  | { op: 'type'; anchor: AnchorRef; text: string }
  | { op: 'clickGhost'; anchor: AnchorRef }
  | { op: 'pause'; ms: number }

export interface StepNode extends BaseNode {
  kind: 'step'
  anchor?: AnchorRef
  modality: 'block' | 'passthrough'
  title?: I18nKey
  body: I18nKey
}

export interface DemoNode extends BaseNode {
  kind: 'demo'
  ops: DemoOp[]
}

export interface IntentNode extends BaseNode {
  kind: 'intent'
  intent: string
  args?: unknown
}

export interface BranchNode extends BaseNode {
  kind: 'branch'
}

export interface EndNode extends BaseNode {
  kind: 'end'
}

export type WalkNode = StepNode | DemoNode | IntentNode | BranchNode | EndNode

export interface Walkthrough {
  id: string
  version: string
  entry: NodeId
  nodes: Record<NodeId, WalkNode>
}

/** Persisted mid-run position for resume. */
export interface InProgress {
  id: string
  nodeId: NodeId
  vars: Record<string, unknown>
}

/** Signals fed into the engine. */
export type Signal =
  | { kind: 'anchorEvent'; anchor: AnchorRef; event: 'click' | 'focus' | 'input' | 'change' }
  | { kind: 'manual'; control: 'next' | 'back' | 'custom' }
  | { kind: 'state'; probe?: string; event?: string; value: unknown }
  | { kind: 'timeout' }
  | { kind: 'anchorError' }
  | { kind: 'stray' }
  | { kind: 'effectDone' }

export type RecoveryReason = 'error' | 'timeout' | 'stray'

export interface EngineState {
  walkthroughId: string | null
  node: WalkNode | null
  status: 'idle' | 'running' | 'waiting' | 'done' | 'error'
  vars: Record<string, unknown>
  /** Non-null when reality diverged and no recovery edge was authored. */
  recovery: { reason: RecoveryReason } | null
  /** ms the host should wait before sending a {kind:'timeout'} signal (null = none). */
  pendingTimeoutMs: number | null
}

/** The narrow surface the engine needs from the host (renderer adapter implements it). */
export interface EngineHost {
  readProbe(id: string): unknown
  runIntent(id: string, args?: unknown): Promise<void>
  saveInProgress(p: InProgress | null): void
  markSeen(id: string, version: string): void
}
```

Create `src/shared/walkthrough/fixtures.ts`:

```ts
import type { Walkthrough } from './types'

/** Two linear steps then end; advanced by manual Next. */
export const LINEAR: Walkthrough = {
  id: 'linear',
  version: '1',
  entry: 'a',
  nodes: {
    a: { id: 'a', kind: 'step', modality: 'passthrough', body: 'a.body', edges: [{ to: 'b' }] },
    b: { id: 'b', kind: 'step', modality: 'passthrough', body: 'b.body', edges: [{ to: 'done' }] },
    done: { id: 'done', kind: 'end', edges: [] }
  }
}

/** Branch on a probe: value > 0 -> 'hi', else -> 'lo'. */
export const BRANCHING: Walkthrough = {
  id: 'branching',
  version: '1',
  entry: 'decide',
  nodes: {
    decide: {
      id: 'decide',
      kind: 'branch',
      edges: [
        { to: 'hi', when: { kind: 'state', probe: 'count', predicate: { op: 'gt', value: 0 } } },
        { to: 'lo' }
      ]
    },
    hi: { id: 'hi', kind: 'end', edges: [] },
    lo: { id: 'lo', kind: 'end', edges: [] }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors introduced).

- [ ] **Step 3: Commit**

```bash
git add src/shared/walkthrough/types.ts src/shared/walkthrough/fixtures.ts
git commit -m "feat(walkthrough): add graph data model types and test fixtures"
```

---

## Task 2: Graph validator

**Files:**
- Create: `src/shared/walkthrough/validate.ts`
- Test: `src/shared/walkthrough/validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/walkthrough/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateWalkthrough } from './validate'
import { LINEAR } from './fixtures'
import type { Walkthrough } from './types'

describe('validateWalkthrough', () => {
  it('accepts a valid graph', () => {
    expect(validateWalkthrough(LINEAR)).toEqual([])
  })

  it('flags a missing entry node', () => {
    const wt: Walkthrough = { ...LINEAR, entry: 'nope' }
    expect(validateWalkthrough(wt)).toContain('entry node "nope" does not exist')
  })

  it('flags a dangling edge target', () => {
    const wt: Walkthrough = {
      ...LINEAR,
      nodes: { ...LINEAR.nodes, a: { ...LINEAR.nodes.a, edges: [{ to: 'ghost' }] } }
    } as Walkthrough
    expect(validateWalkthrough(wt)).toContain('node "a" edge -> "ghost" does not exist')
  })

  it('flags a dangling recovery target', () => {
    const wt: Walkthrough = {
      ...LINEAR,
      nodes: { ...LINEAR.nodes, a: { ...LINEAR.nodes.a, onError: 'ghost' } }
    } as Walkthrough
    expect(validateWalkthrough(wt)).toContain('node "a" onError -> "ghost" does not exist')
  })

  it('flags a node whose id key disagrees with its id field', () => {
    const wt: Walkthrough = {
      ...LINEAR,
      nodes: { ...LINEAR.nodes, a: { ...LINEAR.nodes.a, id: 'mismatch' } }
    } as Walkthrough
    expect(validateWalkthrough(wt)).toContain('node key "a" != node.id "mismatch"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/walkthrough/validate.test.ts`
Expected: FAIL — "Failed to resolve import './validate'".

- [ ] **Step 3: Write the validator**

Create `src/shared/walkthrough/validate.ts`:

```ts
import type { Walkthrough, WalkNode } from './types'

/** Returns a list of human-readable problems; empty array means the graph is sound. */
export function validateWalkthrough(wt: Walkthrough): string[] {
  const errors: string[] = []
  const ids = new Set(Object.keys(wt.nodes))

  if (!ids.has(wt.entry)) errors.push(`entry node "${wt.entry}" does not exist`)

  for (const [key, node] of Object.entries(wt.nodes)) {
    if (node.id !== key) errors.push(`node key "${key}" != node.id "${node.id}"`)
    for (const edge of node.edges) {
      if (!ids.has(edge.to)) errors.push(`node "${key}" edge -> "${edge.to}" does not exist`)
    }
    for (const rec of ['onTimeout', 'onError', 'onStray'] as const) {
      const target = (node as WalkNode)[rec]
      if (target !== undefined && !ids.has(target)) {
        errors.push(`node "${key}" ${rec} -> "${target}" does not exist`)
      }
    }
  }
  return errors
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/walkthrough/validate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/walkthrough/validate.ts src/shared/walkthrough/validate.test.ts
git commit -m "feat(walkthrough): add graph integrity validator"
```

---

## Task 3: Pure transition helpers

**Files:**
- Create: `src/shared/walkthrough/transitions.ts`
- Test: `src/shared/walkthrough/transitions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/walkthrough/transitions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evalPredicate, edgeMatches } from './transitions'
import type { Edge, Signal } from './types'

describe('evalPredicate', () => {
  it('truthy', () => {
    expect(evalPredicate({ op: 'truthy' }, 1)).toBe(true)
    expect(evalPredicate({ op: 'truthy' }, 0)).toBe(false)
  })
  it('eq', () => {
    expect(evalPredicate({ op: 'eq', value: 'x' }, 'x')).toBe(true)
    expect(evalPredicate({ op: 'eq', value: 'x' }, 'y')).toBe(false)
  })
  it('gt', () => {
    expect(evalPredicate({ op: 'gt', value: 2 }, 3)).toBe(true)
    expect(evalPredicate({ op: 'gt', value: 2 }, 2)).toBe(false)
    expect(evalPredicate({ op: 'gt', value: 2 }, 'nope')).toBe(false)
  })
  it('matches', () => {
    expect(evalPredicate({ op: 'matches', pattern: '^ab' }, 'abc')).toBe(true)
    expect(evalPredicate({ op: 'matches', pattern: '^ab' }, 'xab')).toBe(false)
  })
})

describe('edgeMatches', () => {
  const click: Signal = { kind: 'anchorEvent', anchor: { anchor: 'btn' }, event: 'click' }

  it('default (when-less) edge matches a manual:next signal', () => {
    const e: Edge = { to: 'x' }
    expect(edgeMatches(e, { kind: 'manual', control: 'next' }, () => undefined)).toBe(true)
  })
  it('default edge matches an effectDone signal', () => {
    const e: Edge = { to: 'x' }
    expect(edgeMatches(e, { kind: 'effectDone' }, () => undefined)).toBe(true)
  })
  it('default edge does NOT match a back signal', () => {
    const e: Edge = { to: 'x' }
    expect(edgeMatches(e, { kind: 'manual', control: 'back' }, () => undefined)).toBe(false)
  })
  it('anchorEvent edge matches a matching anchor+event', () => {
    const e: Edge = { to: 'x', when: { kind: 'anchorEvent', anchor: { anchor: 'btn' }, event: 'click' } }
    expect(edgeMatches(e, click, () => undefined)).toBe(true)
  })
  it('anchorEvent edge rejects a different anchor', () => {
    const e: Edge = { to: 'x', when: { kind: 'anchorEvent', anchor: { anchor: 'other' }, event: 'click' } }
    expect(edgeMatches(e, click, () => undefined)).toBe(false)
  })
  it('state edge matches when predicate passes against signal value', () => {
    const e: Edge = { to: 'x', when: { kind: 'state', probe: 'count', predicate: { op: 'gt', value: 0 } } }
    const sig: Signal = { kind: 'state', probe: 'count', value: 5 }
    expect(edgeMatches(e, sig, () => undefined)).toBe(true)
  })
  it('state edge reads probe value when signal carries none (branch entry)', () => {
    const e: Edge = { to: 'x', when: { kind: 'state', probe: 'count', predicate: { op: 'gt', value: 0 } } }
    expect(edgeMatches(e, { kind: 'effectDone' }, (id) => (id === 'count' ? 7 : undefined))).toBe(true)
  })
  it('timeout edge matches a timeout signal', () => {
    const e: Edge = { to: 'x', when: { kind: 'timeout', ms: 100 } }
    expect(edgeMatches(e, { kind: 'timeout' }, () => undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/walkthrough/transitions.test.ts`
Expected: FAIL — cannot resolve `./transitions`.

- [ ] **Step 3: Write the helpers**

Create `src/shared/walkthrough/transitions.ts`:

```ts
import type { Edge, Signal, SerializablePredicate } from './types'

export function evalPredicate(pred: SerializablePredicate, value: unknown): boolean {
  switch (pred.op) {
    case 'truthy':
      return Boolean(value)
    case 'eq':
      return value === pred.value
    case 'gt':
      return typeof value === 'number' && value > pred.value
    case 'matches':
      return typeof value === 'string' && new RegExp(pred.pattern).test(value)
  }
}

function sameAnchor(a: { anchor: string } | { selector: string }, b: typeof a): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Does this edge fire for the given signal? `readProbe` supplies the current value for
 * `state` conditions whose signal carries no value (e.g. when re-evaluated on node entry).
 */
export function edgeMatches(
  edge: Edge,
  signal: Signal,
  readProbe: (id: string) => unknown
): boolean {
  const w = edge.when
  // Default (unconditional) edge: the "Next" / effect-complete transition.
  if (!w) {
    return (
      signal.kind === 'effectDone' || (signal.kind === 'manual' && signal.control === 'next')
    )
  }
  switch (w.kind) {
    case 'manual':
      return signal.kind === 'manual' && signal.control === w.control
    case 'anchorEvent':
      return (
        signal.kind === 'anchorEvent' &&
        signal.event === w.event &&
        sameAnchor(signal.anchor, w.anchor)
      )
    case 'timeout':
      return signal.kind === 'timeout'
    case 'state': {
      if (signal.kind === 'state') {
        if (w.probe !== undefined && signal.probe !== w.probe) return false
        if (w.event !== undefined && signal.event !== w.event) return false
        return evalPredicate(w.predicate, signal.value)
      }
      // No state signal: evaluate against the current probe value (branch entry).
      if (w.probe !== undefined) return evalPredicate(w.predicate, readProbe(w.probe))
      return false
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/walkthrough/transitions.test.ts`
Expected: PASS (12 assertions across the cases).

- [ ] **Step 5: Commit**

```bash
git add src/shared/walkthrough/transitions.ts src/shared/walkthrough/transitions.test.ts
git commit -m "feat(walkthrough): add predicate and edge-matching helpers"
```

---

## Task 4: Engine — start, subscribe, linear transitions

**Files:**
- Create: `src/shared/walkthrough/engine.ts`
- Test: `src/shared/walkthrough/engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/walkthrough/engine.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createEngine } from './engine'
import { LINEAR } from './fixtures'
import type { EngineHost, EngineState } from './types'

function fakeHost(overrides: Partial<EngineHost> = {}): EngineHost {
  return {
    readProbe: () => undefined,
    runIntent: vi.fn(async () => {}),
    saveInProgress: vi.fn(),
    markSeen: vi.fn(),
    ...overrides
  }
}

describe('engine — linear flow', () => {
  it('starts at the entry node and emits running/waiting state', () => {
    const engine = createEngine(fakeHost())
    const states: EngineState[] = []
    engine.subscribe((s) => states.push(s))
    engine.start(LINEAR)
    const last = states.at(-1)!
    expect(last.walkthroughId).toBe('linear')
    expect(last.node?.id).toBe('a')
    expect(last.status).toBe('waiting')
  })

  it('advances to the next node on a manual Next signal', () => {
    const engine = createEngine(fakeHost())
    engine.start(LINEAR)
    engine.signal({ kind: 'manual', control: 'next' })
    expect(engine.getState().node?.id).toBe('b')
  })

  it('reaches the end node, marks seen, clears in-progress, status done', () => {
    const host = fakeHost()
    const engine = createEngine(host)
    engine.start(LINEAR)
    engine.signal({ kind: 'manual', control: 'next' }) // a -> b
    engine.signal({ kind: 'manual', control: 'next' }) // b -> done (end)
    expect(engine.getState().status).toBe('done')
    expect(host.markSeen).toHaveBeenCalledWith('linear', '1')
    expect(host.saveInProgress).toHaveBeenLastCalledWith(null)
  })

  it('can start from an arbitrary node (resume)', () => {
    const engine = createEngine(fakeHost())
    engine.start(LINEAR, { fromNode: 'b' })
    expect(engine.getState().node?.id).toBe('b')
  })

  it('persists in-progress position on each transition', () => {
    const host = fakeHost()
    const engine = createEngine(host)
    engine.start(LINEAR)
    expect(host.saveInProgress).toHaveBeenCalledWith({ id: 'linear', nodeId: 'a', vars: {} })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/walkthrough/engine.test.ts`
Expected: FAIL — cannot resolve `./engine`.

- [ ] **Step 3: Write the engine (linear core)**

Create `src/shared/walkthrough/engine.ts`:

```ts
import type {
  EngineHost,
  EngineState,
  InProgress,
  NodeId,
  Signal,
  Walkthrough,
  WalkNode
} from './types'
import { edgeMatches } from './transitions'

export interface Engine {
  start(wt: Walkthrough, opts?: { fromNode?: NodeId; vars?: Record<string, unknown> }): void
  signal(sig: Signal): void
  getState(): EngineState
  subscribe(cb: (state: EngineState) => void): () => void
  skipNode(): void
  exit(): void
}

const IDLE: EngineState = {
  walkthroughId: null,
  node: null,
  status: 'idle',
  vars: {},
  recovery: null,
  pendingTimeoutMs: null
}

export function createEngine(host: EngineHost): Engine {
  let wt: Walkthrough | null = null
  let state: EngineState = { ...IDLE }
  const subs = new Set<(s: EngineState) => void>()

  function emit(): void {
    const snapshot = state
    for (const cb of subs) cb(snapshot)
  }

  function timeoutOf(node: WalkNode): number | null {
    const edge = node.edges.find((e) => e.when?.kind === 'timeout')
    if (edge && edge.when?.kind === 'timeout') return edge.when.ms
    return null
  }

  /** Enter a node: persist, set state, and run any entry behavior. */
  function enter(id: NodeId): void {
    const node = wt!.nodes[id]
    state = {
      ...state,
      node,
      recovery: null,
      pendingTimeoutMs: node.kind === 'end' ? null : timeoutOf(node),
      status: node.kind === 'end' ? 'done' : 'waiting'
    }

    if (node.kind === 'end') {
      host.saveInProgress(null)
      host.markSeen(wt!.id, wt!.version)
      emit()
      return
    }

    host.saveInProgress({ id: wt!.id, nodeId: id, vars: state.vars })
    emit()
    // Entry behavior for auto-advancing nodes is added in later tasks.
  }

  function transition(sig: Signal): void {
    const node = state.node
    if (!node) return
    const edge = node.edges.find((e) => edgeMatches(e, sig, host.readProbe))
    if (edge) enter(edge.to)
  }

  return {
    start(next, opts) {
      wt = next
      state = { ...IDLE, walkthroughId: next.id, status: 'running', vars: opts?.vars ?? {} }
      enter(opts?.fromNode ?? next.entry)
    },
    signal(sig) {
      transition(sig)
    },
    getState() {
      return state
    },
    subscribe(cb) {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    skipNode() {
      // Filled in Task 7.
    },
    exit() {
      // Filled in Task 7.
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/walkthrough/engine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/walkthrough/engine.ts src/shared/walkthrough/engine.test.ts
git commit -m "feat(walkthrough): add engine core with linear transitions and persistence"
```

---

## Task 5: Engine — branch, intent, and demo entry behavior

**Files:**
- Modify: `src/shared/walkthrough/engine.ts`
- Test: `src/shared/walkthrough/engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/shared/walkthrough/engine.test.ts`:

```ts
import { BRANCHING } from './fixtures'
import type { Walkthrough } from './types'

describe('engine — branch nodes', () => {
  it('routes immediately on entry using probe values (count>0 -> hi)', () => {
    const engine = createEngine(fakeHost({ readProbe: (id) => (id === 'count' ? 3 : undefined) }))
    engine.start(BRANCHING)
    expect(engine.getState().node?.id).toBe('hi')
  })
  it('falls through to the default edge when no condition matches (count=0 -> lo)', () => {
    const engine = createEngine(fakeHost({ readProbe: () => 0 }))
    engine.start(BRANCHING)
    expect(engine.getState().node?.id).toBe('lo')
  })
})

const INTENT_WT: Walkthrough = {
  id: 'intent',
  version: '1',
  entry: 'go',
  nodes: {
    go: { id: 'go', kind: 'intent', intent: 'navigate', args: 'history', edges: [{ to: 'done' }] },
    done: { id: 'done', kind: 'end', edges: [] }
  }
}

describe('engine — intent nodes', () => {
  it('invokes the intent then auto-advances via the default edge', async () => {
    const runIntent = vi.fn(async () => {})
    const engine = createEngine(fakeHost({ runIntent }))
    engine.start(INTENT_WT)
    expect(runIntent).toHaveBeenCalledWith('navigate', 'history')
    await Promise.resolve() // let the intent promise resolve
    expect(engine.getState().node?.id).toBe('done')
  })
})

describe('engine — demo nodes', () => {
  it('waits for an external effectDone signal (overlay plays the illusion)', () => {
    const wt: Walkthrough = {
      id: 'demo',
      version: '1',
      entry: 'd',
      nodes: {
        d: { id: 'd', kind: 'demo', ops: [{ op: 'pause', ms: 1 }], edges: [{ to: 'done' }] },
        done: { id: 'done', kind: 'end', edges: [] }
      }
    }
    const engine = createEngine(fakeHost())
    engine.start(wt)
    expect(engine.getState().node?.id).toBe('d') // still waiting
    engine.signal({ kind: 'effectDone' })
    expect(engine.getState().node?.id).toBe('done')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/shared/walkthrough/engine.test.ts`
Expected: FAIL — branch stays on `decide`; intent never advances.

- [ ] **Step 3: Add entry behavior**

In `src/shared/walkthrough/engine.ts`, replace the comment line `// Entry behavior for auto-advancing nodes is added in later tasks.` at the end of `enter()` with:

```ts
    if (node.kind === 'branch') {
      // Pure decision node: evaluate edges against current probe values and route now.
      const edge = node.edges.find((e) => edgeMatches(e, { kind: 'effectDone' }, host.readProbe))
      if (edge) enter(edge.to)
      return
    }
    if (node.kind === 'intent') {
      void host.runIntent(node.intent, node.args).then(() => {
        // Only advance if we are still on this node (user may have exited meanwhile).
        if (state.node?.id === id) transition({ kind: 'effectDone' })
      })
    }
    // 'demo' and 'step' nodes wait for a signal (effectDone / manual / anchorEvent / state).
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/shared/walkthrough/engine.test.ts`
Expected: PASS (all engine tests, including the new branch/intent/demo cases).

- [ ] **Step 5: Commit**

```bash
git add src/shared/walkthrough/engine.ts src/shared/walkthrough/engine.test.ts
git commit -m "feat(walkthrough): add branch routing, intent invocation, demo wait"
```

---

## Task 6: Engine — conditional/anchor/state/timeout edges

**Files:**
- Test: `src/shared/walkthrough/engine.test.ts`

This task adds no engine code (Task 4's `transition()` already delegates to `edgeMatches`). It locks the behavior with integration-level tests so later refactors can't regress it.

- [ ] **Step 1: Add tests**

Append to `src/shared/walkthrough/engine.test.ts`:

```ts
describe('engine — conditional edges end to end', () => {
  const wt: Walkthrough = {
    id: 'cond',
    version: '1',
    entry: 'start',
    nodes: {
      start: {
        id: 'start',
        kind: 'step',
        modality: 'passthrough',
        body: 'b',
        edges: [
          { to: 'clicked', when: { kind: 'anchorEvent', anchor: { anchor: 'go' }, event: 'click' } },
          { to: 'changed', when: { kind: 'state', probe: 'jobs', predicate: { op: 'gt', value: 0 } } },
          { to: 'timedout', when: { kind: 'timeout', ms: 50 } }
        ]
      },
      clicked: { id: 'clicked', kind: 'end', edges: [] },
      changed: { id: 'changed', kind: 'end', edges: [] },
      timedout: { id: 'timedout', kind: 'end', edges: [] }
    }
  }

  it('takes the anchorEvent edge on a matching click', () => {
    const engine = createEngine(fakeHost())
    engine.start(wt)
    engine.signal({ kind: 'anchorEvent', anchor: { anchor: 'go' }, event: 'click' })
    expect(engine.getState().node?.id).toBe('clicked')
  })

  it('takes the state edge when the predicate passes', () => {
    const engine = createEngine(fakeHost())
    engine.start(wt)
    engine.signal({ kind: 'state', probe: 'jobs', value: 2 })
    expect(engine.getState().node?.id).toBe('changed')
  })

  it('exposes pendingTimeoutMs and takes the timeout edge on a timeout signal', () => {
    const engine = createEngine(fakeHost())
    engine.start(wt)
    expect(engine.getState().pendingTimeoutMs).toBe(50)
    engine.signal({ kind: 'timeout' })
    expect(engine.getState().node?.id).toBe('timedout')
  })

  it('ignores a non-matching state signal', () => {
    const engine = createEngine(fakeHost())
    engine.start(wt)
    engine.signal({ kind: 'state', probe: 'jobs', value: 0 })
    expect(engine.getState().node?.id).toBe('start')
  })
})
```

- [ ] **Step 2: Run tests**

Run: `pnpm test src/shared/walkthrough/engine.test.ts`
Expected: PASS (the new cases pass with no engine changes).

- [ ] **Step 3: Commit**

```bash
git add src/shared/walkthrough/engine.test.ts
git commit -m "test(walkthrough): lock conditional anchor/state/timeout transitions"
```

---

## Task 7: Engine — recovery, skip, and exit

**Files:**
- Modify: `src/shared/walkthrough/engine.ts`
- Test: `src/shared/walkthrough/engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/shared/walkthrough/engine.test.ts`:

```ts
describe('engine — recovery and controls', () => {
  function strayWt(recovery: Partial<Record<'onError' | 'onTimeout' | 'onStray', string>>): Walkthrough {
    return {
      id: 'rec',
      version: '1',
      entry: 's',
      nodes: {
        s: {
          id: 's',
          kind: 'step',
          modality: 'block',
          body: 'b',
          edges: [{ to: 'ok' }],
          ...recovery
        },
        ok: { id: 'ok', kind: 'end', edges: [] },
        safe: { id: 'safe', kind: 'end', edges: [] }
      }
    }
  }

  it('routes anchorError to onError when authored', () => {
    const engine = createEngine(fakeHost())
    engine.start(strayWt({ onError: 'safe' }))
    engine.signal({ kind: 'anchorError' })
    expect(engine.getState().node?.id).toBe('safe')
  })

  it('enters recovery state when no onError edge is authored', () => {
    const engine = createEngine(fakeHost())
    engine.start(strayWt({}))
    engine.signal({ kind: 'anchorError' })
    expect(engine.getState().recovery).toEqual({ reason: 'error' })
    expect(engine.getState().status).toBe('error')
  })

  it('routes stray to onStray and timeout to onTimeout when authored', () => {
    const e1 = createEngine(fakeHost())
    e1.start(strayWt({ onStray: 'safe' }))
    e1.signal({ kind: 'stray' })
    expect(e1.getState().node?.id).toBe('safe')

    const e2 = createEngine(fakeHost())
    e2.start(strayWt({ onTimeout: 'safe' }))
    e2.signal({ kind: 'timeout' }) // no timeout edge on node -> onTimeout
    expect(e2.getState().node?.id).toBe('safe')
  })

  it('skipNode takes the default edge out of recovery', () => {
    const engine = createEngine(fakeHost())
    engine.start(strayWt({}))
    engine.signal({ kind: 'anchorError' }) // -> recovery
    engine.skipNode()
    expect(engine.getState().node?.id).toBe('ok')
  })

  it('exit clears progress and goes idle', () => {
    const host = fakeHost()
    const engine = createEngine(host)
    engine.start(strayWt({}))
    engine.exit()
    expect(engine.getState().status).toBe('idle')
    expect(host.saveInProgress).toHaveBeenLastCalledWith(null)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/shared/walkthrough/engine.test.ts`
Expected: FAIL — recovery routing/skip/exit not implemented.

- [ ] **Step 3: Implement recovery, skip, exit**

In `src/shared/walkthrough/engine.ts`, replace the `transition` function with this version (adds recovery routing for the special signals before normal edge matching):

```ts
  function recover(reason: 'error' | 'timeout' | 'stray', target?: NodeId): void {
    if (target) {
      enter(target)
      return
    }
    state = { ...state, status: 'error', recovery: { reason }, pendingTimeoutMs: null }
    emit()
  }

  function transition(sig: Signal): void {
    const node = state.node
    if (!node) return

    if (sig.kind === 'anchorError') return recover('error', node.onError)
    if (sig.kind === 'stray') return recover('stray', node.onStray)
    if (sig.kind === 'timeout' && !node.edges.some((e) => e.when?.kind === 'timeout')) {
      return recover('timeout', node.onTimeout)
    }

    const edge = node.edges.find((e) => edgeMatches(e, sig, host.readProbe))
    if (edge) enter(edge.to)
  }
```

Then replace the `skipNode` and `exit` stubs in the returned object with:

```ts
    skipNode() {
      const node = state.node
      if (!node) return
      const def = node.edges.find((e) => !e.when)
      if (def) enter(def.to)
      else this.exit()
    },
    exit() {
      host.saveInProgress(null)
      state = { ...IDLE }
      emit()
    }
```

> Note: `skipNode` references `this.exit()`; the returned object is a plain object literal so `this` resolves to it. If your lint flags `this`, replace `this.exit()` with an extracted `doExit()` function shared by both.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/shared/walkthrough/engine.test.ts`
Expected: PASS (all engine tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/shared/walkthrough/engine.ts src/shared/walkthrough/engine.test.ts
git commit -m "feat(walkthrough): add graph-native recovery, skip, and exit"
```

---

## Task 8: Persistence — Settings field + IPC + preload

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/defaults.ts`
- Modify: `src/main/settings.ts` (`mergeDefaults`)
- Modify: `src/main/index.ts` (IPC handlers)
- Modify: `src/preload/index.ts` and `src/preload/index.d.ts`
- Test: `src/main/settings.test.ts`

> The `walkthroughs` field is **optional and additive**, so `mergeDefaults` (which fills
> missing keys from defaults) handles old configs with **no `Settings.version` bump**.

- [ ] **Step 1: Add the types**

In `src/shared/types.ts`, add near the other interfaces:

```ts
export interface WalkthroughInProgress {
  id: string
  nodeId: string
  vars: Record<string, unknown>
}

export interface WalkthroughState {
  /** App version last seen at launch — drives "what's new" walkthroughs. */
  lastSeenVersion: string
  /** Completed walkthrough id -> the content version completed at. */
  seen: Record<string, { version: string; at: number }>
  /** Present only while a walkthrough is mid-run. */
  inProgress?: WalkthroughInProgress
}
```

In the `Settings` interface, add (optional, last field):

```ts
  /** Walkthrough/tutorial progress. Optional + additive (no version bump needed). */
  walkthroughs?: WalkthroughState
```

- [ ] **Step 2: Add the default**

In `src/shared/defaults.ts`, inside `DEFAULT_SETTINGS`, add after `developer`:

```ts
  walkthroughs: { lastSeenVersion: '', seen: {} }
```

- [ ] **Step 3: Write a failing settings-merge test**

Append to `src/main/settings.test.ts` (match the existing import style in that file — it already imports the merge/load helpers; if `mergeDefaults` is not exported, test via the public load path used by the other tests in this file):

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/defaults'

describe('walkthroughs settings field', () => {
  it('default settings include an empty walkthroughs state', () => {
    expect(DEFAULT_SETTINGS.walkthroughs).toEqual({ lastSeenVersion: '', seen: {} })
  })
})
```

- [ ] **Step 4: Wire mergeDefaults**

In `src/main/settings.ts`, inside the object returned by `mergeDefaults`, add (before the closing of the returned object, alongside `developer`):

```ts
    walkthroughs:
      p.walkthroughs && typeof p.walkthroughs === 'object'
        ? {
            lastSeenVersion: String(p.walkthroughs.lastSeenVersion ?? ''),
            seen: p.walkthroughs.seen ?? {},
            ...(p.walkthroughs.inProgress ? { inProgress: p.walkthroughs.inProgress } : {})
          }
        : d.walkthroughs,
```

- [ ] **Step 5: Run the settings test**

Run: `pnpm test src/main/settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Add IPC handlers**

In `src/main/index.ts`, near the other `ipcMain.handle('settings:*', …)` lines (~144), add:

```ts
  ipcMain.handle('walkthrough:get', () => loadSettings().walkthroughs ?? { lastSeenVersion: '', seen: {} })
  ipcMain.handle('walkthrough:save', (_e, w) => {
    const s = loadSettings()
    saveSettings(settingsPath(), { ...s, walkthroughs: w })
  })
```

- [ ] **Step 7: Expose in preload**

In `src/preload/index.ts`, add to the `api` object (near `saveSettings`):

```ts
  getWalkthroughState: (): Promise<import('../shared/types').WalkthroughState> =>
    ipcRenderer.invoke('walkthrough:get'),
  saveWalkthroughState: (w: import('../shared/types').WalkthroughState): Promise<void> =>
    ipcRenderer.invoke('walkthrough:save', w),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
```

In `src/main/index.ts`, add the version handler near the others:

```ts
  ipcMain.handle('app:version', () => app.getVersion())
```

In `src/preload/index.d.ts`, add the matching declarations to the `plucker` API type (mirror the three methods above with their return types).

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/settings.ts src/main/settings.test.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(walkthrough): persist walkthrough progress via settings + IPC"
```

---

## Task 9: Anchor registry + useTourAnchor hook

**Files:**
- Create: `src/renderer/src/walkthrough/anchor-registry.ts`
- Create: `src/renderer/src/walkthrough/use-tour-anchor.ts`
- Test: `src/renderer/src/walkthrough/anchor-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/walkthrough/anchor-registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { registerAnchor, resolveAnchorRef, clearAnchors } from './anchor-registry'

describe('anchor-registry', () => {
  beforeEach(() => {
    clearAnchors()
    document.body.innerHTML = ''
  })

  it('resolves a registered anchor id to its element', () => {
    const el = document.createElement('button')
    const unregister = registerAnchor('go', el)
    expect(resolveAnchorRef({ anchor: 'go' })).toBe(el)
    unregister()
    expect(resolveAnchorRef({ anchor: 'go' })).toBeNull()
  })

  it('falls back to a data-tour attribute when no registration exists', () => {
    const el = document.createElement('div')
    el.setAttribute('data-tour', 'panel')
    document.body.appendChild(el)
    expect(resolveAnchorRef({ anchor: 'panel' })).toBe(el)
  })

  it('resolves a selector ref via querySelector', () => {
    const el = document.createElement('input')
    el.className = 'url-bar'
    document.body.appendChild(el)
    expect(resolveAnchorRef({ selector: '.url-bar' })).toBe(el)
  })

  it('returns null for an unknown anchor', () => {
    expect(resolveAnchorRef({ anchor: 'missing' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/walkthrough/anchor-registry.test.ts`
Expected: FAIL — cannot resolve `./anchor-registry`.

- [ ] **Step 3: Write the registry + hook**

Create `src/renderer/src/walkthrough/anchor-registry.ts`:

```ts
import type { AnchorRef } from '../../../shared/walkthrough/types'

const registry = new Map<string, Element>()

/** Register an element under an anchor id; returns an unregister fn. */
export function registerAnchor(id: string, el: Element): () => void {
  registry.set(id, el)
  return () => {
    if (registry.get(id) === el) registry.delete(id)
  }
}

export function clearAnchors(): void {
  registry.clear()
}

/** Resolve an anchor ref to a live element, or null. Order: registry, data-tour, selector. */
export function resolveAnchorRef(ref: AnchorRef): Element | null {
  if ('anchor' in ref) {
    return registry.get(ref.anchor) ?? document.querySelector(`[data-tour="${ref.anchor}"]`)
  }
  return document.querySelector(ref.selector)
}
```

Create `src/renderer/src/walkthrough/use-tour-anchor.ts`:

```ts
import { useCallback } from 'react'
import { registerAnchor } from './anchor-registry'

/**
 * Returns a ref callback that registers the element under `id` for the walkthrough
 * engine while mounted. Usage: `<button ref={useTourAnchor('download.startAll')} />`.
 */
export function useTourAnchor(id: string): (el: Element | null) => void {
  return useCallback(
    (el: Element | null) => {
      if (el) {
        const unregister = registerAnchor(id, el)
        ;(el as unknown as { __tourCleanup?: () => void }).__tourCleanup = unregister
      }
    },
    [id]
  )
}
```

> Note: the ref-callback form above registers on attach. React calls the callback with
> `null` on detach; the registry's own `registerAnchor` guard (only deletes if it still
> owns the id) keeps stale ids from lingering when a newer element registers the same id.
> For detach cleanup, also delete on `null`:

Adjust the hook body to:

```ts
  return useCallback(
    (el: Element | null) => {
      if (el) registerAnchor(id, el)
      else {
        // Detach: drop any registration for this id (re-registered on next mount).
        import('./anchor-registry').then(({ resolveAnchorRef }) => void resolveAnchorRef)
      }
    },
    [id]
  )
```

> Simpler and correct: export a `unregisterAnchor(id)` from the registry and call it on
> `null`. Add to `anchor-registry.ts`:

```ts
export function unregisterAnchor(id: string): void {
  registry.delete(id)
}
```

Final hook body:

```ts
import { useCallback } from 'react'
import { registerAnchor, unregisterAnchor } from './anchor-registry'

export function useTourAnchor(id: string): (el: Element | null) => void {
  return useCallback(
    (el: Element | null) => {
      if (el) registerAnchor(id, el)
      else unregisterAnchor(id)
    },
    [id]
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/walkthrough/anchor-registry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/walkthrough/anchor-registry.ts src/renderer/src/walkthrough/anchor-registry.test.ts src/renderer/src/walkthrough/use-tour-anchor.ts
git commit -m "feat(walkthrough): add anchor registry and useTourAnchor hook"
```

---

## Task 10: Intents registry + host adapter

**Files:**
- Create: `src/renderer/src/walkthrough/intents.ts`
- Create: `src/renderer/src/walkthrough/host-adapter.ts`
- Test: `src/renderer/src/walkthrough/host-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/walkthrough/host-adapter.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createHostAdapter } from './host-adapter'

describe('host-adapter', () => {
  it('runIntent dispatches to the registered intent handler', async () => {
    const navigate = vi.fn()
    const adapter = createHostAdapter({
      intents: { navigate },
      probes: {},
      saveInProgress: vi.fn(),
      markSeen: vi.fn()
    })
    await adapter.runIntent('navigate', 'history')
    expect(navigate).toHaveBeenCalledWith('history')
  })

  it('runIntent is a no-op (resolves) for an unknown intent', async () => {
    const adapter = createHostAdapter({
      intents: {},
      probes: {},
      saveInProgress: vi.fn(),
      markSeen: vi.fn()
    })
    await expect(adapter.runIntent('missing')).resolves.toBeUndefined()
  })

  it('readProbe returns the probe value', () => {
    const adapter = createHostAdapter({
      intents: {},
      probes: { count: () => 7 },
      saveInProgress: vi.fn(),
      markSeen: vi.fn()
    })
    expect(adapter.readProbe('count')).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/walkthrough/host-adapter.test.ts`
Expected: FAIL — cannot resolve `./host-adapter`.

- [ ] **Step 3: Write the intents registry and adapter**

Create `src/renderer/src/walkthrough/intents.ts`:

```ts
/** A vetted, side-effect-controlled action a walkthrough graph may invoke. */
export type Intent = (args?: unknown) => void | Promise<void>
export type IntentRegistry = Record<string, Intent>

/** A read-only state reader the engine can poll for branch/state conditions. */
export type Probe = () => unknown
export type ProbeRegistry = Record<string, Probe>
```

Create `src/renderer/src/walkthrough/host-adapter.ts`:

```ts
import type { EngineHost, InProgress } from '../../../shared/walkthrough/types'
import type { IntentRegistry, ProbeRegistry } from './intents'
import { resolveAnchorRef } from './anchor-registry'
import type { AnchorRef } from '../../../shared/walkthrough/types'

export interface HostAdapterConfig {
  intents: IntentRegistry
  probes: ProbeRegistry
  saveInProgress: (p: InProgress | null) => void
  markSeen: (id: string, version: string) => void
}

/** The renderer's EngineHost. Also exposes resolveAnchor for the overlay. */
export interface HostAdapter extends EngineHost {
  resolveAnchor(ref: AnchorRef): Element | null
}

export function createHostAdapter(cfg: HostAdapterConfig): HostAdapter {
  return {
    readProbe: (id) => cfg.probes[id]?.(),
    runIntent: async (id, args) => {
      await cfg.intents[id]?.(args)
    },
    saveInProgress: cfg.saveInProgress,
    markSeen: cfg.markSeen,
    resolveAnchor: (ref) => resolveAnchorRef(ref)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/walkthrough/host-adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/walkthrough/intents.ts src/renderer/src/walkthrough/host-adapter.ts src/renderer/src/walkthrough/host-adapter.test.ts
git commit -m "feat(walkthrough): add intents registry and renderer host adapter"
```

---

## Task 11: Overlay — spotlight, coach-mark, ghost-cursor, layer

**Files:**
- Create: `src/renderer/src/walkthrough/spotlight.tsx`
- Create: `src/renderer/src/walkthrough/coach-mark.tsx`
- Create: `src/renderer/src/walkthrough/ghost-cursor.tsx`
- Create: `src/renderer/src/walkthrough/walkthrough-layer.tsx`
- Test: `src/renderer/src/walkthrough/walkthrough-layer.test.tsx`

- [ ] **Step 1: Write the presentational components**

Create `src/renderer/src/walkthrough/spotlight.tsx`:

```tsx
import React from 'react'

/** Dim backdrop with a rectangular cutout around the target rect. */
export function Spotlight({ rect, block }: { rect: DOMRect | null; block: boolean }): React.JSX.Element {
  // Four dim panels around the cutout; in passthrough mode the panels don't eat clicks.
  const pe = block ? 'auto' : 'none'
  if (!rect) {
    return <div className="fixed inset-0 z-[900] bg-black/40" style={{ pointerEvents: pe }} />
  }
  const panel = (style: React.CSSProperties): React.JSX.Element => (
    <div className="fixed z-[900] bg-black/40" style={{ ...style, pointerEvents: pe }} />
  )
  return (
    <>
      {panel({ left: 0, top: 0, right: 0, height: rect.top })}
      {panel({ left: 0, top: rect.bottom, right: 0, bottom: 0 })}
      {panel({ left: 0, top: rect.top, width: rect.left, height: rect.height })}
      {panel({ right: 0, top: rect.top, left: rect.right, height: rect.height })}
    </>
  )
}
```

Create `src/renderer/src/walkthrough/coach-mark.tsx`:

```tsx
import React from 'react'
import { useTranslation } from 'react-i18next'

export interface CoachMarkProps {
  rect: DOMRect | null
  title?: string
  body: string
  onNext?: () => void
  onBack?: () => void
  onExit: () => void
  recovery: boolean
}

/** A small positioned card. Falls back to screen-center when there is no anchor rect. */
export function CoachMark(props: CoachMarkProps): React.JSX.Element {
  const { t } = useTranslation()
  const { rect, title, body, onNext, onBack, onExit, recovery } = props
  const style: React.CSSProperties = rect
    ? { position: 'fixed', top: rect.bottom + 8, left: rect.left }
    : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
  return (
    <div
      role="dialog"
      style={style}
      className="z-[950] max-w-[320px] rounded-[10px] border border-line bg-surface p-3 text-[13px] text-ink shadow-lg"
    >
      {title && <div className="mb-1 font-semibold">{t(title)}</div>}
      <div className="text-ink-dim">{t(body)}</div>
      <div className="mt-2 flex justify-end gap-1.5">
        {recovery && (
          <button className="rounded px-2 py-1 text-[12px] text-ink-dim hover:bg-raise" onClick={onNext}>
            {t('walkthrough.skip')}
          </button>
        )}
        {onBack && (
          <button className="rounded px-2 py-1 text-[12px] text-ink-dim hover:bg-raise" onClick={onBack}>
            {t('walkthrough.back')}
          </button>
        )}
        <button className="rounded px-2 py-1 text-[12px] text-ink-dim hover:bg-raise" onClick={onExit}>
          {t('walkthrough.exit')}
        </button>
        {onNext && !recovery && (
          <button className="rounded bg-accent px-3 py-1 text-[12px] font-semibold text-white" onClick={onNext}>
            {t('walkthrough.next')}
          </button>
        )}
      </div>
    </div>
  )
}
```

Create `src/renderer/src/walkthrough/ghost-cursor.tsx`:

```tsx
import React from 'react'

/** A fake cursor dot rendered at (x,y); purely visual (illusion demos). */
export function GhostCursor({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-[960] h-3 w-3 rounded-full bg-accent shadow"
      style={{ left: x, top: y, transition: 'left 300ms ease, top 300ms ease' }}
    />
  )
}
```

- [ ] **Step 2: Write the failing layer test**

Create `src/renderer/src/walkthrough/walkthrough-layer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '../i18n'
import { WalkthroughLayer } from './walkthrough-layer'
import { createEngine } from '../../../shared/walkthrough/engine'
import { registerAnchor, clearAnchors } from './anchor-registry'
import type { EngineHost, Walkthrough } from '../../../shared/walkthrough/types'

function host(): EngineHost {
  return { readProbe: () => undefined, runIntent: async () => {}, saveInProgress: vi.fn(), markSeen: vi.fn() }
}

const WT: Walkthrough = {
  id: 'w',
  version: '1',
  entry: 'a',
  nodes: {
    a: {
      id: 'a',
      kind: 'step',
      modality: 'passthrough',
      body: 'walkthrough.test.body',
      anchor: { anchor: 'btn' },
      edges: [{ to: 'done', when: { kind: 'anchorEvent', anchor: { anchor: 'btn' }, event: 'click' } }]
    },
    done: { id: 'done', kind: 'end', edges: [] }
  }
}

describe('WalkthroughLayer', () => {
  beforeEach(() => clearAnchors())

  it('renders the coach-mark body for the current step', () => {
    const engine = createEngine(host())
    render(<WalkthroughLayer engine={engine} resolveAnchor={() => null} />)
    engine.start(WT)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('forwards a click on the resolved anchor as an anchorEvent and advances', async () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    registerAnchor('btn', btn)
    const engine = createEngine(host())
    render(<WalkthroughLayer engine={engine} resolveAnchor={() => btn} />)
    engine.start(WT)
    fireEvent.click(btn)
    await waitFor(() => expect(engine.getState().status).toBe('done'))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/renderer/src/walkthrough/walkthrough-layer.test.tsx`
Expected: FAIL — cannot resolve `./walkthrough-layer`.

- [ ] **Step 4: Write the layer**

Create `src/renderer/src/walkthrough/walkthrough-layer.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react'
import { Spotlight } from './spotlight'
import { CoachMark } from './coach-mark'
import type { AnchorRef, EngineState } from '../../../shared/walkthrough/types'
import type { Engine } from '../../../shared/walkthrough/engine'

const ANCHOR_RETRY_MS = 2000

export interface WalkthroughLayerProps {
  engine: Engine
  resolveAnchor: (ref: AnchorRef) => Element | null
}

/** The single body-level overlay. Subscribes to engine state and renders the active node. */
export function WalkthroughLayer({ engine, resolveAnchor }: WalkthroughLayerProps): React.JSX.Element | null {
  const [state, setState] = useState<EngineState>(engine.getState())
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => engine.subscribe(setState), [engine])

  const node = state.node
  const anchor: AnchorRef | undefined =
    node?.kind === 'step' ? node.anchor : undefined

  // Resolve the current node's anchor with a retry window; attach a listener for the
  // node's anchorEvent edge; report failure to the engine for graph-native recovery.
  useEffect(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setRect(null)
    if (!node || node.kind !== 'step' || !anchor) return

    const evEdge = node.edges.find((e) => e.when?.kind === 'anchorEvent')
    const start = performance.now()
    let raf = 0
    const tick = (): void => {
      const el = resolveAnchor(anchor)
      if (el) {
        setRect(el.getBoundingClientRect())
        if (evEdge && evEdge.when?.kind === 'anchorEvent') {
          const type = evEdge.when.event
          const handler = (): void =>
            engine.signal({ kind: 'anchorEvent', anchor, event: type })
          el.addEventListener(type, handler)
          cleanupRef.current = () => el.removeEventListener(type, handler)
        }
        return
      }
      if (performance.now() - start > ANCHOR_RETRY_MS) {
        engine.signal({ kind: 'anchorError' })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine, node, anchor, resolveAnchor])

  // Reposition the cutout/card on scroll + resize while a step is anchored.
  useEffect(() => {
    if (!anchor) return
    const update = (): void => {
      const el = resolveAnchor(anchor)
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor, resolveAnchor])

  // Drive the node's timeout window.
  useEffect(() => {
    if (state.pendingTimeoutMs == null) return
    const t = setTimeout(() => engine.signal({ kind: 'timeout' }), state.pendingTimeoutMs)
    return () => clearTimeout(t)
  }, [engine, state.pendingTimeoutMs, node])

  if (!node || (state.status !== 'waiting' && state.status !== 'error')) return null
  if (node.kind !== 'step') return null

  const block = node.modality === 'block'
  const hasDefault = node.edges.some((e) => !e.when)
  return (
    <>
      <Spotlight rect={rect} block={block} />
      <CoachMark
        rect={rect}
        title={node.title}
        body={node.body}
        recovery={state.recovery != null}
        onNext={hasDefault || state.recovery ? () => (state.recovery ? engine.skipNode() : engine.signal({ kind: 'manual', control: 'next' })) : undefined}
        onExit={() => engine.exit()}
      />
    </>
  )
}
```

> Demo/intent/branch nodes have no `step` UI (intent/branch are instantaneous; demo is
> driven by `ghost-cursor` playback). Playback of `DemoNode.ops` (moving `GhostCursor`,
> then `engine.signal({kind:'effectDone'})`) is wired when the first demo-using
> walkthrough is authored; the engine already waits correctly for `effectDone`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/renderer/src/walkthrough/walkthrough-layer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/walkthrough/spotlight.tsx src/renderer/src/walkthrough/coach-mark.tsx src/renderer/src/walkthrough/ghost-cursor.tsx src/renderer/src/walkthrough/walkthrough-layer.tsx src/renderer/src/walkthrough/walkthrough-layer.test.tsx
git commit -m "feat(walkthrough): add overlay layer with spotlight, coach-mark, anchor resolution"
```

---

## Task 12: Launch-trigger logic (pure)

**Files:**
- Create: `src/renderer/src/walkthrough/triggers.ts`
- Test: `src/renderer/src/walkthrough/triggers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/walkthrough/triggers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decideLaunchWalkthrough } from './triggers'
import type { WalkthroughState } from '../../../shared/types'

const manifest = [
  { id: 'getting-started', version: '1', trigger: { kind: 'firstRun' as const } },
  { id: 'whats-new-0-21', version: '1', trigger: { kind: 'version' as const, minVersion: '0.21.0' } }
]

describe('decideLaunchWalkthrough', () => {
  it('resumes when an in-progress run exists', () => {
    const st: WalkthroughState = { lastSeenVersion: '0.20.0', seen: {}, inProgress: { id: 'x', nodeId: 'n', vars: {} } }
    expect(decideLaunchWalkthrough(manifest, st, '0.21.0')).toEqual({ kind: 'resume', inProgress: st.inProgress })
  })

  it('starts the firstRun walkthrough on a fresh install', () => {
    const st: WalkthroughState = { lastSeenVersion: '', seen: {} }
    expect(decideLaunchWalkthrough(manifest, st, '0.21.0')).toEqual({ kind: 'start', id: 'getting-started' })
  })

  it('starts a version walkthrough after an update past its minVersion', () => {
    const st: WalkthroughState = { lastSeenVersion: '0.20.0', seen: { 'getting-started': { version: '1', at: 1 } } }
    expect(decideLaunchWalkthrough(manifest, st, '0.21.0')).toEqual({ kind: 'start', id: 'whats-new-0-21' })
  })

  it('does nothing when everything relevant is already seen', () => {
    const st: WalkthroughState = {
      lastSeenVersion: '0.21.0',
      seen: { 'getting-started': { version: '1', at: 1 }, 'whats-new-0-21': { version: '1', at: 1 } }
    }
    expect(decideLaunchWalkthrough(manifest, st, '0.21.0')).toEqual({ kind: 'none' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/walkthrough/triggers.test.ts`
Expected: FAIL — cannot resolve `./triggers`.

- [ ] **Step 3: Write the trigger logic**

Create `src/renderer/src/walkthrough/triggers.ts`:

```ts
import type { WalkthroughState, WalkthroughInProgress } from '../../../shared/types'

export type Trigger =
  | { kind: 'firstRun' }
  | { kind: 'version'; minVersion: string }
  | { kind: 'contextual'; probe: string }
  | { kind: 'manual' }

export interface ManifestEntry {
  id: string
  version: string
  trigger: Trigger
}

export type LaunchDecision =
  | { kind: 'resume'; inProgress: WalkthroughInProgress }
  | { kind: 'start'; id: string }
  | { kind: 'none' }

/** Compare dotted semver-ish strings; '' sorts lowest. Returns -1/0/1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export function decideLaunchWalkthrough(
  manifest: ManifestEntry[],
  state: WalkthroughState,
  appVersion: string
): LaunchDecision {
  if (state.inProgress) return { kind: 'resume', inProgress: state.inProgress }

  const firstRun = state.lastSeenVersion === '' && Object.keys(state.seen).length === 0
  if (firstRun) {
    const entry = manifest.find((m) => m.trigger.kind === 'firstRun' && !state.seen[m.id])
    if (entry) return { kind: 'start', id: entry.id }
  }

  for (const m of manifest) {
    if (m.trigger.kind !== 'version') continue
    if (state.seen[m.id]) continue
    // Fire only when the app has reached/passed minVersion AND this is a new launch
    // (lastSeenVersion below minVersion), so a fresh install doesn't replay history.
    const reached = compareVersions(appVersion, m.trigger.minVersion) >= 0
    const isNew = compareVersions(state.lastSeenVersion, m.trigger.minVersion) < 0
    if (reached && isNew) return { kind: 'start', id: m.id }
  }
  return { kind: 'none' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/walkthrough/triggers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/walkthrough/triggers.ts src/renderer/src/walkthrough/triggers.test.ts
git commit -m "feat(walkthrough): add pure launch-trigger decision logic"
```

---

## Task 13: Content manifest + sample graph + shipped-graph validation

**Files:**
- Create: `src/renderer/src/walkthrough/content/getting-started.ts`
- Create: `src/renderer/src/walkthrough/content/manifest.ts`
- Test: `src/renderer/src/walkthrough/content/manifest.test.ts`

- [ ] **Step 1: Write the sample graph**

Create `src/renderer/src/walkthrough/content/getting-started.ts`:

```ts
import type { Walkthrough } from '../../../../shared/walkthrough/types'

/** Minimal seed walkthrough. Real content is authored later; this proves the pipeline. */
export const gettingStarted: Walkthrough = {
  id: 'getting-started',
  version: '1',
  entry: 'welcome',
  nodes: {
    welcome: {
      id: 'welcome',
      kind: 'step',
      modality: 'block',
      title: 'walkthrough.gettingStarted.welcome.title',
      body: 'walkthrough.gettingStarted.welcome.body',
      edges: [{ to: 'done' }]
    },
    done: { id: 'done', kind: 'end', edges: [] }
  }
}
```

- [ ] **Step 2: Write the manifest**

Create `src/renderer/src/walkthrough/content/manifest.ts`:

```ts
import type { Walkthrough } from '../../../../shared/walkthrough/types'
import type { ManifestEntry } from '../triggers'
import { gettingStarted } from './getting-started'

/** Every shipped walkthrough graph, keyed by id. */
export const WALKTHROUGHS: Record<string, Walkthrough> = {
  [gettingStarted.id]: gettingStarted
}

/** Declarative trigger table consumed by decideLaunchWalkthrough. */
export const MANIFEST: ManifestEntry[] = [
  { id: 'getting-started', version: '1', trigger: { kind: 'firstRun' } }
]
```

- [ ] **Step 3: Write the validation test**

Create `src/renderer/src/walkthrough/content/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { WALKTHROUGHS, MANIFEST } from './manifest'
import { validateWalkthrough } from '../../../../shared/walkthrough/validate'

describe('shipped walkthroughs', () => {
  it('every graph passes structural validation', () => {
    for (const [id, wt] of Object.entries(WALKTHROUGHS)) {
      expect(validateWalkthrough(wt), `walkthrough "${id}"`).toEqual([])
    }
  })

  it('every manifest entry has a matching graph', () => {
    for (const entry of MANIFEST) {
      expect(WALKTHROUGHS[entry.id], `manifest id "${entry.id}"`).toBeDefined()
    }
  })
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/walkthrough/content/manifest.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/walkthrough/content
git commit -m "feat(walkthrough): add content manifest, sample graph, shipped-graph validation"
```

---

## Task 14: Provider + app integration + Help menu + i18n

**Files:**
- Create: `src/renderer/src/walkthrough/walkthrough-provider.tsx`
- Modify: `src/renderer/src/app.tsx`
- Modify: `src/renderer/src/i18n/locales/en.ts`
- Modify: `src/renderer/src/i18n/locales/de.ts`

- [ ] **Step 1: Add i18n strings**

In `src/renderer/src/i18n/locales/en.ts`, add a top-level `walkthrough` key:

```ts
  walkthrough: {
    next: 'Next',
    back: 'Back',
    skip: 'Skip',
    exit: 'Exit',
    resume: 'Resume tour',
    dismiss: 'Dismiss',
    resumeBanner: 'You have an unfinished walkthrough. Resume it?',
    gettingStarted: {
      welcome: { title: 'Welcome to Plucker', body: 'Let’s take a quick tour of the basics.' }
    },
    test: { body: 'test body' }
  },
```

In `src/renderer/src/i18n/locales/de.ts`, add the German equivalents:

```ts
  walkthrough: {
    next: 'Weiter',
    back: 'Zurück',
    skip: 'Überspringen',
    exit: 'Beenden',
    resume: 'Tour fortsetzen',
    dismiss: 'Verwerfen',
    resumeBanner: 'Du hast eine unfertige Tour. Fortsetzen?',
    gettingStarted: {
      welcome: { title: 'Willkommen bei Plucker', body: 'Eine kurze Tour durch die Grundlagen.' }
    },
    test: { body: 'test body' }
  },
```

- [ ] **Step 2: Write the provider**

Create `src/renderer/src/walkthrough/walkthrough-provider.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createEngine, type Engine } from '../../../shared/walkthrough/engine'
import { createHostAdapter } from './host-adapter'
import { WalkthroughLayer } from './walkthrough-layer'
import { WALKTHROUGHS, MANIFEST } from './content/manifest'
import { decideLaunchWalkthrough } from './triggers'
import type { IntentRegistry, ProbeRegistry } from './intents'
import type { WalkthroughState } from '../../../shared/types'

interface Ctx {
  startWalkthrough: (id: string) => void
}
const WalkthroughContext = createContext<Ctx>({ startWalkthrough: () => {} })
export const useWalkthrough = (): Ctx => useContext(WalkthroughContext)

export function WalkthroughProvider({
  intents,
  probes,
  children
}: {
  intents: IntentRegistry
  probes: ProbeRegistry
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const stateRef = useRef<WalkthroughState>({ lastSeenVersion: '', seen: {} })
  const [resumePrompt, setResumePrompt] = useState<{ id: string; nodeId: string; vars: Record<string, unknown> } | null>(null)

  const engine: Engine = useMemo(() => {
    const adapter = createHostAdapter({
      intents,
      probes,
      saveInProgress: (p) => {
        const next: WalkthroughState = { ...stateRef.current }
        if (p) next.inProgress = p
        else delete next.inProgress
        stateRef.current = next
        void window.plucker.saveWalkthroughState(next)
      },
      markSeen: (id, version) => {
        const next: WalkthroughState = {
          ...stateRef.current,
          seen: { ...stateRef.current.seen, [id]: { version, at: Date.now() } }
        }
        delete next.inProgress
        stateRef.current = next
        void window.plucker.saveWalkthroughState(next)
      }
    })
    return createEngine(adapter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = (id: string): void => {
    const wt = WALKTHROUGHS[id]
    if (wt) engine.start(wt)
  }

  // On mount: load state, stamp lastSeenVersion, decide what (if anything) to launch.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [state, appVersion] = await Promise.all([
        window.plucker.getWalkthroughState(),
        window.plucker.getAppVersion()
      ])
      if (cancelled) return
      stateRef.current = state
      const decision = decideLaunchWalkthrough(MANIFEST, state, appVersion)
      if (decision.kind === 'resume') setResumePrompt(decision.inProgress)
      else if (decision.kind === 'start') start(decision.id)
      // Stamp the last-seen version so version walkthroughs fire once.
      if (state.lastSeenVersion !== appVersion) {
        const next = { ...stateRef.current, lastSeenVersion: appVersion }
        stateRef.current = next
        void window.plucker.saveWalkthroughState(next)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ctx = useMemo(() => ({ startWalkthrough: start }), [])

  return (
    <WalkthroughContext.Provider value={ctx}>
      {resumePrompt && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border-b border-accent/30 bg-accent/[0.08] px-[18px] py-2 text-[13px] text-ink"
        >
          <span>{t('walkthrough.resumeBanner')}</span>
          <span className="flex shrink-0 gap-1.5">
            <button
              className="h-7 rounded-[7px] bg-accent px-3 text-[12px] font-semibold text-white"
              onClick={() => {
                const wt = WALKTHROUGHS[resumePrompt.id]
                if (wt) engine.start(wt, { fromNode: resumePrompt.nodeId, vars: resumePrompt.vars })
                setResumePrompt(null)
              }}
            >
              {t('walkthrough.resume')}
            </button>
            <button
              className="h-7 rounded-[7px] px-3 text-[12px] text-ink-dim hover:bg-raise"
              onClick={() => {
                void window.plucker.saveWalkthroughState({ ...stateRef.current, inProgress: undefined })
                setResumePrompt(null)
              }}
            >
              {t('walkthrough.dismiss')}
            </button>
          </span>
        </div>
      )}
      {children}
      <WalkthroughLayer engine={engine} resolveAnchor={(ref) => createHostAdapterResolve(ref)} />
    </WalkthroughContext.Provider>
  )
}

// The overlay only needs anchor resolution; reuse the shared registry resolver.
import { resolveAnchorRef } from './anchor-registry'
function createHostAdapterResolve(ref: Parameters<typeof resolveAnchorRef>[0]): Element | null {
  return resolveAnchorRef(ref)
}
```

> The `import` placed after the component is hoisted by the bundler; if your lint config
> forbids non-top imports, move `import { resolveAnchorRef } from './anchor-registry'` to
> the top of the file and pass `resolveAnchor={resolveAnchorRef}` directly to the layer,
> deleting the helper.

- [ ] **Step 3: Mount in app.tsx**

In `src/renderer/src/app.tsx`, add the import near the other walkthrough-free imports:

```ts
import { WalkthroughProvider } from './walkthrough/walkthrough-provider'
```

Wrap the root `<div className="flex h-screen flex-col …">` return so the provider is the outermost element. Change the `return (` block to:

```tsx
  return (
    <WalkthroughProvider
      intents={{
        navigate: (v) => setView(v as View),
        prefillUrl: (u) => setPrefill({ url: String(u ?? ''), nonce: ++prefillNonce.current })
      }}
      probes={{
        jobCount: () => jobs.size,
        pendingCount: () => pending.length
      }}
    >
      <div
        className="flex h-screen flex-col bg-surface text-ink"
        onContextMenu={/* …existing handler unchanged… */}
      >
        {/* …existing children unchanged… */}
      </div>
    </WalkthroughProvider>
  )
```

> Keep the existing `<div>` body and all its children exactly as they are; only the
> wrapping `<WalkthroughProvider>` and the closing tag are added. The `intents`/`probes`
> closures reference values (`setView`, `setPrefill`, `prefillNonce`, `jobs`, `pending`)
> already in scope in `App`.

- [ ] **Step 4: Add a Help-menu / manual entry point**

The app menu lives in `src/main/menu.ts` and navigation is driven via existing IPC. For
v1, add a renderer-side trigger usable from any component via the context. As the minimal
wiring, expose a keyboard-independent button in the Header is out of scope; instead verify
the manual path through the context in the next step’s typecheck. (A Help-menu item that
sends an IPC `menu:nav`-style event to call `startWalkthrough('getting-started')` is a
follow-up once menu plumbing is touched.)

- [ ] **Step 5: Typecheck + full test run**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm test`
Expected: PASS (all suites, including the new walkthrough suites).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/walkthrough/walkthrough-provider.tsx src/renderer/src/app.tsx src/renderer/src/i18n/locales/en.ts src/renderer/src/i18n/locales/de.ts
git commit -m "feat(walkthrough): wire provider, triggers, resume banner, and app mount"
```

---

## Task 15: Lint, full verification, and manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `pnpm lint`
Expected: PASS. Fix any issues flagged in the new files (notably the non-top import note in Task 14 and any `this`-in-object-literal note from Task 7).

- [ ] **Step 2: Typecheck (web + node)**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 4: Manual smoke (dev app)**

Run: `pnpm dev`
- On a clean config (`~/.plucker/config.json` without a `walkthroughs.seen['getting-started']`), the "Welcome to Plucker" coach-mark should appear on launch in block mode.
- Click **Next** → the tour ends; relaunching does **not** re-show it (seen recorded).
- Temporarily remove the `seen` entry, relaunch, click **Exit** → tour closes; `inProgress` cleared.

> If verifying via the Playwright screenshot harness already in the repo, drive the same
> flow there. Manual verification of behavior is the acceptance gate for this task.

- [ ] **Step 5: Commit any lint/typecheck fixups**

```bash
git add -A
git commit -m "chore(walkthrough): lint and verification fixups"
```

---

## Self-Review notes (addressed during authoring)

- **Spec coverage:** scope=runtime-only (no editor — Tasks 1–13 build only the runtime);
  hybrid anchoring (Task 9 registry + data-tour + selector); demoing hybrid (DemoNode
  illusion ops + IntentNode safe-intents, Tasks 5/10/14); all four signals (Tasks 3/5/6);
  all four triggers (firstRun/version Task 12; contextual via `probes` + `state` edges;
  manual via `startWalkthrough` Task 14); per-node modality (StepNode.modality, Task 11);
  graph-native recovery + safe default (Task 7); resume (Tasks 4/8/12/14); pure-core engine
  + host adapter (Tasks 4–7/10); i18n keys (Task 14); persistence in Settings (Task 8).
- **Contextual triggers:** the *mechanism* (probes + `state`-conditioned edges, and a
  `contextual` trigger kind in the manifest type) ships in v1; no contextual *content* is
  authored here. `decideLaunchWalkthrough` handles firstRun/version/resume; contextual
  firing from live probes is a thin follow-up that reuses `engine.signal({kind:'state'})`.
- **Type consistency:** `EngineHost` (readProbe/runIntent/saveInProgress/markSeen) is used
  identically in engine, fakes, and adapter; `WalkthroughState`/`WalkthroughInProgress`
  match across shared types, preload, provider, and triggers; `Engine` interface is
  imported by the layer and provider with the same shape.
- **Known follow-ups (intentionally deferred, not placeholders):** Help-menu IPC item
  (Task 14 Step 4), DemoNode `ops` playback in the overlay (Task 11 note), contextual
  live-trigger wiring. Each is independently shippable and out of this plan's critical path.
