import { describe, it, expect, beforeEach } from 'vitest'
import { log, addLogTransport, getLogTail, __resetLog } from './log'
import type { LogEntry } from '../shared/types'

describe('log', () => {
  beforeEach(() => __resetLog())

  it('fans out stamped entries to registered transports', () => {
    const seen: LogEntry[] = []
    addLogTransport((e) => seen.push(e))
    log.info('app', 'hello')
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ level: 'info', scope: 'app', message: 'hello' })
    expect(typeof seen[0].time).toBe('number')
  })

  it('supports the error level', () => {
    const seen: LogEntry[] = []
    addLogTransport((e) => seen.push(e))
    log.error('yt-dlp', 'boom')
    expect(seen[0].level).toBe('error')
  })

  it('keeps a bounded ring buffer exposed via getLogTail', () => {
    for (let i = 0; i < 1100; i++) log.debug('x', String(i))
    const tail = getLogTail()
    expect(tail).toHaveLength(1000)
    expect(tail[tail.length - 1].message).toBe('1099')
    expect(getLogTail(5)).toHaveLength(5)
    expect(getLogTail(5)[0].message).toBe('1095')
  })

  it('isolates a throwing transport so logging never breaks', () => {
    addLogTransport(() => {
      throw new Error('bad sink')
    })
    const seen: LogEntry[] = []
    addLogTransport((e) => seen.push(e))
    expect(() => log.info('a', 'b')).not.toThrow()
    expect(seen).toHaveLength(1)
  })

  it('unregisters a transport via its returned disposer', () => {
    const seen: LogEntry[] = []
    const off = addLogTransport((e) => seen.push(e))
    log.info('a', '1')
    off()
    log.info('a', '2')
    expect(seen).toHaveLength(1)
  })
})
