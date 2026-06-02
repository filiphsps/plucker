import type { Database } from 'better-sqlite3'
import type {
  Collection, TrackInstance, Version, Branch, Blob, ActivityEvent, Recipe
} from '../../shared/library'

// --- row <-> model mappers -------------------------------------------------
const toCollection = (r: any): Collection => ({
  id: r.id, kind: r.kind, title: r.title, sourceUrl: r.source_url ?? undefined, createdAt: r.created_at
})
const toTrack = (r: any): TrackInstance => ({
  id: r.id, collectionId: r.collection_id, sourceVideoId: r.source_video_id ?? undefined,
  sourceUrl: r.source_url ?? undefined, sourceAudioHash: r.source_audio_hash ?? undefined,
  orderIndex: r.order_index, title: r.title, activeBranchId: r.active_branch_id
})
const toVersion = (r: any): Version => ({
  id: r.id, trackId: r.track_id, parentId: r.parent_id ?? null, blobHash: r.blob_hash ?? null,
  recipe: JSON.parse(r.recipe) as Recipe, materialized: !!r.materialized,
  label: r.label ?? undefined, createdAt: r.created_at
})
const toBranch = (r: any): Branch => ({ id: r.id, trackId: r.track_id, name: r.name, tipVersionId: r.tip_version_id })
const toBlob = (r: any): Blob => ({ hash: r.hash, path: r.path, size: r.size, refcount: r.refcount })
const toActivity = (r: any): ActivityEvent => ({
  id: r.id, type: r.type, ts: r.ts, collectionId: r.collection_id ?? undefined,
  trackId: r.track_id ?? undefined, versionId: r.version_id ?? undefined, summary: r.summary
})

export function createRepo(db: Database) {
  const stmt = {
    insCollection: db.prepare(
      'INSERT INTO collections (id,kind,title,source_url,created_at) VALUES (@id,@kind,@title,@sourceUrl,@createdAt)'
    ),
    getCollection: db.prepare('SELECT * FROM collections WHERE id=?'),
    listCollections: db.prepare('SELECT * FROM collections ORDER BY created_at DESC'),
    insTrack: db.prepare(
      `INSERT INTO track_instances (id,collection_id,source_video_id,source_url,source_audio_hash,order_index,title,active_branch_id)
       VALUES (@id,@collectionId,@sourceVideoId,@sourceUrl,@sourceAudioHash,@orderIndex,@title,@activeBranchId)`
    ),
    getTrack: db.prepare('SELECT * FROM track_instances WHERE id=?'),
    listTracks: db.prepare('SELECT * FROM track_instances WHERE collection_id=? ORDER BY order_index'),
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
    insBranch: db.prepare('INSERT INTO branches (id,track_id,name,tip_version_id) VALUES (@id,@trackId,@name,@tipVersionId)'),
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

  return {
    db,
    insertCollection: (c: Collection) =>
      stmt.insCollection.run({ ...c, sourceUrl: v(c.sourceUrl) }),
    getCollection: (id: string) => { const r = stmt.getCollection.get(id); return r ? toCollection(r) : null },
    listCollections: () => stmt.listCollections.all().map(toCollection),

    insertTrack: (t: TrackInstance) =>
      stmt.insTrack.run({
        ...t, sourceVideoId: v(t.sourceVideoId), sourceUrl: v(t.sourceUrl), sourceAudioHash: v(t.sourceAudioHash)
      }),
    getTrack: (id: string) => { const r = stmt.getTrack.get(id); return r ? toTrack(r) : null },
    listTracks: (collectionId: string) => stmt.listTracks.all(collectionId).map(toTrack),
    setActiveBranch: (trackId: string, branchId: string) => stmt.setActiveBranch.run(branchId, trackId),

    insertVersion: (ver: Version) =>
      stmt.insVersion.run({
        ...ver, parentId: v(ver.parentId), blobHash: v(ver.blobHash),
        recipe: JSON.stringify(ver.recipe), materialized: ver.materialized ? 1 : 0, label: v(ver.label)
      }),
    getVersion: (id: string) => { const r = stmt.getVersion.get(id); return r ? toVersion(r) : null },
    listVersions: (trackId: string) => stmt.listVersions.all(trackId).map(toVersion),
    setVersionBlob: (id: string, hash: string | null, materialized: boolean) =>
      stmt.setVersionBlob.run(v(hash), materialized ? 1 : 0, id),
    setVersionLabel: (id: string, label: string) => stmt.setVersionLabel.run(label, id),

    insertBranch: (b: Branch) => stmt.insBranch.run(b),
    getBranch: (id: string) => { const r = stmt.getBranch.get(id); return r ? toBranch(r) : null },
    listBranches: (trackId: string) => stmt.listBranches.all(trackId).map(toBranch),
    setBranchTip: (id: string, versionId: string) => stmt.setBranchTip.run(versionId, id),
    setBranchName: (id: string, name: string) => stmt.setBranchName.run(name, id),

    getBlob: (hash: string) => { const r = stmt.getBlob.get(hash); return r ? toBlob(r) : null },
    listActivity: (limit = 200) => stmt.listActivity.all(limit).map(toActivity),
    insertActivity: (e: ActivityEvent) =>
      stmt.insActivity.run({ ...e, collectionId: v(e.collectionId), trackId: v(e.trackId), versionId: v(e.versionId) }),

    /** Internal statement bag — used by transactional helpers in Task 5. */
    _stmt: stmt
  }
}

export type Repo = ReturnType<typeof createRepo>
