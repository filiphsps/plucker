import { describe, it, expect } from 'vitest'
import { parseLatestMacYml } from './latest-mac-yml'

const SAMPLE = `version: 0.21.0
files:
  - url: Plucker-0.21.0-arm64-mac.zip
    sha512: QUJDarm64base64==
    size: 12345
  - url: Plucker-0.21.0-mac.zip
    sha512: WFlaeng64base64==
    size: 12346
path: Plucker-0.21.0-arm64-mac.zip
sha512: QUJDarm64base64==
releaseDate: '2026-05-01T00:00:00.000Z'
`

describe('parseLatestMacYml', () => {
  it('reads the version', () => {
    expect(parseLatestMacYml(SAMPLE).version).toBe('0.21.0')
  })

  it('maps each file name to its sha512', () => {
    const { sha512ByName } = parseLatestMacYml(SAMPLE)
    expect(sha512ByName['Plucker-0.21.0-arm64-mac.zip']).toBe('QUJDarm64base64==')
    expect(sha512ByName['Plucker-0.21.0-mac.zip']).toBe('WFlaeng64base64==')
  })

  it('does not absorb the top-level path/sha512 as a file entry', () => {
    const { sha512ByName } = parseLatestMacYml(SAMPLE)
    expect(Object.keys(sha512ByName)).toHaveLength(2)
  })

  it('tolerates empty / malformed input', () => {
    expect(parseLatestMacYml('').sha512ByName).toEqual({})
    expect(parseLatestMacYml('garbage: true').version).toBeNull()
  })
})
