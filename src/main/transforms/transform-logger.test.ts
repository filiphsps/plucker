import { describe, it, expect, vi } from 'vitest'
import { withPrefix, silentTransformLog } from './transform-logger'
import type { TransformLog } from './types'

describe('withPrefix', () => {
  it('prepends the prefix as a leading argument at every level', () => {
    const base: TransformLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() }
    const log = withPrefix(base, '[auto-tag]')

    log.info('resolved', 5)
    log.warn('skipped')
    log.debug('cache hit')

    expect(base.info).toHaveBeenCalledWith('[auto-tag]', 'resolved', 5)
    expect(base.warn).toHaveBeenCalledWith('[auto-tag]', 'skipped')
    expect(base.debug).toHaveBeenCalledWith('[auto-tag]', 'cache hit')
  })
})

describe('silentTransformLog', () => {
  it('accepts every level without throwing', () => {
    expect(() => {
      silentTransformLog.debug('x')
      silentTransformLog.info('y')
      silentTransformLog.warn('z')
    }).not.toThrow()
  })
})
