// Persistent cache of the last installed update zip + its blockmap.
//
// Differential updates (see differential.ts) reconstruct the next zip by copying
// unchanged blocks from the *previous* zip's bytes. Those bytes only exist inside
// the zip itself — a blockmap is just an index — so we keep one zip + blockmap
// pair on disk (~750 MB) as the diff base for the next update. Exactly one pair
// is retained: storing a new pair prunes whatever was there before.
import { existsSync, mkdirSync, readdirSync, rmSync, copyFileSync } from 'node:fs'
import { join, basename } from 'node:path'

export interface CachedUpdate {
  zipPath: string
  blockmapPath: string
}

const BLOCKMAP_SUFFIX = '.blockmap'
const isZip = (name: string): boolean => name.endsWith('.zip')

/**
 * Locate the cached zip+blockmap pair, or null when the cache is empty or
 * incomplete (a zip without its blockmap is unusable for diffing).
 */
export function findCachedUpdate(cacheDir: string): CachedUpdate | null {
  if (!existsSync(cacheDir)) return null
  const files = readdirSync(cacheDir)
  const zip = files.find(isZip)
  if (!zip) return null
  const blockmap = zip + BLOCKMAP_SUFFIX
  if (!files.includes(blockmap)) return null
  return { zipPath: join(cacheDir, zip), blockmapPath: join(cacheDir, blockmap) }
}

/** Delete everything in the cache directory (leaving the directory itself). */
export function clearCachedUpdate(cacheDir: string): void {
  if (!existsSync(cacheDir)) return
  for (const f of readdirSync(cacheDir)) rmSync(join(cacheDir, f), { force: true })
}

/**
 * Replace the cache with `zipPath` + `blockmapPath`, pruning any previous
 * contents first, and return the new in-cache paths. Source files are copied
 * (not moved) so callers can still use the originals (e.g. to install from).
 */
export function storeCachedUpdate(
  cacheDir: string,
  zipPath: string,
  blockmapPath: string
): CachedUpdate {
  mkdirSync(cacheDir, { recursive: true })
  clearCachedUpdate(cacheDir)
  const zipDest = join(cacheDir, basename(zipPath))
  const blockmapDest = join(cacheDir, basename(blockmapPath))
  copyFileSync(zipPath, zipDest)
  copyFileSync(blockmapPath, blockmapDest)
  return { zipPath: zipDest, blockmapPath: blockmapDest }
}
