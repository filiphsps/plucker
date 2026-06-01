import { describe, it, expect } from 'vitest'
import { updateActions } from './update-card-utils'
import type { UpdateState } from '../../../shared/types'

const state = (over: Partial<UpdateState>): UpdateState => ({
  phase: 'idle',
  currentVersion: '1.0.0',
  canSelfInstall: true,
  ...over
})

describe('updateActions', () => {
  it('offers only a relaunch when an update is downloaded and ready', () => {
    expect(updateActions(state({ phase: 'ready' }))).toEqual([{ kind: 'relaunch', primary: true }])
  })

  it('offers a manual download when an update is available but cannot self-install', () => {
    expect(updateActions(state({ phase: 'available', canSelfInstall: false }))).toEqual([
      { kind: 'manual', primary: false }
    ])
  })

  it('always offers a manual download on error so a failed self-install never strands the user', () => {
    const actions = updateActions(state({ phase: 'error', error: 'boom' }))
    expect(actions.map((a) => a.kind)).toContain('manual')
    expect(actions.map((a) => a.kind)).toContain('retry')
    // Manual download leads, since it's the path that always works.
    expect(actions[0]).toEqual({ kind: 'manual', primary: true })
  })

  it('offers a re-check when already up to date', () => {
    expect(updateActions(state({ phase: 'upToDate' }))).toEqual([{ kind: 'check', primary: false }])
  })

  it('offers no action while a check or download is in flight', () => {
    expect(updateActions(state({ phase: 'checking' }))).toEqual([])
    expect(updateActions(state({ phase: 'downloading', percent: 42 }))).toEqual([])
  })
})
