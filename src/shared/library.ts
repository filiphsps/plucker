import type { TrackTags } from './types'

export type CollectionKind = 'playlist' | 'album' | 'single'

export interface Collection {
  id: string
  kind: CollectionKind
  title: string
  sourceUrl?: string
  createdAt: string // ISO
}

export interface TrackInstance {
  id: string
  collectionId: string
  sourceVideoId?: string
  sourceUrl?: string
  /** Tag-independent audio-content hash of the raw download; "same download?" dedup. */
  sourceAudioHash?: string
  orderIndex: number
  title: string
  activeBranchId: string
}

/** One transform step as recorded in a version's recipe. */
export interface RecipeStep {
  type: string // transform type, e.g. 'auto-tag'
  config: Record<string, unknown>
}

/**
 * The transform chain that produced a version from its parent, plus a snapshot of
 * the resolved metadata so a cold version recomputes byte-stable and offline (N3).
 * Replay re-runs only the audio-mutating steps (deterministic) and then applies
 * `resolved` (tags + final name), skipping network metadata lookups entirely.
 */
export interface Recipe {
  steps: RecipeStep[] // [] for the raw root
  resolved?: { tags?: TrackTags; outputName?: string }
}

export interface Version {
  id: string
  trackId: string
  parentId: string | null // null = raw root
  blobHash: string | null // set when materialized
  recipe: Recipe // [] for root
  materialized: boolean
  label?: string
  createdAt: string
}

export interface Branch {
  id: string
  trackId: string
  name: string
  tipVersionId: string
}

export interface Blob {
  hash: string // full-file SHA-256
  path: string // absolute
  size: number
  refcount: number
}

export type ActivityType =
  | 'ingested'
  | 'edited'
  | 'branched'
  | 'switched'
  | 'exported'
  | 'deleted'
  | 'renamed'

export interface ActivityEvent {
  id: string
  type: ActivityType
  ts: string
  collectionId?: string
  trackId?: string
  versionId?: string
  summary: string
}

// Renderer-facing aggregates
export interface TrackSummary {
  id: string
  title: string
  orderIndex: number
  currentVersionId: string
  /** Total versions across all branches (for the "vN" chip). Optional for back-compat. */
  versionCount?: number
  /** Number of named branches (for the "⑂ branches" chip). */
  branchCount?: number
  /** Current version duration in seconds, if known (lazy; usually filled in the renderer). */
  durationSec?: number
  /** Source video id / URL of the original download (for re-download / open-source actions). */
  sourceVideoId?: string
  sourceUrl?: string
}
export interface CollectionView extends Collection {
  tracks: TrackSummary[]
}
export interface TrackDetail {
  instance: TrackInstance
  versions: Version[]
  branches: Branch[]
}
