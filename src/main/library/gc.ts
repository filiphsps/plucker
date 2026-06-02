import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Repo } from './repo'
import type { ContentStore } from './content-store'

export interface GcReport {
  removedFiles: string[] // hashes of on-disk blobs deleted (no row or refcount 0)
  demoted: string[] // version ids marked unmaterialized (DB row references missing file)
}

/**
 * Reconcile the content store against the DB. Safe to run on every launch:
 * - on-disk blob with no row (or refcount 0) → delete the file (orphan from a crash
 *   between blob write and DB commit, or a stale row that already lost its refs);
 * - DB row whose file is missing → demote any versions pointing at it to unmaterialized
 *   so they recompute on demand (N2/R7).
 */
export function collectGarbage(repo: Repo, store: ContentStore): GcReport {
  const report: GcReport = { removedFiles: [], demoted: [] }

  // 1. on-disk → DB
  const shards = existsSync(store.root) ? readdirSync(store.root) : []
  for (const shard of shards) {
    if (shard === '.tmp' || shard.startsWith('.')) continue
    const shardDir = join(store.root, shard)
    let files: string[] = []
    try { files = readdirSync(shardDir) } catch { continue }
    for (const file of files) {
      const hash = file.replace(/\.mp3$/i, '')
      const row = repo.getBlob(hash)
      if (!row || row.refcount <= 0) { store.remove(hash); report.removedFiles.push(hash) }
    }
  }

  // 2. DB → on-disk
  const rows = repo.db.prepare('SELECT hash FROM blobs').all() as Array<{ hash: string }>
  for (const { hash } of rows) {
    if (store.has(hash)) continue
    const versions = repo.db.prepare('SELECT id FROM versions WHERE blob_hash=?').all(hash) as Array<{ id: string }>
    for (const { id } of versions) {
      repo.setVersionBlob(id, null, false)
      report.demoted.push(id)
    }
    repo.db.prepare('DELETE FROM blobs WHERE hash=?').run(hash)
  }
  return report
}
