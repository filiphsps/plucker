import { describe, it, expect } from 'vitest'
import type { Branch } from './library'
import { nextEditBranchName, resolveVersionBranchTarget } from './version-branch-target'

const branch = (id: string, name: string, tipVersionId: string): Branch => ({
  id,
  trackId: 't',
  name,
  tipVersionId
})

describe('resolveVersionBranchTarget', () => {
  it('advances when the parent is the active branch tip', () => {
    const branches = [branch('main', 'main', 'v2')]
    expect(resolveVersionBranchTarget(branches, 'main', 'v2')).toEqual({
      kind: 'advance',
      branchId: 'main'
    })
  })

  it('switches when the parent is a non-active branch tip', () => {
    const branches = [branch('main', 'main', 'v2'), branch('club', 'club', 'v5')]
    expect(resolveVersionBranchTarget(branches, 'main', 'v5')).toEqual({
      kind: 'switch',
      branchId: 'club'
    })
  })

  it('forks when the parent is an interior (non-tip) version', () => {
    const branches = [branch('main', 'main', 'v2')]
    expect(resolveVersionBranchTarget(branches, 'main', 'v1')).toEqual({
      kind: 'fork',
      branchName: 'edit'
    })
  })

  it('dedupes the fork name against existing branch names', () => {
    const branches = [
      branch('main', 'main', 'v2'),
      branch('e1', 'edit', 'v3'),
      branch('e2', 'edit 2', 'v4')
    ]
    expect(resolveVersionBranchTarget(branches, 'main', 'v1')).toEqual({
      kind: 'fork',
      branchName: 'edit 3'
    })
  })

  it('prefers advancing the active branch when it and another branch share the tip', () => {
    const branches = [branch('main', 'main', 'v2'), branch('club', 'club', 'v2')]
    expect(resolveVersionBranchTarget(branches, 'main', 'v2')).toEqual({
      kind: 'advance',
      branchId: 'main'
    })
  })
})

describe('nextEditBranchName', () => {
  it('returns the base name when unused', () => {
    expect(nextEditBranchName([])).toBe('edit')
    expect(nextEditBranchName(['main'])).toBe('edit')
  })

  it('suffixes the next free integer, ignoring case', () => {
    expect(nextEditBranchName(['edit'])).toBe('edit 2')
    expect(nextEditBranchName(['Edit', 'edit 2'])).toBe('edit 3')
  })
})
