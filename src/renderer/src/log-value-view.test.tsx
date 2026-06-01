import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LogValueView, LogMessage } from './log-value-view'
import type { LogValue } from '../../shared/types'

const render = (value: LogValue, top = false): string =>
  renderToStaticMarkup(<LogValueView value={value} top={top} />)

describe('LogValueView', () => {
  it('colours numbers with the number token', () => {
    expect(render({ kind: 'number', value: 42 })).toContain('text-tok-num')
    expect(render({ kind: 'number', value: 42 })).toContain('42')
  })

  it('colours booleans/null/undefined as keywords', () => {
    expect(render({ kind: 'boolean', value: true })).toContain('text-tok-kw')
    expect(render({ kind: 'null' })).toContain('null')
    expect(render({ kind: 'undefined' })).toContain('undefined')
  })

  it('renders a top-level string unquoted but nested strings quoted + green', () => {
    expect(render({ kind: 'string', value: 'hi' }, true)).not.toContain('text-tok-str')
    const nested = render({ kind: 'string', value: 'hi' }, false)
    expect(nested).toContain('text-tok-str')
    expect(nested).toContain('&#x27;hi&#x27;') // single quotes, html-escaped
  })

  it('shows an object preview in the collapsed summary', () => {
    const obj: LogValue = {
      kind: 'object',
      entries: [{ key: 'a', value: { kind: 'number', value: 1 } }]
    }
    const html = render(obj)
    expect(html).toContain('{ a: 1 }')
    expect(html).toContain('▸') // collapsed disclosure triangle
  })

  it('summarises arrays by length', () => {
    const arr: LogValue = {
      kind: 'array',
      items: [
        { kind: 'number', value: 1 },
        { kind: 'number', value: 2 }
      ]
    }
    expect(render(arr)).toContain('Array(2)')
  })

  it('renders an error with its name and message in the bad colour', () => {
    const err: LogValue = {
      kind: 'error',
      name: 'TypeError',
      message: 'nope',
      stack: 'TypeError: nope\n  at x'
    }
    const html = render(err)
    expect(html).toContain('text-bad')
    expect(html).toContain('TypeError: nope')
  })
})

describe('LogMessage', () => {
  it('falls back to the flat message when there are no structured args', () => {
    const html = renderToStaticMarkup(<LogMessage message="plain line" level="warn" />)
    expect(html).toContain('plain line')
    expect(html).toContain('text-warn')
  })

  it('renders structured args when present', () => {
    const html = renderToStaticMarkup(
      <LogMessage
        message="count 3"
        level="info"
        args={[
          { kind: 'string', value: 'count' },
          { kind: 'number', value: 3 }
        ]}
      />
    )
    expect(html).toContain('count')
    expect(html).toContain('text-tok-num')
  })
})
