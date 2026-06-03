import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_RECOVERY_STATE,
  loadRecoveryState,
  saveRecoveryState,
  type RecoveryState
} from './recovery-state'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-recovery-'))
  file = join(dir, 'recovery-state.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('recovery-state', () => {
  it('returns the default state when the file is absent', () => {
    expect(loadRecoveryState(file)).toEqual(DEFAULT_RECOVERY_STATE)
  })

  it('round-trips a saved state', () => {
    const state: RecoveryState = {
      launchInProgress: true,
      badStreak: 2,
      lastRollbackVersion: '0.21.0',
      rollbackAttempts: 1,
      pendingRecoveryNotice: { rolledBackTo: '0.21.0', from: '0.22.0' }
    }
    saveRecoveryState(state, file)
    expect(loadRecoveryState(file)).toEqual(state)
  })

  it('falls back to defaults on corrupt JSON', () => {
    writeFileSync(file, '{ not json', 'utf8')
    expect(loadRecoveryState(file)).toEqual(DEFAULT_RECOVERY_STATE)
  })

  it('drops a malformed pendingRecoveryNotice', () => {
    writeFileSync(file, JSON.stringify({ badStreak: 1, pendingRecoveryNotice: { nope: 1 } }), 'utf8')
    const loaded = loadRecoveryState(file)
    expect(loaded.badStreak).toBe(1)
    expect(loaded.pendingRecoveryNotice).toBeNull()
  })
})
