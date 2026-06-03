import { performance } from 'node:perf_hooks'
import { log } from './log'

/** A running performance span; call end() to record the measure and log it. */
export interface Span {
  end(detail?: string): number
}

let seq = 0

/**
 * Start a performance span backed by `performance.mark` / `performance.measure`.
 *
 * Each span gets a unique id so concurrent spans (e.g. parallel track
 * processing) don't collide. Calling `end()` records the measure, logs its
 * duration at debug level, clears the marks/measure, and returns the duration.
 */
export function startSpan(label: string, scope = 'bench'): Span {
  const id = `${label}#${++seq}`
  const startMark = `${id}:start`
  const endMark = `${id}:end`
  performance.mark(startMark)
  return {
    end(detail?: string): number {
      performance.mark(endMark)
      const measure = performance.measure(id, startMark, endMark)
      performance.clearMarks(startMark)
      performance.clearMarks(endMark)
      performance.clearMeasures(id)
      log.debug(scope, `⏱ ${label} ${measure.duration.toFixed(1)}ms${detail ? ` (${detail})` : ''}`)
      return measure.duration
    }
  }
}

/** Time an async operation as a span; the span is ended even if it throws. */
export async function timed<T>(label: string, scope: string, fn: () => Promise<T>): Promise<T> {
  const span = startSpan(label, scope)
  try {
    return await fn()
  } finally {
    span.end()
  }
}
