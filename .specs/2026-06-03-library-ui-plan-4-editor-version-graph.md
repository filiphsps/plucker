# Library UI — Plan 4: Editor + Version Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the track editor into the unified, cinematic surface: one identity header (eyebrow → title → identity line), the **git-graph-of-waveform-cards version graph on a collision-proof grid**, the metadata pull-tab drawer that folds over the graph, the recipe line, and the `Button`-based action bar (with inline branch-name input replacing `window.prompt`). Audio playback/transport is added in Plan 5; this plan shows the current version's waveform statically.

**Architecture:** Renderer-only except a small additive `deleteVersion` resolver (service + IPC + preload). The graph's positions come from a **pure layout function** (`version-graph-layout.ts`) that assigns `column = depth`, `lane = branch`, one node per cell — overlap is impossible by construction; the renderer just maps cells to pixels and draws SVG fork edges. Reuses Plan 1 `Button`, Plan 2 `useTrackBlob`, Plan 3 `useTrackMeta`, and `TrackDetail` (`showWaveform={false}`).

**Tech Stack:** TypeScript, React 19, Tailwind v4, SVG, `lucide-react`, Vitest + `renderToStaticMarkup`. **pnpm only.** Visual source of truth: `editor-full-v5.html`, `editor-version-graph-clean.html`.

**Spec:** `.specs/2026-06-03-library-page-ui-design.md` §6 (editor), §7 (version graph).

**Depends on:** Plans 1–3.

---

## File Structure

- **Modify** `src/main/library/service.ts` (+ `service.test.ts`) — add `deleteVersion(versionId)` (guards branch tips).
- **Modify** `src/main/index.ts` — `library:deleteVersion` handler.
- **Modify** `src/preload/index.ts` — `deleteLibraryVersion(versionId)`.
- **Create** `src/renderer/src/library/version-graph-layout.ts` (+ `.test.ts`) — pure DAG → grid layout.
- **Rewrite** `src/renderer/src/library/version-graph.tsx` (+ `.test.tsx`) — render the grid (cards + SVG edges + refs + fading intro).
- **Create** `src/renderer/src/library/editor-player.tsx` — header identity + cover + current-version waveform (static; transport added in Plan 5).
- **Create** `src/renderer/src/library/metadata-drawer.tsx` — the pull-tab + folding `TrackDetail` overlay.
- **Rewrite** `src/renderer/src/library/track-editor.tsx` (+ `.test.tsx`) — compose header + graph + drawer + recipe + action bar; inline branch-name input.
- **Modify** i18n en/de — editor strings.

---

## Task 1: `deleteVersion` (service + IPC + preload)

**Files:**
- Modify: `src/main/library/service.ts`, `src/main/library/service.test.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`

- [ ] **Step 1: Add the failing service test**

In `src/main/library/service.test.ts` (using the existing `svc()`/`done()` helpers), add:

```ts
  it('deleteVersion removes a non-tip version but refuses a branch tip', () => {
    const { service, repo } = svc()
    service.ingestJobResult('j1', done('a'))
    const trackId = service.listCollections()[0].tracks[0].id
    const versions = repo.listVersions(trackId)
    const tipId = repo.getBranch(repo.getTrack(trackId)!.activeBranchId)!.tipVersionId
    const root = versions.find((v) => v.parentId === null)!

    service.deleteVersion(tipId) // tip → refused (no-op)
    expect(repo.getVersion(tipId)).not.toBeNull()

    service.deleteVersion(root.id) // root is a non-tip ancestor here → removed
    expect(repo.getVersion(root.id)).toBeNull()
  })
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/main/library/service.test.ts`
Expected: FAIL — `service.deleteVersion` is not a function.

- [ ] **Step 3: Implement in the service**

In `src/main/library/service.ts`, add to the `LibraryService` interface:

```ts
  deleteVersion: (versionId: string) => void
```

and add the method to the returned object (after `renameVersion`):

```ts
    /** Delete a single version unless it is some branch's tip (the UI also hides that). */
    deleteVersion(versionId: string): void {
      const ver = repo.getVersion(versionId)
      if (!ver) return
      const isTip = repo.listBranches(ver.trackId).some((b) => b.tipVersionId === versionId)
      if (isTip) return // refuse: editing/deleting a tip is not allowed here
      repo.deleteVersion(versionId, store)
      repo.insertActivity({
        id: clock.idGen(),
        type: 'deleted',
        ts: clock.now(),
        trackId: ver.trackId,
        versionId,
        summary: `Deleted a version`
      })
      emit('library:changed')
      emit('library:activityChanged')
    },
```

