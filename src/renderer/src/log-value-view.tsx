import React, { useState } from 'react'
import type { LogValue, LogLevel } from '../../shared/types'

/** Tailwind text colour per log level — fallback colour for plain-string lines. */
const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-ink-faint',
  info: 'text-ink',
  warn: 'text-warn',
  error: 'text-bad'
}

/**
 * One-line, devtools-style preview of a value for the collapsed state of an
 * object/array. Primitives render their token text; nested containers collapse to a
 * sigil (`{…}`, `Array(n)`) so the preview never recurses or wraps.
 */
function previewText(v: LogValue): string {
  switch (v.kind) {
    case 'string':
      return `'${v.value}'`
    case 'number':
      return String(v.value)
    case 'bigint':
      return `${v.value}n`
    case 'boolean':
      return String(v.value)
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'symbol':
    case 'function':
      return v.value
    case 'date':
      return v.value
    case 'error':
      return `${v.name}: ${v.message}`
    case 'array':
      return v.items.length === 0 ? '[]' : `Array(${v.items.length + (v.truncated ?? 0)})`
    case 'object':
      return v.ctor ? `${v.ctor} {…}` : '{…}'
    case 'circular':
      return '[Circular]'
    case 'max-depth':
      return '…'
  }
}

/** A disclosure-triangle node for objects, arrays and errors (with their stack). */
function Expandable({
  summary,
  color,
  children
}: {
  summary: string
  color: string
  children: () => React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <span className="inline-flex flex-col align-top">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-start gap-1 text-left hover:opacity-80"
      >
        <span className="select-none text-ink-faint">{open ? '▾' : '▸'}</span>
        <span className={color}>{summary}</span>
      </button>
      {open && <span className="border-l border-line2 pl-3 ml-1.5">{children()}</span>}
    </span>
  )
}

/**
 * Render a single serialized {@link LogValue} with type-coloured syntax. Objects,
 * arrays and errors are collapsible; primitives render inline. `top` strings render
 * unquoted (like a console's leading message arg); nested strings are quoted and
 * green, matching browser devtools.
 */
export function LogValueView({
  value,
  top = false
}: {
  value: LogValue
  top?: boolean
}): React.JSX.Element {
  switch (value.kind) {
    case 'string':
      return top ? (
        <span className="text-ink">{value.value}</span>
      ) : (
        <span className="text-tok-str">&apos;{value.value}&apos;</span>
      )
    case 'number':
      return <span className="text-tok-num">{value.value}</span>
    case 'bigint':
      return <span className="text-tok-num">{value.value}n</span>
    case 'boolean':
      return <span className="text-tok-kw">{String(value.value)}</span>
    case 'null':
      return <span className="text-tok-kw">null</span>
    case 'undefined':
      return <span className="text-tok-kw">undefined</span>
    case 'symbol':
      return <span className="text-tok-str">{value.value}</span>
    case 'function':
      return <span className="text-ink-dim italic">{value.value}</span>
    case 'date':
      return <span className="text-tok-num">{value.value}</span>
    case 'circular':
      return <span className="text-ink-faint italic">[Circular]</span>
    case 'max-depth':
      return <span className="text-ink-faint italic">…</span>
    case 'error':
      return (
        <Expandable summary={`${value.name}: ${value.message}`} color="text-bad">
          {() => (
            <span className="whitespace-pre-wrap text-ink-dim">
              {value.stack ?? `${value.name}: ${value.message}`}
            </span>
          )}
        </Expandable>
      )
    case 'array': {
      if (value.items.length === 0) return <span className="text-ink-faint">[]</span>
      const summary = `Array(${value.items.length + (value.truncated ?? 0)})`
      return (
        <Expandable summary={summary} color="text-ink-dim">
          {() => (
            <span className="flex flex-col">
              {value.items.map((item, i) => (
                <span key={i}>
                  <span className="text-tok-key">{i}</span>
                  <span className="text-ink-faint">: </span>
                  <LogValueView value={item} />
                </span>
              ))}
              {value.truncated ? (
                <span className="text-ink-faint italic">… {value.truncated} more</span>
              ) : null}
            </span>
          )}
        </Expandable>
      )
    }
    case 'object': {
      const summary =
        value.entries.length === 0
          ? value.ctor
            ? `${value.ctor} {}`
            : '{}'
          : `${value.ctor ? `${value.ctor} ` : ''}{ ${value.entries
              .map((e) => `${e.key}: ${previewText(e.value)}`)
              .join(', ')} }`
      if (value.entries.length === 0) return <span className="text-ink-faint">{summary}</span>
      return (
        <Expandable summary={summary} color="text-ink-dim">
          {() => (
            <span className="flex flex-col">
              {value.entries.map((field) => (
                <span key={field.key}>
                  <span className="text-tok-key">{field.key}</span>
                  <span className="text-ink-faint">: </span>
                  <LogValueView value={field.value} />
                </span>
              ))}
              {value.truncated ? (
                <span className="text-ink-faint italic">… {value.truncated} more</span>
              ) : null}
            </span>
          )}
        </Expandable>
      )
    }
  }
}

/**
 * Render a log line's payload: the structured {@link LogValue} arguments when present
 * (rich, type-coloured, expandable), otherwise the flat level-coloured message string.
 */
export function LogMessage({
  message,
  level,
  args
}: {
  message: string
  level: LogLevel
  args?: LogValue[]
}): React.JSX.Element {
  if (!args || args.length === 0) {
    return <span className={LEVEL_COLOR[level]}>{message}</span>
  }
  return (
    <span className="flex flex-wrap items-start gap-x-1.5">
      {args.map((arg, i) => (
        <LogValueView key={i} value={arg} top={i === 0} />
      ))}
    </span>
  )
}
