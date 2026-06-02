import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'
import type { TransformDefinition, TransformServices } from '../transforms/types'
import { isReplayable, replayChain } from './recipe'
import type { Version } from '../../shared/library'

export interface MaterializerDeps {
  repo: Repo
  store: ContentStore
  registry: Map<string, TransformDefinition>
  services: Omit<TransformServices, 'reportProgress'>
  lruCapacity?: number
}

export interface Materializer {
  /** Ensure a version's blob exists on disk; recompute it if cold. Returns the file path. */
  ensureMaterialized: (versionId: string) => Promise<string>
}

export function createMaterializer(deps: MaterializerDeps): Materializer {
  const { repo, store, registry, services } = deps
  const capacity = deps.lruCapacity ?? 8
  const lru: string[] = [] // version ids, most-recent last

  const isProtected = (v: Version, tips: Set<string>): boolean =>
    v.parentId === null || tips.has(v.id) || !isReplayable(v.recipe, registry)

  const touch = (versionId: string): void => {
    const i = lru.indexOf(versionId)
    if (i >= 0) lru.splice(i, 1)
    lru.push(versionId)
    evictIfNeeded()
  }

  /** Walk parent links up to the nearest materialized ancestor. */
  const ancestorsToReplay = (v: Version): Version[] => {
    const chain: Version[] = []
    let cur: Version | null = v
    while (cur && !cur.materialized) {
      chain.unshift(cur)
      cur = cur.parentId ? repo.getVersion(cur.parentId) : null
    }
    if (!cur) throw new Error(`no materialized ancestor for version ${v.id}`)
    return [cur, ...chain] // [materializedAncestor, ...coldDescendants]
  }

  const evictIfNeeded = (): void => {
    if (lru.length <= capacity) return
    const tips = new Set(
      repo.db
        .prepare('SELECT tip_version_id AS id FROM branches')
        .all()
        .map((r) => (r as { id: string }).id)
    )
    for (let i = 0; i < lru.length; i++) {
      const v = repo.getVersion(lru[i])
      if (!v || isProtected(v, tips)) continue
      if (v.blobHash) repo.derefBlob(v.blobHash, store)
      repo.setVersionBlob(v.id, null, false)
      lru.splice(i, 1)
      return
    }
  }

  return {
    async ensureMaterialized(versionId: string): Promise<string> {
      const v = repo.getVersion(versionId)
      if (!v) throw new Error(`unknown version ${versionId}`)
      if (v.materialized && v.blobHash && store.has(v.blobHash)) {
        touch(versionId)
        return store.pathFor(v.blobHash)
      }
      const chain = ancestorsToReplay(v) // [matAncestor, ...cold]
      let currentFile = store.pathFor(chain[0].blobHash!)
      const work = mkdtempSync(join(tmpdir(), 'plucker-replay-'))
      for (let i = 1; i < chain.length; i++) {
        const cold = chain[i]
        currentFile = await replayChain(currentFile, work, cold.recipe, registry, services)
        const blob = store.put(currentFile)
        repo.refBlob(blob, store)
        repo.setVersionBlob(cold.id, blob.hash, true)
        touch(cold.id)
      }
      return store.pathFor(repo.getVersion(versionId)!.blobHash!)
    }
  }
}