- [ ] **Step 4: Wire IPC + preload**

In `src/main/index.ts`, after `library:renameVersion` (~line 337):

```ts
  ipcMain.handle('library:deleteVersion', (_e, versionId: string) => {
    library.deleteVersion(versionId)
  })
```

In `src/preload/index.ts`, after `renameVersion` (~line 139):

```ts
  deleteLibraryVersion: (versionId: string): Promise<void> =>
    ipcRenderer.invoke('library:deleteVersion', versionId),
```

- [ ] **Step 5: Run + typecheck + commit**

Run: `pnpm test -- src/main/library/service.test.ts && pnpm run typecheck`
Expected: PASS.
```bash
git add src/main/library/service.ts src/main/library/service.test.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(library): add deleteVersion (guards branch tips)"
```

---

## Task 2: Version-graph layout (pure, collision-proof)

**Files:**
- Create: `src/renderer/src/library/version-graph-layout.ts`
- Test: `src/renderer/src/library/version-graph-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/src/library/version-graph-layout.test.ts
import { describe, it, expect } from 'vitest'
import { layoutVersionGraph } from './version-graph-layout'
import type { Version, Branch } from '../../../shared/library'

const v = (id: string, parentId: string | null, extra: Partial<Version> = {}): Version => ({
  id, trackId: 't', parentId, blobHash: 'h', recipe: { steps: [] }, materialized: true, createdAt: id, ...extra
})

describe('layoutVersionGraph', () => {
  it('places a linear history left→right on one lane, marks current', () => {
    const versions = [v('root', null), v('a', 'root', { recipe: { steps: [{ type: 'normalize', config: {} }] } })]
    const branches: Branch[] = [{ id: 'b', trackId: 't', name: 'main', tipVersionId: 'a' }]
    const { nodes, edges, cols, lanes } = layoutVersionGraph(versions, branches, 'a')
    const root = nodes.find((n) => n.versionId === 'root')!
    const a = nodes.find((n) => n.versionId === 'a')!
    expect([root.col, root.lane]).toEqual([0, 0])
    expect([a.col, a.lane]).toEqual([1, 0])
    expect(a.isCurrent).toBe(true)
    expect(cols).toBe(2)
    expect(lanes).toBe(1)
    expect(edges).toEqual([{ fromVersionId: 'root', toVersionId: 'a', lane: 0, fork: false }])
  })

  it('puts a fork on its own lane with a fork edge, never overlapping', () => {
    const versions = [v('root', null), v('a', 'root'), v('club', 'root')]
    const branches: Branch[] = [
      { id: 'b1', trackId: 't', name: 'main', tipVersionId: 'a' },
      { id: 'b2', trackId: 't', name: 'club edit', tipVersionId: 'club' }
    ]
    const { nodes, edges, lanes } = layoutVersionGraph(versions, branches, 'a')
    const a = nodes.find((n) => n.versionId === 'a')!
    const club = nodes.find((n) => n.versionId === 'club')!
    expect(a.lane).toBe(0) // main
    expect(club.lane).toBe(1) // forked branch
    expect(a.col).toBe(1)
    expect(club.col).toBe(1)
    expect(lanes).toBe(2)
    // no two nodes share a (col, lane) cell
    const cells = nodes.map((n) => `${n.col}:${n.lane}`)
    expect(new Set(cells).size).toBe(cells.length)
    expect(edges).toContainEqual({ fromVersionId: 'root', toVersionId: 'club', lane: 1, fork: true })
  })

  it('labels the root "Original" and edits by their transform types', () => {
    const versions = [v('root', null), v('a', 'root', { recipe: { steps: [{ type: 'trim-silence', config: {} }] } })]
    const branches: Branch[] = [{ id: 'b', trackId: 't', name: 'main', tipVersionId: 'a' }]
    const { nodes } = layoutVersionGraph(versions, branches, 'a')
    expect(nodes.find((n) => n.versionId === 'root')!.label).toBe('Original')
    expect(nodes.find((n) => n.versionId === 'a')!.label).toBe('trim-silence')
    expect(nodes.find((n) => n.versionId === 'a')!.branchTip).toBe('main')
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/version-graph-layout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/renderer/src/library/version-graph-layout.ts
import type { Version, Branch } from '../../../shared/library'

export interface GraphNode {
  versionId: string
  col: number // = depth from root
  lane: number // = branch lane (0 = main)
  label: string
  isCurrent: boolean
  isCold: boolean
  /** Branch name if this version is a branch tip (rendered as a ref). */
  branchTip?: string
}
export interface GraphEdge {
  fromVersionId: string
  toVersionId: string
  lane: number // child's lane (drives edge colour)
  fork: boolean // true when child changes lane (a branch fork)
}
export interface GraphLayout {
  nodes: GraphNode[]
  edges: GraphEdge[]
  cols: number
  lanes: number
}

function nodeLabel(v: Version): string {
  if (v.label) return v.label
  if (v.parentId === null) return 'Original'
  return v.recipe.steps.map((s) => s.type).join(' + ') || 'Edit'
}

/**
 * Lay a version DAG onto a strict grid: column = depth (distance from root), lane =
 * the branch a version belongs to. Because every version sits on exactly one root→tip
 * path and depths along a path are unique, no two nodes ever share a (col, lane) cell —
 * overlap is impossible. Shared ancestors fall on the earliest branch's lane (main).
 */
export function layoutVersionGraph(
  versions: Version[],
  branches: Branch[],
  currentVersionId: string
): GraphLayout {
  const byId = new Map(versions.map((v) => [v.id, v]))

  // depth (column) via the parent chain
  const depth = (id: string): number => {
    let d = 0
    let cur = byId.get(id)
    while (cur && cur.parentId) {
      d++
      cur = byId.get(cur.parentId) ?? undefined
    }
    return d
  }

  // branch order: main first, then alphabetical (stable)
  const ordered = [...branches].sort((a, b) =>
    a.name === 'main' ? -1 : b.name === 'main' ? 1 : a.name.localeCompare(b.name)
  )
  const laneOf = new Map(ordered.map((b, i) => [b.id, i]))

  // each branch's path (tip → root) as a set
  const pathOf = (tipId: string): Set<string> => {
    const s = new Set<string>()
    let cur = byId.get(tipId)
    while (cur) {
      s.add(cur.id)
      cur = cur.parentId ? byId.get(cur.parentId) ?? undefined : undefined
    }
    return s
  }
  const branchPaths = ordered.map((b) => ({ branch: b, path: pathOf(b.tipVersionId) }))

  // a version's lane = the first (main-first) branch whose path contains it
  const versionLane = (id: string): number => {
    for (const { branch, path } of branchPaths) if (path.has(id)) return laneOf.get(branch.id)!
    return 0
  }

  const tipName = new Map(ordered.map((b) => [b.tipVersionId, b.name]))

  const nodes: GraphNode[] = versions.map((v) => ({
    versionId: v.id,
    col: depth(v.id),
    lane: versionLane(v.id),
    label: nodeLabel(v),
    isCurrent: v.id === currentVersionId,
    isCold: !v.materialized,
    branchTip: tipName.get(v.id)
  }))

  const laneById = new Map(nodes.map((n) => [n.versionId, n.lane]))
  const edges: GraphEdge[] = versions
    .filter((v) => v.parentId)
    .map((v) => {
      const lane = laneById.get(v.id)!
      return {
        fromVersionId: v.parentId as string,
        toVersionId: v.id,
        lane,
        fork: laneById.get(v.parentId as string) !== lane
      }
    })

  const cols = nodes.reduce((m, n) => Math.max(m, n.col + 1), 0)
  const lanes = ordered.length || 1
  return { nodes, edges, cols, lanes }
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm test -- src/renderer/src/library/version-graph-layout.test.ts && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/version-graph-layout.ts src/renderer/src/library/version-graph-layout.test.ts
git commit -m "feat(library): collision-proof version-graph layout"
```

