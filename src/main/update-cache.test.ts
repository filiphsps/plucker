import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findCachedUpdate, storeCachedUpdate, clearCachedUpdate } from './update-cache'

let dir: string
let cacheDir: string
let srcDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-cache-'))
  cacheDir = join(dir, 'update-cache')
  srcDir = join(dir, 'src')
  mkdirSync(srcDir, { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const writeSrc = (name: string, body: string): string => {
  const p = join(srcDir, name)
  writeFileSync(p, body)
  return p
}

describe('findCachedUpdate', () => {
  it('returns null when the cache dir does not exist', () => {
    expect(findCachedUpdate(cacheDir)).toBeNull()
  })

  it('returns null when only a zip is present (no blockmap)', () => {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(join(cacheDir, 'Plucker-1.0.0-arm64-mac.zip'), 'zip')
    expect(findCachedUpdate(cacheDir)).toBeNull()
  })

  it('finds a complete zip+blockmap pair', () => {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(join(cacheDir, 'Plucker-1.0.0-arm64-mac.zip'), 'zip')
    writeFileSync(join(cacheDir, 'Plucker-1.0.0-arm64-mac.zip.blockmap'), 'bm')
    const found = findCachedUpdate(cacheDir)
    expect(found?.zipPath).toBe(join(cacheDir, 'Plucker-1.0.0-arm64-mac.zip'))
    expect(found?.blockmapPath).toBe(join(cacheDir, 'Plucker-1.0.0-arm64-mac.zip.blockmap'))
  })
})

describe('storeCachedUpdate', () => {
  it('copies the pair into the cache and leaves the sources intact', () => {
    const zip = writeSrc('Plucker-1.0.0-arm64-mac.zip', 'ZIPDATA')
    const bm = writeSrc('Plucker-1.0.0-arm64-mac.zip.blockmap', 'BMDATA')
    const stored = storeCachedUpdate(cacheDir, zip, bm)
    expect(existsSync(stored.zipPath)).toBe(true)
    expect(existsSync(stored.blockmapPath)).toBe(true)
    expect(existsSync(zip)).toBe(true) // source not moved
    expect(findCachedUpdate(cacheDir)?.zipPath).toBe(stored.zipPath)
  })

  it('prunes a previous pair so only one remains', () => {
    storeCachedUpdate(
      cacheDir,
      writeSrc('Plucker-1.0.0-arm64-mac.zip', 'old'),
      writeSrc('Plucker-1.0.0-arm64-mac.zip.blockmap', 'oldbm')
    )
    storeCachedUpdate(
      cacheDir,
      writeSrc('Plucker-2.0.0-arm64-mac.zip', 'new'),
      writeSrc('Plucker-2.0.0-arm64-mac.zip.blockmap', 'newbm')
    )
    const remaining = readdirSync(cacheDir).sort()
    expect(remaining).toEqual([
      'Plucker-2.0.0-arm64-mac.zip',
      'Plucker-2.0.0-arm64-mac.zip.blockmap'
    ])
  })
})

describe('clearCachedUpdate', () => {
  it('empties the cache without error when missing', () => {
    expect(() => clearCachedUpdate(cacheDir)).not.toThrow()
  })

  it('removes all cached files', () => {
    storeCachedUpdate(
      cacheDir,
      writeSrc('Plucker-1.0.0-arm64-mac.zip', 'z'),
      writeSrc('Plucker-1.0.0-arm64-mac.zip.blockmap', 'b')
    )
    clearCachedUpdate(cacheDir)
    expect(readdirSync(cacheDir)).toEqual([])
    expect(findCachedUpdate(cacheDir)).toBeNull()
  })
})
