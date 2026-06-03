// Pure decision logic for the last-resort recovery guard. No Electron / no I/O, so it's
// fully unit-testable. The thin wiring in safety-guard.ts loads/saves RecoveryState around
// these functions and schedules the timers.
import type { RecoveryState } from './recovery-state'
import { compareSemver } from '@shared/compare-semver'

/** Consecutive bad launches before we recover at startup. */
export const BAD_LAUNCH_THRESHOLD = 3
/** Rollback attempts per recovery episode before giving up to a manual-download prompt. */
export const MAX_ROLLBACKS = 2

/**
 * Account for the previous launch and mark this one in progress. If the previous launch
 * was still `launchInProgress` (never became healthy, never cleanly exited), it crashed or
 * was force-killed before becoming usable → count it as a bad launch.
 */
export function accountForStartup(prev: RecoveryState): RecoveryState {
  return {
    ...prev,
    launchInProgress: true,
    badStreak: prev.launchInProgress ? prev.badStreak + 1 : prev.badStreak
  }
}

/** Force-close / crash-loop trigger: recover immediately at startup. */
export function shouldRecoverAtStartup(state: RecoveryState): boolean {
  return state.badStreak >= BAD_LAUNCH_THRESHOLD
}

/** The app reached a usable, stable state: clear the whole episode. */
export function markHealthy(): RecoveryState {
  return {
    launchInProgress: false,
    badStreak: 0,
    lastRollbackVersion: null,
    rollbackAttempts: 0,
    pendingRecoveryNotice: null
  }
}

/** A clean quit (⌘Q) is never a bad launch — just clear the in-progress flag. */
export function markCleanExit(prev: RecoveryState): RecoveryState {
  return { ...prev, launchInProgress: false }
}

/** Loop guard: may we still attempt an automatic rollback this episode? */
export function canRollback(state: RecoveryState): boolean {
  return state.rollbackAttempts < MAX_ROLLBACKS
}

/**
 * Record that a rollback attempt is starting. Bumps the loop-guard count and resets
 * badStreak, so the freshly rolled-back build gets a clean chance instead of being
 * re-triggered by the stale streak (the loop guard bounds repeats instead).
 */
export function noteRollbackAttempt(prev: RecoveryState): RecoveryState {
  return { ...prev, rollbackAttempts: prev.rollbackAttempts + 1, badStreak: 0 }
}

/** Record the chosen target + a one-time post-recovery notice, just before relaunching. */
export function noteRollbackTarget(
  prev: RecoveryState,
  opts: { to: string; from: string }
): RecoveryState {
  return {
    ...prev,
    lastRollbackVersion: opts.to,
    pendingRecoveryNotice: { rolledBackTo: opts.to, from: opts.from }
  }
}

export interface ReleaseRef {
  tag: string
  version: string
}

/**
 * Choose the rollback target: the newest release strictly older than `current`, skipping
 * `exclude` (the version we already rolled back to). From the latest version this is the
 * 2nd-newest release; on a repeat episode it steps further back. Null when none qualifies.
 */
export function pickRollbackTarget(
  releases: ReleaseRef[],
  current: string,
  exclude: string | null
): ReleaseRef | null {
  const older = releases
    .filter((r) => compareSemver(r.version, current) < 0 && r.version !== exclude)
    .sort((a, b) => compareSemver(b.version, a.version))
  return older[0] ?? null
}