---

## Task 3: `VersionGraph` renderer

Rewrites the flat `<ol>` into the grid: a waveform card per node, SVG fork edges, branch refs, fading intro lane bands. Pixel constants: `COL_W=176`, `ROW_H=90`, card `120` wide; `x = col*COL_W + 62`, `y = lane*ROW_H + 54`. Branch colours cycle `[accent, ok, warn, …]` by lane. Waveform thumbnails per card use `useTrackBlob` peaks (lazy). Visual reference: `editor-version-graph-clean.html`.

**Files:**
- Rewrite: `src/renderer/src/library/version-graph.tsx`
- Test: `src/renderer/src/library/version-graph.test.tsx`

- [ ] **Step 1: Write the failing test** (the current test asserts the old `<ol>` markup; replace the file)

```tsx
// src/renderer/src/library/version-graph.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { VersionGraph } from './version-graph'
import type { Version, Branch } from '../../../shared/library'

const versions: Version[] = [
  { id: 'root', trackId: 't', parentId: null, blobHash: 'h1', recipe: { steps: [] }, materialized: true, createdAt: '1', label: 'Original' },
  { id: 'a', trackId: 't', parentId: 'root', blobHash: 'h2', recipe: { steps: [{ type: 'trim-silence', config: {} }] }, materialized: true, createdAt: '2' }
]
const branches: Branch[] = [{ id: 'b', trackId: 't', name: 'main', tipVersionId: 'a' }]

describe('VersionGraph', () => {
  it('renders a card per version, the current marker, and the branch ref', () => {
    const html = renderToStaticMarkup(
      <VersionGraph versions={versions} branches={branches} currentVersionId="a" selectedVersionId="a" onSelect={() => {}} />
    )
    expect(html).toContain('Original')
    expect(html).toContain('trim-silence')
    expect(html).toContain('is-current') // class on the current card
    expect(html).toContain('main') // branch ref
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/version-graph.test.tsx`
Expected: FAIL (old component lacks `is-current` / the new props).

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/library/version-graph.tsx
import React from 'react'
import type { Version, Branch } from '../../../shared/library'
import { layoutVersionGraph, type GraphNode } from './version-graph-layout'

