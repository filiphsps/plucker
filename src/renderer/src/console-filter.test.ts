import { describe, it, expect } from 'vitest'
import { filterEntries, logScopes } from './console-filter'
import type { LogEntry } from '../../shared/types'

const e = (level: LogEntry['level'], scope: string, message = ''): LogEntry => ({
  time: 0,
  level,
  scope,
  message
})

const entries: LogEntry[] = [
  e('info', 'app'),
  e('debug', 'yt-dlp'),
  e('error', 'yt-dlp'),
  e('warn', 'transform')
]

describe('logScopes', () => {
  it('returns the distinct scopes, sorted', () => {
    expect(logScopes(entries)).toEqual(['app', 'transform', 'yt-dlp'])
  })
})

describe('filterEntries', () => {
  it('returns everything when nothing is toggled off', () => {
    expect(filterEntries(entries, new Set(), new Set())).toHaveLength(4)
  })

  it('hides a toggled-off level while keeping the rest', () => {
    const out = filterEntries(entries, new Set(['info']), new Set())
    expect(out).toHaveLength(3)
    expect(out.some((x) => x.level === 'info')).toBe(false)
    expect(out.some((x) => x.level === 'error')).toBe(true)
  })

  it('supports an errors-only view by toggling every other level off', () => {
    const out = filterEntries(entries, new Set(['info', 'debug', 'warn']), new Set())
    expect(out.map((x) => x.level)).toEqual(['error'])
  })

  it('hides a toggled-off scope', () => {
    const out = filterEntries(entries, new Set(), new Set(['yt-dlp']))
    expect(out.map((x) => x.scope)).toEqual(['app', 'transform'])
  })

  it('combines level and scope filters', () => {
    const out = filterEntries(entries, new Set(['debug']), new Set(['transform']))
    expect(out.map((x) => `${x.level}/${x.scope}`)).toEqual(['info/app', 'error/yt-dlp'])
  })
})
