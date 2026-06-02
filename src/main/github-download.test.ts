import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pickArchZip, pickBlockmapFor, sha512OfFile, type GithubAsset } from './github-download'

const asset = (name: string): GithubAsset => ({
  name,
  browser_download_url: `https://example.test/${name}`,
  size: 1
})

describe('pickArchZip', () => {
  it('matches the arm64 zip by arch tag', () => {
    const assets = [asset('Plucker-0.7.0-arm64-mac.zip'), asset('Plucker-0.7.0-x64-mac.zip')]
    expect(pickArchZip(assets, 'arm64')?.name).toBe('Plucker-0.7.0-arm64-mac.zip')
  })

  it('matches the x64 zip when both carry an arch tag', () => {
    const assets = [asset('Plucker-0.7.0-arm64-mac.zip'), asset('Plucker-0.7.0-x64-mac.zip')]
    expect(pickArchZip(assets, 'x64')?.name).toBe('Plucker-0.7.0-x64-mac.zip')
  })

  it('falls back to the non-arm64 zip for x64 when the x64 artifact has no arch tag', () => {
    const assets = [asset('Plucker-0.7.0-arm64-mac.zip'), asset('Plucker-0.7.0-mac.zip')]
    expect(pickArchZip(assets, 'x64')?.name).toBe('Plucker-0.7.0-mac.zip')
  })

  it('ignores blockmap and dmg assets', () => {
    const assets = [
      asset('Plucker-0.7.0-arm64-mac.zip.blockmap'),
      asset('Plucker-0.7.0-arm64.dmg'),
      asset('Plucker-0.7.0-arm64-mac.zip')
    ]
    expect(pickArchZip(assets, 'arm64')?.name).toBe('Plucker-0.7.0-arm64-mac.zip')
  })

  it('returns null when no matching zip is present', () => {
    expect(pickArchZip([asset('Plucker-0.7.0-arm64-mac.zip')], 'x64')).toBeNull()
    expect(pickArchZip([], 'arm64')).toBeNull()
  })
})

describe('pickBlockmapFor', () => {
  it('finds the blockmap that accompanies a zip', () => {
    const assets = [
      asset('Plucker-0.7.0-arm64-mac.zip'),
      asset('Plucker-0.7.0-arm64-mac.zip.blockmap'),
      asset('Plucker-0.7.0-arm64.dmg')
    ]
    expect(pickBlockmapFor(assets, 'Plucker-0.7.0-arm64-mac.zip')?.name).toBe(
      'Plucker-0.7.0-arm64-mac.zip.blockmap'
    )
  })

  it('returns null when the blockmap is absent', () => {
    expect(
      pickBlockmapFor([asset('Plucker-0.7.0-arm64-mac.zip')], 'Plucker-0.7.0-arm64-mac.zip')
    ).toBeNull()
  })
})

describe('sha512OfFile', () => {
  it('matches crypto.createHash base64 SHA-512', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plucker-sha-'))
    try {
      const file = join(dir, 'blob.bin')
      const body = Buffer.from('the quick brown fox')
      writeFileSync(file, body)
      const expected = createHash('sha512').update(body).digest('base64')
      expect(await sha512OfFile(file)).toBe(expected)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
