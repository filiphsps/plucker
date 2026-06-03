// src/main/transforms/transform-logger.ts
import { log } from '@app/app/logging/log'
import type { TransformLog } from './types'

const SCOPE = 'transform'

/** Base transform logger: routes every line into the unified main-process logger. */
export function transformLog(): TransformLog {
  return {
    debug: (...args) => log.debug(SCOPE, ...args),
    info: (...args) => log.info(SCOPE, ...args),
    warn: (...args) => log.warn(SCOPE, ...args)
  }
}

/**
 * Wrap a logger so every line is prefixed with `prefix` (e.g. the transform
 * type). The prefix is passed as a leading argument, so the underlying
 * formatter spaces it from the message just like `console.log`.
 */
export function withPrefix(base: TransformLog, prefix: string): TransformLog {
  return {
    debug: (...args) => base.debug(prefix, ...args),
    info: (...args) => base.info(prefix, ...args),
    warn: (...args) => base.warn(prefix, ...args)
  }
}

/** A no-op logger for tests and headless callers that don't want transform chatter. */
export const silentTransformLog: TransformLog = {
  debug: () => {},
  info: () => {},
  warn: () => {}
}