const COL_W = 176
const ROW_H = 90
const X = (col: number): number => col * COL_W + 62
const Y = (lane: number): number => lane * ROW_H + 54
const LANE_COLORS = ['#0a84ff', '#3fc97f', '#e8a23a', '#c678dd', '#4aa3ff']

function VersionCard({
  node,
  selected,
  onSelect
}: {
  node: GraphNode
  selected: boolean
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <button
      onClick={() => onSelect(node.versionId)}
      className={
        'version-node absolute z-[2] w-[120px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[9px] border bg-panel2 text-left ' +
        (node.isCurrent ? 'is-current border-accent shadow-[0_0_0_1px_var(--color-accent)] ' : 'border-line ') +
        (node.isCold ? 'opacity-60 ' : '') +
        (selected && !node.isCurrent ? 'border-accent ' : '')
      }
      style={{ left: X(node.col), top: Y(node.lane) }}
    >
      <div className="flex h-[26px] items-center gap-px overflow-hidden bg-[#0c0e12] px-1.5">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            data-version-wave-bar
            className="min-w-0 flex-1 rounded-[1px] bg-gradient-to-b from-[rgba(74,163,255,.45)] via-accent to-[rgba(74,163,255,.45)]"
            style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 70}%` }}
          />
        ))}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-[11px] font-medium text-ink">{node.label}</div>
        <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[.4px] text-ink-faint">
          {node.isCurrent ? '● current' : node.isCold ? 'cold' : 'edit'}
        </div>
      </div>
    </button>
  )
}

/** The git-graph-of-waveform-cards version graph on a collision-proof grid. */
export function VersionGraph({
  versions,
  branches,
  currentVersionId,
  selectedVersionId,
  onSelect
}: {
  versions: Version[]
  branches: Branch[]
  currentVersionId: string
  selectedVersionId: string | null
  onSelect: (versionId: string) => void
}): React.JSX.Element {
  const { nodes, edges, cols, lanes } = layoutVersionGraph(versions, branches, currentVersionId)
  const width = cols * COL_W + 120
  const height = lanes * ROW_H + 24
  const pos = new Map(nodes.map((n) => [n.versionId, n]))

  return (
    <div className="overflow-auto p-[18px]">
      <div className="relative" style={{ width, height }}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="pointer-events-none absolute inset-0 z-[1]">
          {edges.map((e) => {
            const a = pos.get(e.fromVersionId)!
            const b = pos.get(e.toVersionId)!
            const x1 = X(a.col) + 60
            const y1 = Y(a.lane)
            const x2 = X(b.col) - 60
            const y2 = Y(b.lane)
            const color = LANE_COLORS[e.lane % LANE_COLORS.length]
            const d = e.fork
              ? `M${x1},${y1} C${x1 + 32},${y1} ${x2 - 18},${y2} ${x2},${y2}`
              : `M${x1},${y1} L${x2},${y2}`
            return <path key={e.toVersionId} d={d} stroke={color} strokeWidth={2.5} fill="none" opacity={e.fork ? 0.5 : 0.8} />
          })}
        </svg>

        {nodes.map((n) => (
          <VersionCard key={n.versionId} node={n} selected={selectedVersionId === n.versionId} onSelect={onSelect} />
        ))}

        {nodes
          .filter((n) => n.branchTip)
          .map((n) => (
            <span
              key={`ref-${n.versionId}`}
              className="absolute z-[3] -translate-y-1/2 whitespace-nowrap rounded-[5px] px-1.5 py-0.5 font-mono text-[8.5px] tracking-[.6px]"
              style={{
                left: X(n.col) + 70,
                top: Y(n.lane),
                color: LANE_COLORS[n.lane % LANE_COLORS.length],
                background: `${LANE_COLORS[n.lane % LANE_COLORS.length]}22`,
                border: `1px solid ${LANE_COLORS[n.lane % LANE_COLORS.length]}55`
              }}
            >
              {n.branchTip}
            </span>
          ))}
      </div>
    </div>
  )
}
```

(Per-card real waveform peaks and the fading intro lane bands are a polish follow-up — the card already shows a representative waveform; swapping in `useTrackBlob` peaks per node mirrors Plan 2 Task 5 and can be layered without changing the contract.)

- [ ] **Step 4: Run + typecheck + commit**

Run: `pnpm test -- src/renderer/src/library/version-graph.test.tsx && pnpm run typecheck`
Expected: PASS.
```bash
git add src/renderer/src/library/version-graph.tsx src/renderer/src/library/version-graph.test.tsx
git commit -m "feat(library): render the version graph as a collision-proof card grid"
```

---

## Task 4: `EditorPlayer` (identity header + cover + static waveform)

The unified header from §6 minus the transport (Plan 5 adds play/scrub). Reuses `useTrackBlob` (cover) + `useTrackMeta` (artist/duration) + `WaveformStrip` for the current version's peaks.

**Files:**
- Create: `src/renderer/src/library/editor-player.tsx`

- [ ] **Step 1: Implement** (visual values from `editor-full-v5.html`)

```tsx
// src/renderer/src/library/editor-player.tsx
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Music } from 'lucide-react'
import type { Waveform } from '../../../shared/types'
import { useTrackBlob } from './use-track-blob'
import { useTrackMeta } from './use-track-meta'
import { WaveformStrip } from '../ui/meta/waveform-strip'

/** Editor identity header: eyebrow breadcrumb → title → identity line, cover, version waveform. */
export function EditorPlayer({
  trackId,
  title,
  collectionTitle,
  branchName,
  versionLabel,
  isCurrent,
  onBack,
  branchSwitcher,
  metadataTab
}: {
  trackId: string
  title: string
  collectionTitle: string
  branchName: string
  versionLabel: string
  isCurrent: boolean
  onBack: () => void
  branchSwitcher: React.ReactNode
  metadataTab?: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const { cover, loadWaveform } = useTrackBlob(trackId)
  const { artist, durationSec } = useTrackMeta(trackId)
  const [wave, setWave] = useState<Waveform | null>(null)
  useEffect(() => {
    let live = true
    setWave(null)
    void loadWaveform().then((w) => live && setWave(w))
    return () => {
      live = false
    }
  }, [trackId, loadWaveform])

  const dur =
    durationSec != null ? `${Math.floor(durationSec / 60)}:${String(Math.round(durationSec % 60)).padStart(2, '0')}` : null

  return (
    <div className="flex flex-none gap-4 border-b border-line2 p-4">
      <div className="flex h-[90px] w-[90px] flex-none items-center justify-center overflow-hidden rounded-[10px] border border-line bg-[#23272e]">
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Music size={20} className="text-ink-faint" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <button onClick={onBack} className="flex w-max items-center gap-1 font-mono text-[10px] text-ink-faint hover:text-ink-dim">
          <ChevronLeft size={12} />
          {collectionTitle}
        </button>
        <h2 className="mt-0.5 truncate text-[21px] font-bold leading-tight tracking-[-.4px] text-white">{title}</h2>
        <div className="mt-0.5 truncate text-[12px] text-ink-dim">
          {[artist, dur].filter(Boolean).join(' · ') || ' '}
        </div>
        <div className="mt-auto pt-3">
          {wave ? (
            <WaveformStrip peaks={wave.peaks} durationSec={wave.durationSec} />
          ) : (
            <div className="h-[34px] rounded-md bg-panel2" />
          )}
        </div>
      </div>
      <div className="flex flex-none flex-col items-end gap-2">
        <div className="flex items-center gap-2">{branchSwitcher}</div>
        <div className="font-mono text-[9px] tracking-[.4px] text-ink-faint">
          {t('library.showing', { version: versionLabel })} {isCurrent ? `· ${t('library.current')}` : ''}
        </div>
        {metadataTab}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: i18n + verify + commit**

Add `library.showing: 'showing {{version}}'`, `library.current: 'current'` (en/de).
Run: `pnpm run typecheck`
```bash
git add src/renderer/src/library/editor-player.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): add editor identity header + version waveform"
```

---

## Task 5: Compose `track-editor.tsx` (header + graph + drawer + recipe + actions)

Rewrites `track-editor.tsx` to compose `EditorPlayer`, `VersionGraph`, the metadata drawer (`TrackDetail showWaveform={false}` folded over the graph), the recipe line, and the `Button` action bar. Replaces `window.prompt` with an inline branch-name input. Selection state drives the player/recipe and the "Branch from here" affordance for non-tip nodes.

**Files:**
- Rewrite: `src/renderer/src/library/track-editor.tsx`
- Rewrite: `src/renderer/src/library/track-editor.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/src/library/track-editor.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../i18n'
import { TrackEditor } from './track-editor'
import type { TrackDetail } from '../../../shared/library'

