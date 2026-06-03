import type { Database, RunResult } from 'better-sqlite3'
import type {
  Collection,
  CollectionKind,
  TrackInstance,
  Version,
  Branch,
  Blob,
  ActivityEvent,
  ActivityType,
  Recipe
} from '../../shared/library'

/** A raw SQLite row: column name → value. Mappers narrow it to a typed model. */
type Row = Record<string, unknown>
const row = (v: unknown): Row => v as Row
const str = (v: unknown): string => v as string
const opt = (v: unknown): string | undefined => (v ?? undefined) as string | undefined

// --- row <-> model mappers -------------------------------------------------
const toCollection = (raw: unknown): Collection => {
  const r = row(raw)
  return {
    id: str(r.id),
    kind: r.kind as CollectionKind,
    title: str(r.title),
    sourceUrl: opt(r.source_url),
    createdAt: str(r.created_at)
  }
}
const toTrack = (raw: unknown): TrackInstance => {
  const r = row(raw)
  return {
    id: str(r.id),
    collectionId: str(r.collection_id),
    sourceVideoId: opt(r.source_video_id),
    sourceUrl: opt(r.source_url),
    sourceAudioHash: opt(r.source_audio_hash),
    orderIndex: r.order_index as number,
    title: str(r.title),
    activeBranchId: str(r.active_branch_id)
  }
}
const toVersion = (raw: unknown): Version => {
  const r = row(raw)
  return {
    id: str(r.id),
    trackId: str(r.track_id),
    parentId: (r.parent_id ?? null) as string | null,
    blobHash: (r.blob_hash ?? null) as string | null,
    recipe: JSON.parse(str(r.recipe)) as Recipe,
    materialized: !!r.materialized,
    label: opt(r.label),
    createdAt: str(r.created_at)
  }
}
const toBranch = (raw: unknown): Branch => {
  const r = row(raw)
  return {
    id: str(r.id),
    trackId: str(r.track_id),
    name: str(r.name),
    tipVersionId: str(r.tip_version_id)
  }
}
const toBlob = (raw: unknown): Blob => {
  const r = row(raw)
  return {
    hash: str(r.hash),
    path: str(r.path),
    size: r.size as number,
    refcount: r.refcount as number
  }
}
const toActivity = (raw: unknown): ActivityEvent => {
  const r = row(raw)
  return {
    id: str(r.id),
    type: r.type as ActivityType,
    ts: str(r.ts),
    collectionId: opt(r.collection_id),
    trackId: opt(r.track_id),
    versionId: opt(r.version_id),
    summary: str(r.summary)
  }
}

export interface Repo {
  db: Database
  insertCollection: (c: Collection) => RunResult
  getCollection: (id: string) => Collection | null
  listCollections: () => Collection[]
  renameCollection: (id: string, title: string) => RunResult
  insertTrack: (t: TrackInstance) => RunResult
  getTrack: (id: string) => TrackInstance | null
  listTracks: (collectionId: string) => TrackInstance[]
  setActiveBranch: (trackId: string, branchId: string) => RunResult
  insertVersion: (ver: Version) => RunResult
  getVersion: (id: string) => Version | null
  listVersions: (trackId: string) => Version[]
  setVersionBlob: (id: string, hash: string | null, materialized: boolean) => RunResult
  setVersionLabel: (id: string, label: string) => RunResult
  insertBranch: (b: Branch) => RunResult
  getBranch: (id: string) => Branch | null
  listBranches: (trackId: string) => Branch[]
  setBranchTip: (id: string, versionId: string) => RunResult
  setBranchName: (id: string, name: string) => RunResult
  getBlob: (hash: string) => Blob | null
  listActivity: (limit?: number) => ActivityEvent[]
  insertActivity: (e: ActivityEvent) => RunResult
  refBlob: (blob: { hash: string; path: string; size: number }, store?: unknown) => void
  derefBlob: (hash: string, store: { remove(h: string): void }) => void
  deleteTrack: (trackId: string, store: { remove(h: string): void }) => void
  deleteCollection: (collectionId: string, store: { remove(h: string): void }) => void
  deleteVersion: (versionId: string, store: { remove(h: string): void }) => void
}

