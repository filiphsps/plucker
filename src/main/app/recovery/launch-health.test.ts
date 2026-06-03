import { describe, it, expect } from 'vitest'
import { DEFAULT_RECOVERY_STATE, type RecoveryState } from './recovery-state'
import {
  BAD_LAUNCH_THRESHOLD,
  MAX_ROLLBACKS,
  accountForStartup,
  canRollback,
  markCleanExit,
  markHealthy,
  noteRollbackAttempt,
  noteRollbackTarget,
  pickRollbackTarget,
  shouldRecoverAtStartup,
  type ReleaseRef
} from './launch-health'

const state = (over: Partial<RecoveryState> = {}): RecoveryState => ({
  ...DEFAULT_RECOVERY_STATE,
  ...over
})

describe('accountForStartup', () => {
  it('increments badStreak when the previous launch was still in progress', () => {
    expect(accountForStartup(state({ launchInProgress: true, badStreak: 1 }))).toMatchObject({
      launchInProgress: true,
      badStreak: 2
    })
  })

  it('leaves badStreak alone after a clean/healthy previous launch', () => {
    expect(accountForStartup(state({ launchInProgress: false, badStreak: 0 }))).toMatchObject({
      launchInProgress: true,
      badStreak: 0
    })
  })
})

describe('shouldRecoverAtStartup', () => {
  it('fires at the threshold', () => {
    expect(shouldRecoverAtStartup(state({ badStreak: BAD_LAUNCH_THRESHOLD }))).toBe(true)
    expect(shouldRecoverAtStartup(state({ badStreak: BAD_LAUNCH_THRESHOLD - 1 }))).toBe(false)
  })
})

describe('markHealthy / markCleanExit', () => {
  it('markHealthy resets the whole episode', () => {
    expect(markHealthy()).toEqual(DEFAULT_RECOVERY_STATE)
  })

  it('markCleanExit only clears launchInProgress', () => {
    expect(markCleanExit(state({ launchInProgress: true, badStreak: 2 }))).toMatchObject({
      launchInProgress: false,
      badStreak: 2
    })
  })
})

describe('rollback loop guard', () => {
  it('allows attempts below the cap', () => {
    expect(canRollback(state({ rollbackAttempts: 0 }))).toBe(true)
    expect(canRollback(state({ rollbackAttempts: MAX_ROLLBACKS - 1 }))).toBe(true)
    expect(canRollback(state({ rollbackAttempts: MAX_ROLLBACKS }))).toBe(false)
  })

  it('noteRollbackAttempt bumps the count and resets badStreak', () => {
    expect(noteRollbackAttempt(state({ rollbackAttempts: 1, badStreak: 3 }))).toMatchObject({
      rollbackAttempts: 2,
      badStreak: 0
    })
  })

  it('noteRollbackTarget records the target + a pending notice', () => {
    expect(noteRollbackTarget(state(), { to: '0.21.0', from: '0.22.0' })).toMatchObject({
      lastRollbackVersion: '0.21.0',
      pendingRecoveryNotice: { rolledBackTo: '0.21.0', from: '0.22.0' }
    })
  })
})

describe('pickRollbackTarget', () => {
  const refs: ReleaseRef[] = [
    { tag: 'plucker-v0.22.0', version: '0.22.0' },
    { tag: 'plucker-v0.21.0', version: '0.21.0' },
    { tag: 'plucker-v0.20.1', version: '0.20.1' }
  ]

  it('picks the newest release older than current (2nd-latest from the top)', () => {
    expect(pickRollbackTarget(refs, '0.22.0', null)?.version).toBe('0.21.0')
  })

  it('steps further back, skipping the excluded (already-tried) version', () => {
    expect(pickRollbackTarget(refs, '0.22.0', '0.21.0')?.version).toBe('0.20.1')
  })

  it('never targets a version >= current', () => {
    expect(pickRollbackTarget(refs, '0.20.1', null)).toBeNull()
  })
})