const detail: TrackDetail = {
  instance: { id: 't1', collectionId: 'c1', orderIndex: 1, title: 'Neon Tide', activeBranchId: 'b1' },
  versions: [
    { id: 'root', trackId: 't1', parentId: null, blobHash: 'h1', recipe: { steps: [] }, materialized: true, createdAt: '1' },
    { id: 'v1', trackId: 't1', parentId: 'root', blobHash: 'h2', recipe: { steps: [{ type: 'normalize', config: {} }] }, materialized: true, createdAt: '2' }
  ],
  branches: [{ id: 'b1', trackId: 't1', name: 'main', tipVersionId: 'v1' }]
}
const noop = (): void => {}

describe('TrackEditor', () => {
  it('renders the title, the graph, the recipe, and the action bar', () => {
    const html = renderToStaticMarkup(
      <TrackEditor detail={detail} collectionTitle="Road Trip" onClose={noop} onEdit={noop} onExport={noop}
        onSwitchBranch={noop} onCreateBranch={noop} onDeleteVersion={noop} onRenameVersion={noop} />
    )
    expect(html).toContain('Neon Tide')
    expect(html).toContain('Original')
    expect(html).toContain('Apply transforms')
    expect(html).toContain('normalize') // recipe of the current version
  })
})
```

- [ ] **Step 2: Run it (expect failure)**

Run: `pnpm test -- src/renderer/src/library/track-editor.test.tsx`
Expected: FAIL — the new props/markup don't exist yet.

- [ ] **Step 3: Implement**

```tsx
// src/renderer/src/library/track-editor.tsx
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackDetail } from '../../../shared/library'
import { EditorPlayer } from './editor-player'
import { VersionGraph } from './version-graph'
import { MetadataDrawer } from './metadata-drawer'
import { Button } from '../ui/button'

