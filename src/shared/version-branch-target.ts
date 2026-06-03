import type { Branch } from './library'

/**
 * Where a newly-created child version lands on the branch graph, decided by where
 * its chosen parent sits. Shared by the renderer (the composer's "output" preview)
 * and the main-process fold so the preview never lies about what will happen.
 *
 * - `advance` — parent is the *active* branch's tip → grow that branch linearly.
 * - `switch`  — parent is a *different* branch's tip → grow and switch to it.
 * - `fork`    — parent is an interior (non-tip) version → start a new branch off it
 *               (keeps the layout invariant that every leaf is a branch tip).
 */
export type VersionBranchTarget =
  | { kind: 'advance'; branchId: string }
  | { kind: 'switch'; branchId: string }
  | { kind: 'fork'; branchName: string }

/** Lowest free `"<base>"`, `"<base> 2"`, `"<base> 3"`… not already taken (case-insensitive). */
export function nextEditBranchName(existing: string[], base = 'edit'): string {
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/**
 * Resolve the branch a child of `parentVersionId` should extend. Advancing the
 * active branch wins ties (a parent that is several branches' shared tip), so the
 * user's current line is preserved rather than silently switched.
 */
export function resolveVersionBranchTarget(
  branches: Branch[],
  activeBranchId: string,
  parentVersionId: string
): VersionBranchTarget {
  const active = branches.find((b) => b.id === activeBranchId)
  if (active && active.tipVersionId === parentVersionId) {
    return { kind: 'advance', branchId: active.id }
  }
  const otherTip = branches.find(
    (b) => b.id !== activeBranchId && b.tipVersionId === parentVersionId
  )
  if (otherTip) return { kind: 'switch', branchId: otherTip.id }
  return { kind: 'fork', branchName: nextEditBranchName(branches.map((b) => b.name)) }
}
