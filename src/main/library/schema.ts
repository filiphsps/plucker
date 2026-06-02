import type { Database } from 'better-sqlite3'

const DDL = `
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
  source_url TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY, path TEXT NOT NULL, size INTEGER NOT NULL,
  refcount INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS track_instances (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  source_video_id TEXT, source_url TEXT, source_audio_hash TEXT,
  order_index INTEGER NOT NULL, title TEXT NOT NULL,
  active_branch_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES track_instances(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES versions(id),
  blob_hash TEXT REFERENCES blobs(hash),
  recipe TEXT NOT NULL DEFAULT '{"steps":[]}',
  materialized INTEGER NOT NULL DEFAULT 0,
  label TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES track_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL, tip_version_id TEXT NOT NULL REFERENCES versions(id)
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, ts TEXT NOT NULL,
  collection_id TEXT, track_id TEXT, version_id TEXT, summary TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_collection ON track_instances(collection_id);
CREATE INDEX IF NOT EXISTS idx_versions_track ON versions(track_id);
CREATE INDEX IF NOT EXISTS idx_branches_track ON branches(track_id);
CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity(ts);
`

/** Create all tables/indexes (idempotent) and set pragmas. */
export function migrate(db: Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(DDL)
}