export function createRepo(db: Database): Repo {
  const stmt = {
    insCollection: db.prepare(
      'INSERT INTO collections (id,kind,title,source_url,created_at) VALUES (@id,@kind,@title,@sourceUrl,@createdAt)'
    ),
    getCollection: db.prepare('SELECT * FROM collections WHERE id=?'),
    listCollections: db.prepare('SELECT * FROM collections ORDER BY created_at DESC'),
    renameCollection: db.prepare('UPDATE collections SET title=? WHERE id=?'),
    insTrack: db.prepare(
      `INSERT INTO track_instances (id,collection_id,source_video_id,source_url,source_audio_hash,order_index,title,active_branch_id)
       VALUES (@id,@collectionId,@sourceVideoId,@sourceUrl,@sourceAudioHash,@orderIndex,@title,@activeBranchId)`
    ),
    getTrack: db.prepare('SELECT * FROM track_instances WHERE id=?'),
    listTracks: db.prepare(
      'SELECT * FROM track_instances WHERE collection_id=? ORDER BY order_index'
    ),
    setActiveBranch: db.prepare('UPDATE track_instances SET active_branch_id=? WHERE id=?'),
    insVersion: db.prepare(
      `INSERT INTO versions (id,track_id,parent_id,blob_hash,recipe,materialized,label,created_at)
       VALUES (@id,@trackId,@parentId,@blobHash,@recipe,@materialized,@label,@createdAt)`
    ),
    getVersion: db.prepare('SELECT * FROM versions WHERE id=?'),
    listVersions: db.prepare('SELECT * FROM versions WHERE track_id=? ORDER BY created_at'),
    setVersionBlob: db.prepare('UPDATE versions SET blob_hash=?, materialized=? WHERE id=?'),
    setVersionLabel: db.prepare('UPDATE versions SET label=? WHERE id=?'),
    delVersion: db.prepare('DELETE FROM versions WHERE id=?'),
    insBranch: db.prepare(
      'INSERT INTO branches (id,track_id,name,tip_version_id) VALUES (@id,@trackId,@name,@tipVersionId)'
    ),
    getBranch: db.prepare('SELECT * FROM branches WHERE id=?'),
    listBranches: db.prepare('SELECT * FROM branches WHERE track_id=? ORDER BY name'),
    setBranchTip: db.prepare('UPDATE branches SET tip_version_id=? WHERE id=?'),
    setBranchName: db.prepare('UPDATE branches SET name=? WHERE id=?'),
    getBlob: db.prepare('SELECT * FROM blobs WHERE hash=?'),
    insBlob: db.prepare('INSERT INTO blobs (hash,path,size,refcount) VALUES (?,?,?,0)'),
    incBlob: db.prepare('UPDATE blobs SET refcount = refcount + 1 WHERE hash=?'),
    decBlob: db.prepare('UPDATE blobs SET refcount = refcount - 1 WHERE hash=?'),
    delBlob: db.prepare('DELETE FROM blobs WHERE hash=?'),
    insActivity: db.prepare(
      `INSERT INTO activity (id,type,ts,collection_id,track_id,version_id,summary)
       VALUES (@id,@type,@ts,@collectionId,@trackId,@versionId,@summary)`
    ),
    listActivity: db.prepare('SELECT * FROM activity ORDER BY ts DESC LIMIT ?')
  }

  const v = (x: unknown): unknown => x ?? null // sqlite wants null, not undefined

  const repo = {
    db,
    insertCollection: (c: Collection) =>
      stmt.insCollection.run({ ...c, sourceUrl: v(c.sourceUrl) }),
    getCollection: (id: string) => {
      const r = stmt.getCollection.get(id)
      return r ? toCollection(r) : null
    },
    listCollections: () => stmt.listCollections.all().map(toCollection),
    renameCollection: (id: string, title: string) => stmt.renameCollection.run(title, id),

    insertTrack: (t: TrackInstance) =>
      stmt.insTrack.run({
        ...t,
        sourceVideoId: v(t.sourceVideoId),
        sourceUrl: v(t.sourceUrl),
        sourceAudioHash: v(t.sourceAudioHash)
      }),
    getTrack: (id: string) => {
      const r = stmt.getTrack.get(id)
      return r ? toTrack(r) : null
    },
    listTracks: (collectionId: string) => stmt.listTracks.all(collectionId).map(toTrack),
    setActiveBranch: (trackId: string, branchId: string) =>
      stmt.setActiveBranch.run(branchId, trackId),

    insertVersion: (ver: Version) =>
      stmt.insVersion.run({
        ...ver,
        parentId: v(ver.parentId),
        blobHash: v(ver.blobHash),
        recipe: JSON.stringify(ver.recipe),
        materialized: ver.materialized ? 1 : 0,
        label: v(ver.label)
      }),
    getVersion: (id: string) => {
      const r = stmt.getVersion.get(id)
      return r ? toVersion(r) : null
    },
    listVersions: (trackId: string) => stmt.listVersions.all(trackId).map(toVersion),
    setVersionBlob: (id: string, hash: string | null, materialized: boolean) =>
      stmt.setVersionBlob.run(v(hash), materialized ? 1 : 0, id),
    setVersionLabel: (id: string, label: string) => stmt.setVersionLabel.run(label, id),

    insertBranch: (b: Branch) => stmt.insBranch.run(b),
    getBranch: (id: string) => {
      const r = stmt.getBranch.get(id)
      return r ? toBranch(r) : null
    },
    listBranches: (trackId: string) => stmt.listBranches.all(trackId).map(toBranch),
    setBranchTip: (id: string, versionId: string) => stmt.setBranchTip.run(versionId, id),
    setBranchName: (id: string, name: string) => stmt.setBranchName.run(name, id),

    getBlob: (hash: string) => {
      const r = stmt.getBlob.get(hash)
      return r ? toBlob(r) : null
    },
    listActivity: (limit = 200) => stmt.listActivity.all(limit).map(toActivity),
    insertActivity: (e: ActivityEvent) =>
      stmt.insActivity.run({
        ...e,
        collectionId: v(e.collectionId),
        trackId: v(e.trackId),
        versionId: v(e.versionId)
      }),

    /** Register a blob row if new, then increment its refcount. Transactional. */
    refBlob(blob: { hash: string; path: string; size: number }) {
      db.transaction(() => {
        if (!stmt.getBlob.get(blob.hash)) stmt.insBlob.run(blob.hash, blob.path, blob.size)
        stmt.incBlob.run(blob.hash)
      })()
    },
    /** Decrement a blob's refcount; at zero, delete the row AND the file. Transactional. */
    derefBlob(hash: string, store: { remove(h: string): void }) {
      const removed = db.transaction(() => {
        const row = stmt.getBlob.get(hash) as { refcount: number } | undefined
        if (!row) return false
        if (row.refcount <= 1) {
          stmt.delBlob.run(hash)
          return true
        }
        stmt.decBlob.run(hash)
        return false
      })()
      if (removed) store.remove(hash) // file IO outside the txn; safe — row already gone
    },
    /** Delete a track instance: drop its versions/branches and deref every blob they held. */
    deleteTrack(trackId: string, store: { remove(h: string): void }) {
      const hashes = db.transaction(() => {
        const versions = stmt.listVersions.all(trackId) as Array<{ blob_hash: string | null }>
        const blobHashes = versions.map((r) => r.blob_hash).filter((h): h is string => !!h)
        // FK ON DELETE CASCADE removes versions+branches when the track row goes.
        if (stmt.getTrack.get(trackId))
          db.prepare('DELETE FROM track_instances WHERE id=?').run(trackId)
        const dropped: string[] = []
        for (const h of blobHashes) {
          const row = stmt.getBlob.get(h) as { refcount: number } | undefined
          if (!row) continue
          if (row.refcount <= 1) {
            stmt.delBlob.run(h)
            dropped.push(h)
          } else stmt.decBlob.run(h)
        }
        return dropped
      })()
      for (const h of hashes) store.remove(h)
    },
    /** Delete a collection and all of its tracks (cascade), derefing blobs. */
    deleteCollection(collectionId: string, store: { remove(h: string): void }) {
      const trackIds = (stmt.listTracks.all(collectionId) as Array<{ id: string }>).map((r) => r.id)
      for (const tid of trackIds) repo.deleteTrack(tid, store)
      db.prepare('DELETE FROM collections WHERE id=?').run(collectionId)
    },
    /** Delete a single version (must not be a branch tip; caller enforces). Derefs its blob. */
    deleteVersion(versionId: string, store: { remove(h: string): void }) {
      const hash = db.transaction(() => {
        const row = stmt.getVersion.get(versionId) as { blob_hash: string | null } | undefined
        if (!row) return null
        stmt.delVersion.run(versionId)
        const h = row.blob_hash
        if (!h) return null
        const b = stmt.getBlob.get(h) as { refcount: number } | undefined
        if (!b) return null
        if (b.refcount <= 1) {
          stmt.delBlob.run(h)
          return h
        }
        stmt.decBlob.run(h)
        return null
      })()
      if (hash) store.remove(hash)
    }
  }

  return repo
}
