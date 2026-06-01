import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSettings, saveSettings, expandHome } from './settings'
import { DEFAULT_SETTINGS } from '../shared/defaults'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-'))
  file = join(dir, '.plucker.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('loadSettings', () => {
  it('writes defaults when file is missing', () => {
    const s = loadSettings(file)
    expect(s).toEqual(DEFAULT_SETTINGS)
    expect(existsSync(file)).toBe(true)
  })

  it('merges partial settings onto defaults', () => {
    writeFileSync(file, JSON.stringify({ audio: { preferredBitrate: 192 } }))
    const s = loadSettings(file)
    expect(s.audio.preferredBitrate).toBe(192)
    expect(s.audio.format).toBe('mp3') // default preserved
    expect(s.performance.parallel).toBe(DEFAULT_SETTINGS.performance.parallel)
  })

  it('recreates defaults on corrupt JSON', () => {
    writeFileSync(file, '{ not valid json')
    const s = loadSettings(file)
    expect(s).toEqual(DEFAULT_SETTINGS)
  })
})

describe('saveSettings', () => {
  it('round-trips', () => {
    const next = { ...DEFAULT_SETTINGS, performance: { parallel: 8 } }
    saveSettings(file, next)
    expect(JSON.parse(readFileSync(file, 'utf8')).performance.parallel).toBe(8)
  })
})

describe('expandHome', () => {
  it('expands leading ~', () => {
    expect(expandHome('~/Music/Plucker', '/Users/x')).toBe('/Users/x/Music/Plucker')
  })
  it('leaves absolute paths untouched', () => {
    expect(expandHome('/tmp/a', '/Users/x')).toBe('/tmp/a')
  })
})
