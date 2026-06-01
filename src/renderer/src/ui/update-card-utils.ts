import type { UpdateState } from '../../../shared/types'

/** A button the update card can offer, by behaviour. */
export type UpdateActionKind = 'relaunch' | 'manual' | 'retry' | 'check'

export interface UpdateActionSpec {
  kind: UpdateActionKind
  /** Render as the filled primary button (vs. the secondary outline style). */
  primary: boolean
}

/**
 * Decide which action buttons the update card shows for a given state, ordered
 * primary-first.
 *
 * The important rule: an `error` always offers a **manual download** as an escape
 * hatch. Self-install can fail for reasons we can't recover from in place (no
 * matching release asset, a network drop, an unsigned-bundle Squirrel path on an
 * older build), and a bare "Try again" would just loop. Surfacing the releases
 * page means a failed self-install never strands the user.
 */
export function updateActions(state: UpdateState): UpdateActionSpec[] {
  switch (state.phase) {
    case 'ready':
      return [{ kind: 'relaunch', primary: true }]
    case 'available':
      // Reached only when we can't self-install (non-macOS); offer a manual download.
      return [{ kind: 'manual', primary: false }]
    case 'error':
      return [
        { kind: 'manual', primary: true },
        { kind: 'retry', primary: false }
      ]
    case 'upToDate':
      return [{ kind: 'check', primary: false }]
    default:
      return []
  }
}
