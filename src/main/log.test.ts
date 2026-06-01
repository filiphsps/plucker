import { describe, it, expect, beforeEach, vi } from 'vitest'
import { log, addLogTransport, getLogTail, installProcessErrorHandlers, __resetLog } from './log'
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

  describe('console-style argument formatting', () => {
    let last: LogEntry | undefined
    beforeEach(() => {
      last = undefined
      addLogTransport((e) => (last = e))
    })

    it('joins multiple args with spaces, like console', () => {
      log.info('app', 'count', 3, true)
      expect(last?.message).toBe('count 3 true')
    })

    it('honours printf-style format specifiers', () => {
      log.info('app', 'retry %d of %d for %s', 2, 5, 'track')
      expect(last?.message).toBe('retry 2 of 5 for track')
    })

    it('inspects objects on a single line', () => {
      log.debug('app', 'payload', { a: 1, b: ['x'] })
      expect(last?.message).toBe("payload { a: 1, b: [ 'x' ] }")
    })

    it('renders an Error with its message and stack', () => {
      log.error('app', 'boom:', new Error('kaboom'))
      expect(last?.message).toContain('boom: Error: kaboom')
      expect(last?.message).toContain('at ') // stack frame
    })

    it('treats a lone trailing percent literally', () => {
      log.info('app', 'progress 100%')
      expect(last?.message).toBe('progress 100%')
    })

    it('produces an empty message when called with no args', () => {
      log.debug('app')
      expect(last?.message).toBe('')
    })
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

  describe('installProcessErrorHandlers', () => {
    it('routes uncaught exceptions and unhandled rejections to log.error', () => {
      const seen: LogEntry[] = []
      addLogTransport((e) => seen.push(e))
      // Silence the real console.error mirror for this test.
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const dispose = installProcessErrorHandlers()
      try {
        process.emit('uncaughtException', new Error('unhandled boom'))
        process.emit('unhandledRejection', new Error('rejected boom'), Promise.resolve())
      } finally {
        dispose()
        spy.mockRestore()
      }
      const errors = seen.filter((e) => e.level === 'error')
      expect(errors).toHaveLength(2)
      expect(errors[0].message).toContain('uncaught exception')
      expect(errors[0].message).toContain('unhandled boom')
      expect(errors[1].message).toContain('unhandled rejection')
      expect(errors[1].message).toContain('rejected boom')
    })

    it('returns a disposer that detaches the handlers', () => {
      const before = process.listenerCount('uncaughtException')
      const dispose = installProcessErrorHandlers()
      expect(process.listenerCount('uncaughtException')).toBe(before + 1)
      dispose()
      expect(process.listenerCount('uncaughtException')).toBe(before)
    })
  })
})
