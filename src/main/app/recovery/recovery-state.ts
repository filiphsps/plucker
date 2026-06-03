// Cross-launch persistence for the last-resort recovery guard. Stored separately from
// config.json (under ~/.plucker/recovery-state.json) so a factory reset never wipes the
// recovery bookkeeping, and the two concerns stay isolated. Tolerant of a missing or
// corrupt file (falls back to a clean default).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pluckerDir } from '@app/app/settings/settings'

/** Shown once, on the rolled-back build, after it becomes healthy. */
export interface RecoveryNotice {
  rolledBackTo: string
  from: string
}

export interface RecoveryState {
  /** True while a launch hasn't yet become healthy or cleanly exited. */
  launchInProgress: boolean
  /** Consecutive launches that crashed / were force-killed before becoming healthy. */
  badStreak: number
  /** The version most recently rolled back to (so the next attempt steps further back). */
  lastRollbackVersion: string | null
  /** Rollback attempts within the current recovery episode (loop guard). */
  rollbackAttempts: number
  /** A pending "you were rolled back" notice to show once healthy. */
  pendingRecoveryNotice: RecoveryNotice | null
}

export const DEFAULT_RECOVERY_STATE: RecoveryState = {
  launchInProgress: false,
  badStreak: 0,
  lastRollbackVersion: null,
  rollbackAttempts: 0,
  pendingRecoveryNotice: null
}

export function recoveryStatePath(): string {
  return join(pluckerDir(), 'recovery-state.json')
}

function isNotice(v: unknown): v is RecoveryNotice {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as RecoveryNotice).rolledBackTo === 'string' &&
    typeof (v as RecoveryNotice).from === 'string'
  )
}

export function loadRecoveryState(file = recoveryStatePath()): RecoveryState {
  if (!existsSync(file)) return { ...DEFAULT_RECOVERY_STATE }
  try {
    const p = JSON.parse(readFileSync(file, 'utf8')) as Partial<RecoveryState>
    return {
      ...DEFAULT_RECOVERY_STATE,
      ...p,
      pendingRecoveryNotice: isNotice(p.pendingRecoveryNotice) ? p.pendingRecoveryNotice : null
    }
  } catch {
    return { ...DEFAULT_RECOVERY_STATE }
  }
}

export function saveRecoveryState(state: RecoveryState, file = recoveryStatePath()): void {
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
}
