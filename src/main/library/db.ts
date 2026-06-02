import Database from 'better-sqlite3'
import { join } from 'node:path'
import { migrate } from './schema'
import { pluckerDir } from '../settings'

let handle: Database.Database | null = null

/** Open (once) the Library DB at ~/.plucker/library.db, migrated and ready. */
export function getLibraryDb(file = join(pluckerDir(), 'library.db')): Database.Database {
  if (handle) return handle
  handle = new Database(file)
  migrate(handle)
  return handle
}

/** Test/maintenance hook: close and forget the singleton. */
export function closeLibraryDb(): void {
  handle?.close()
  handle = null
}
