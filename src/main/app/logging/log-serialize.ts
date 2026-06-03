/**
 * Turn arbitrary log arguments into the structured, IPC-safe {@link LogValue} form the
 * developer console renders with type colours and expandable nodes. This is the
 * structured counterpart to the flat `util.format` string kept on every {@link LogEntry}.
 *
 * Guards keep a stray giant or cyclic object from bloating the IPC payload: recursion is
 * depth-capped, object/array breadth is capped, and back-references are detected.
 */
import type { LogValue, LogEntryField } from '@shared/types'

const MAX_DEPTH = 8
const MAX_ENTRIES = 100

function serializeValue(value: unknown, depth: number, seen: WeakSet<object>): LogValue {
  switch (typeof value) {
    case 'string':
      return { kind: 'string', value }
    case 'number':
      return { kind: 'number', value }
    case 'boolean':
      return { kind: 'boolean', value }
    case 'bigint':
      return { kind: 'bigint', value: value.toString() }
    case 'undefined':
      return { kind: 'undefined' }
    case 'symbol':
      return { kind: 'symbol', value: value.toString() }
    case 'function':
      return { kind: 'function', value: `ƒ ${value.name || '(anonymous)'}` }
  }

  if (value === null) return { kind: 'null' }

  // From here `value` is a non-null object.
  const obj = value as object
  if (seen.has(obj)) return { kind: 'circular' }
  if (depth >= MAX_DEPTH) return { kind: 'max-depth' }

  if (value instanceof Error) {
    return { kind: 'error', name: value.name, message: value.message, stack: value.stack }
  }
  if (value instanceof Date) {
    return { kind: 'date', value: value.toISOString() }
  }

  seen.add(obj)
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ENTRIES).map((v) => serializeValue(v, depth + 1, seen))
      const truncated = value.length - items.length
      return truncated > 0 ? { kind: 'array', items, truncated } : { kind: 'array', items }
    }

    const keys = Object.keys(value as Record<string, unknown>)
    const entries: LogEntryField[] = keys.slice(0, MAX_ENTRIES).map((key) => ({
      key,
      value: serializeValue((value as Record<string, unknown>)[key], depth + 1, seen)
    }))
    const ctor = obj.constructor?.name
    const truncated = keys.length - entries.length
    return {
      kind: 'object',
      ctor: ctor && ctor !== 'Object' ? ctor : undefined,
      entries,
      ...(truncated > 0 ? { truncated } : {})
    }
  } finally {
    seen.delete(obj)
  }
}

/**
 * Serialize a log call's arguments. Returns `undefined` when every argument is a plain
 * string — those lines are fully represented by the formatted `message`, so there is
 * nothing structured worth shipping.
 */
export function serializeArgs(args: unknown[]): LogValue[] | undefined {
  if (args.length === 0 || args.every((a) => typeof a === 'string')) return undefined
  return args.map((a) => serializeValue(a, 0, new WeakSet()))
}