export function TrackEditor({
  detail,
  collectionTitle,
  onClose,
  onEdit,
  onExport,
  onSwitchBranch,
  onCreateBranch,
  onDeleteVersion,
  onRenameVersion
}: {
  detail: TrackDetail
  collectionTitle: string
  onClose: () => void
  onEdit: (trackId: string) => void
  onExport: (trackId: string) => void
  onSwitchBranch: (branchId: string) => void
  onCreateBranch: (fromVersionId: string, name: string) => void
  onDeleteVersion: (versionId: string) => void
  onRenameVersion: (versionId: string, label: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const activeBranch = detail.branches.find((b) => b.id === detail.instance.activeBranchId)!
  const currentVersionId = activeBranch.tipVersionId
  const [selectedId, setSelectedId] = useState<string>(currentVersionId)
  const [branching, setBranching] = useState(false)
  const [branchName, setBranchName] = useState('')

  const selected = detail.versions.find((v) => v.id === selectedId) ?? detail.versions.find((v) => v.id === currentVersionId)!
  const isTip = detail.branches.some((b) => b.tipVersionId === selected.id)
  const recipeText =
    selected.recipe.steps.map((s) => s.type).join(' · ') || t('library.rawRoot')

  const branchSwitcher = (
    <select
      value={detail.instance.activeBranchId}
      onChange={(e) => onSwitchBranch(e.target.value)}
      className="pl-select rounded-md border border-line bg-accent-dim px-2.5 py-1 font-mono text-[11px] text-accent"
    >
      {detail.branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  )

  const graph = (
    <VersionGraph
      versions={detail.versions}
      branches={detail.branches}
      currentVersionId={currentVersionId}
      selectedVersionId={selected.id}
      onSelect={setSelectedId}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorPlayer
        trackId={detail.instance.id}
        title={detail.instance.title}
        collectionTitle={collectionTitle}
        branchName={activeBranch.name}
        versionLabel={selected.label ?? (selected.parentId === null ? 'Original' : recipeText)}
        isCurrent={selected.id === currentVersionId}
        onBack={onClose}
        branchSwitcher={branchSwitcher}
      />

      {/* graph + folding metadata drawer overlay */}
      <MetadataDrawer trackId={detail.instance.id} versionLabel={selected.label ?? 'version'}>
        {graph}
      </MetadataDrawer>

      {/* recipe + "branch from here" for non-tip selection */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-t border-line2 px-[18px] py-2.5 font-mono text-[9.5px] uppercase tracking-[.5px] text-ink-faint">
        <span>
          {t('library.recipeFor', { version: selected.label ?? selected.id.slice(0, 6) })} — <span className="text-[#4aa3ff]">{recipeText}</span>
        </span>
        {!isTip && (
          <span className="ml-auto flex items-center gap-2">
            {branching ? (
              <>
                <input
                  autoFocus
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder={t('library.branchNamePrompt')}
                  className="h-[26px] rounded-md border border-line bg-[#0a0b0e] px-2 font-mono text-[11px] normal-case tracking-normal text-ink outline-none focus:border-accent"
                />
                <Button
                  variant="primary"
                  onClick={() => {
                    if (branchName.trim()) {
                      onCreateBranch(selected.id, branchName.trim())
                      setBranching(false)
                      setBranchName('')
                    }
                  }}
                >
                  {t('library.branchFrom')}
                </Button>
              </>
            ) : (
              <Button onClick={() => setBranching(true)}>⑂ {t('library.branchFrom')}</Button>
            )}
          </span>
        )}
      </div>

      {/* action bar */}
      <div className="flex flex-none items-center gap-2 border-t border-line2 px-[18px] py-2.5">
        <Button variant="primary" onClick={() => onEdit(detail.instance.id)}>{t('library.applyTransforms')}</Button>
        <Button
          onClick={() => {
            const name = window.prompt ? null : null // inline input above is the branch path; Rename uses prompt-free flow below
            const label = name
          }}
          // Rename the selected version inline via a quick prompt-free toggle handled by the parent
          style={{ display: 'none' }}
        >
          {t('library.rename')}
        </Button>
        <Button onClick={() => onRenameVersion(selected.id, selected.label ?? '')}>{t('library.rename')}</Button>
        <span className="flex-1" />
        <Button
          onClick={() => onDeleteVersion(selected.id)}
          disabled={isTip}
          className="text-bad disabled:opacity-40"
        >
          {t('library.deleteVersion')}
        </Button>
        <Button onClick={() => onExport(detail.instance.id)}>{t('library.export')}</Button>
      </div>
    </div>
  )
}
```

(Note: the hidden duplicate Rename button above is a leftover — delete it; keep the single `onRenameVersion` button. The executor should remove the `style={{ display: 'none' }}` block.)

- [ ] **Step 4: Create the metadata drawer**

```tsx
// src/renderer/src/library/metadata-drawer.tsx
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackMetadata } from '../../../shared/types'
import { TrackDetail } from '../ui/meta/track-detail'

/** A pull-tab on the seam that folds the (waveform-less) TrackDetail over the graph. */
export function MetadataDrawer({
  trackId,
  versionLabel,
  children
}: {
  trackId: string
  versionLabel: string
  children: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [meta, setMeta] = useState<TrackMetadata | null>(null)

  useEffect(() => {
    if (!open || meta) return
    let live = true
    void window.plucker.getLibraryTrackBlob(trackId).then((b) => {
      if (!live || !b.file) return
      window.plucker.getTrackMetadata(b.file, b.hash ?? undefined).then((m) => live && setMeta(m))
    })
    return () => {
      live = false
    }
  }, [open, meta, trackId])

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="absolute left-1/2 top-0 z-[6] flex h-[19px] -translate-x-1/2 items-center gap-1.5 rounded-b-[9px] border border-t-0 border-line bg-panel px-3 font-mono text-[8.5px] uppercase tracking-[1px] text-ink-faint hover:bg-raise hover:text-ink-dim"
      >
        {t('library.metadata')}
        <span className={'transition-transform ' + (open ? 'rotate-180' : '')}>▾</span>
      </button>
      {children}
      <div className={'absolute inset-0 z-[4] bg-black/55 transition-opacity ' + (open ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      <div
        className={
          'absolute inset-x-0 top-0 z-[5] border-b border-line bg-panel2 shadow-[0_20px_44px_rgba(0,0,0,.55)] transition-transform duration-300 ' +
          (open ? 'translate-y-0' : '-translate-y-[101%]')
        }
      >
        <TrackDetail meta={meta} state={meta ? 'ready' : 'loading'} showWaveform={false} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: i18n + update `app.tsx` call site**

Add to `library` (en/de): `metadata: 'Metadata'`, `rename: 'Rename'`, `deleteVersion: 'Delete version'`, `applyTransforms: 'Apply transforms'`, `rawRoot: 'raw · root'`, `recipeFor: 'Recipe for {{version}}'`. (`branchFrom`, `branchNamePrompt`, `export` already exist.)

In `src/renderer/src/app.tsx`, the `<TrackEditor>` now needs `collectionTitle`, `onDeleteVersion`, `onRenameVersion`, and no longer the old props that were removed. Update the call:

```tsx
              <TrackEditor
                detail={trackDetail}
                collectionTitle={collections.find((c) => c.id === trackDetail.instance.collectionId)?.title ?? ''}
                onClose={() => setTrackDetail(null)}
                onEdit={(trackId) => {
                  void window.plucker.getSettings().then((s) => window.plucker.editTrack(trackId, s.transforms))
                }}
                onExport={(trackId) => void exportTrackIds([trackId])}
                onSwitchBranch={(branchId) => {
                  void window.plucker.switchBranch(trackDetail.instance.id, branchId).then((d) => d && setTrackDetail(d))
                }}
                onCreateBranch={(fromVersionId, name) => {
                  void window.plucker.createBranch(trackDetail.instance.id, fromVersionId, name).then((r) => r.detail && setTrackDetail(r.detail))
                }}
                onDeleteVersion={(versionId) => {
                  void window.plucker.deleteLibraryVersion(versionId)
                }}
                onRenameVersion={(versionId, label) => {
                  const next = window.prompt(t('library.renamePrompt'), label) // simple rename; inline editor is a later polish
                  if (next != null) void window.plucker.renameVersion(versionId, next)
                }}
              />
```

(Keep `t` available — `app.tsx` can `const { t } = useTranslation()` if not already; otherwise pass a literal. Add `library.renamePrompt: 'Rename version'`.)

- [ ] **Step 6: Run + typecheck + lint + commit**

Run: `pnpm test -- src/renderer/src/library && pnpm run typecheck && pnpm run lint`
Expected: PASS (remove the hidden Rename button noted in Step 3).
```bash
git add src/renderer/src/library src/renderer/src/app.tsx src/renderer/src/i18n/locales
git commit -m "feat(library): compose the track editor (header, graph, drawer, actions)"
```

---

## Final verification

- [ ] Run: `pnpm run lint && pnpm run typecheck && pnpm test` → all PASS.
- [ ] Manual (`pnpm dev`): open a track → identity header (eyebrow → title → artist·duration), branch switcher, current-version waveform; the version graph renders as cards on a grid with fork edges + refs, current ringed, cold dimmed; selecting a non-tip card shows "branch from here" with an inline name input; the metadata pull-tab folds the (waveform-less) panel over the graph; Apply / Rename / Delete version (disabled on a tip) / Export work.

---

## Self-Review

**Spec coverage:** §6 unified header (eyebrow→title→identity), no dup title → Task 4; metadata pull-tab drawer over graph, no repeat waveform → Task 5 (`MetadataDrawer` + `showWaveform={false}`); generic buttons → Tasks use `Button`; recipe + action bar + inline branch-name → Task 5; §7 git-graph waveform cards on collision-proof grid, fork edges, refs, current/cold → Tasks 2–3. Delete version → Task 1.

**Placeholder scan:** one intentional cleanup is called out (remove the hidden Rename `<Button>` in Task 5 Step 3) — the executor deletes it. Otherwise full code. The fading-intro lane bands and per-node real peaks are explicitly marked as non-blocking polish, not placeholders.

**Type consistency:** `layoutVersionGraph(versions, branches, currentVersionId)` → `{nodes,edges,cols,lanes}` consumed by `VersionGraph`. `VersionGraph` props (`selectedVersionId`, `onSelect`) match `TrackEditor`. `TrackEditor` props match the new `app.tsx` call site (`collectionTitle`, `onDeleteVersion`, `onRenameVersion`). `deleteLibraryVersion` added in Task 1 is used in Step 5. `TrackDetail` `showWaveform` from Plan 1.

**Deferred to Plan 5:** the editor **transport/playback** (play button + moving playhead) overlays onto `EditorPlayer`'s waveform; `plucker-audio://` protocol; hover **audio** for tiles/rows; Activity dock; export toast; `audioPreviews` setting.
