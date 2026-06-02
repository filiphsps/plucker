import type { TrackRowProps } from './track-row'

/**
 * Track-data fields that affect what a row renders. Two `track` objects with
 * equal values for all of these render identically, even if (as IPC always
 * hands us) they are different object references.
 */
const TRACK_FIELDS = [
  'title',
  'artist',
  'album',
  'year',
  'status',
  'percent',
  'transformPercent',
  'file',
  'duration',
  'reason',
  'errorCode',
  'videoId',
  'hash',
  'stage',
  'speedBytesPerSec',
  'elapsedMs'
] as const

/**
 * `React.memo` comparator for {@link TrackRow}.
 *
 * Compares the *data* props by value so the identical-but-freshly-allocated
 * objects we receive on every progress tick / history refresh do not force a
 * re-render. Handler props and `actions` are compared only by presence
 * (truthiness): their presence changes the rendered output, but their identity
 * is recreated on every parent render, so comparing identity would defeat the
 * memo entirely. Callers keep stale handler closures safe by reading changing
 * state through refs (see history-view). `meta` is compared by reference —
 * callers keep it referentially stable.
 *
 * Returns `true` when the rows are equivalent (skip re-render).
 */
export function trackRowPropsEqual(prev: TrackRowProps, next: TrackRowProps): boolean {
  if (
    prev.variant !== next.variant ||
    prev.index !== next.index ||
    prev.active !== next.active ||
    prev.missing !== next.missing ||
    prev.editing !== next.editing ||
    prev.selected !== next.selected ||
    prev.meta !== next.meta
  ) {
    return false
  }

  // Presence (not identity) of render-affecting node/handler props.
  if (!!prev.onSelect !== !!next.onSelect || !!prev.actions !== !!next.actions) return false

  const a = prev.track
  const b = next.track
  if (a !== b) {
    for (const key of TRACK_FIELDS) {
      if (a[key] !== b[key]) return false
    }
  }

  const sa = prev.source
  const sb = next.source
  if (sa !== sb) {
    if (
      sa?.videoId !== sb?.videoId ||
      sa?.url !== sb?.url ||
      sa?.downloadedAt !== sb?.downloadedAt
    ) {
      return false
    }
  }

  return true
}
