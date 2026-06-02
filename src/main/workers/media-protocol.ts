// Wire types shared between the main-thread media client and the worker that
// runs blocking media file operations (node-id3 tag read/write/cover + audio
// hashing) off the Electron main thread. node-id3 is synchronous and rewrites
// the *entire* file (cover art included) on every update, and sha256 is a
// synchronous CPU pass over the whole buffer — both stall the main thread (and
// thus every IPC progress frame) when several tracks run at once. Pure types
// only, so importing this never pulls the worker or node-id3 into a bundle.
import type { TrackTags } from '../../shared/types'

/** A raw cover image plus its mime, shuttled across the worker boundary. */
export interface CoverImage {
  /** Raw image bytes. Uint8Array survives structured clone across threads. */
  image: Uint8Array
  mime: string
}

/** One off-thread media operation, tagged by `op`. */
export type MediaOp =
  | { op: 'hash'; file: string }
  | { op: 'readTags'; file: string }
  | { op: 'writeTags'; file: string; tags: TrackTags }
  | { op: 'embedCover'; file: string; image: Uint8Array; mime: string }
  | { op: 'readCover'; file: string }

/** Result shape for each op, keyed by the op name. */
export interface MediaResult {
  hash: string
  readTags: TrackTags
  writeTags: void
  embedCover: void
  readCover: CoverImage | null
}

/** Main → worker: a request id paired with the op to run. */
export type MediaWorkerRequest = { id: number } & MediaOp

/** Worker → main: the outcome (or failure) for a request id. */
export type MediaWorkerResponse =
  | { id: number; ok: true; result: MediaResult[MediaOp['op']] }
  | { id: number; ok: false; error: string }

/**
 * Off-thread media client injected into the pipeline + transform services. When
 * present, hashing and ID3 tag I/O run on a worker thread instead of blocking the
 * Electron main thread. Absent in tests → callers use the synchronous fallbacks.
 */
export interface OffThreadMedia {
  hash(file: string): Promise<string>
  readTags(file: string): Promise<TrackTags>
  writeTags(file: string, tags: TrackTags): Promise<void>
  embedCover(file: string, image: Uint8Array, mime: string): Promise<void>
  readCover(file: string): Promise<{ image: Buffer; mime: string } | null>
  terminate(): void
}
