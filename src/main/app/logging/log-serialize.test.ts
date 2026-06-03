import { describe, it, expect } from 'vitest'
import { serializeArgs } from './log-serialize'

describe('serializeArgs', () => {
  it('returns undefined for an all-string argument list (message suffices)', () => {
    expect(serializeArgs([])).toBeUndefined()
    expect(serializeArgs(['a', 'b'])).toBeUndefined()
  })

  it('serializes primitives with their runtime kind', () => {
    expect(serializeArgs(['n', 3])).toEqual([
      { kind: 'string', value: 'n' },
      { kind: 'number', value: 3 }
    ])
    expect(serializeArgs([true, null, undefined])).toEqual([
      { kind: 'boolean', value: true },
      { kind: 'null' },
      { kind: 'undefined' }
    ])
    expect(serializeArgs([10n])).toEqual([{ kind: 'bigint', value: '10' }])
  })

  it('serializes an Error with name, message and stack', () => {
    const [val] = serializeArgs([new TypeError('nope')])!
    expect(val.kind).toBe('error')
    if (val.kind !== 'error') throw new Error('expected error')
    expect(val.name).toBe('TypeError')
    expect(val.message).toBe('nope')
    expect(val.stack).toContain('TypeError: nope')
  })

  it('serializes nested objects and arrays', () => {
    const [val] = serializeArgs([{ a: 1, b: ['x'] }])!
    expect(val).toEqual({
      kind: 'object',
      ctor: undefined,
      entries: [
        { key: 'a', value: { kind: 'number', value: 1 } },
        { key: 'b', value: { kind: 'array', items: [{ kind: 'string', value: 'x' }] } }
      ]
    })
  })

  it('tags the constructor name of class instances', () => {
    class Box {
      n = 1
    }
    const [val] = serializeArgs([new Box()])!
    if (val.kind !== 'object') throw new Error('expected object')
    expect(val.ctor).toBe('Box')
  })

  it('breaks cycles instead of recursing forever', () => {
    const a: Record<string, unknown> = {}
    a.self = a
    const [val] = serializeArgs([a])!
    if (val.kind !== 'object') throw new Error('expected object')
    expect(val.entries[0].value).toEqual({ kind: 'circular' })
  })

  it('caps recursion depth', () => {
    let deep: Record<string, unknown> = { leaf: true }
    for (let i = 0; i < 12; i++) deep = { next: deep }
    const [val] = serializeArgs([deep])!
    // Walk down until we hit the depth guard.
    let cur: unknown = val
    let sawCap = false
    for (let i = 0; i < 20 && cur && typeof cur === 'object'; i++) {
      const node = cur as { kind: string; entries?: { value: unknown }[] }
      if (node.kind === 'max-depth') {
        sawCap = true
        break
      }
      cur = node.entries?.[0]?.value
    }
    expect(sawCap).toBe(true)
  })

  it('caps very large arrays and records how many were dropped', () => {
    const big = Array.from({ length: 250 }, (_, i) => i)
    const [val] = serializeArgs([big])!
    if (val.kind !== 'array') throw new Error('expected array')
    expect(val.items.length).toBeLessThan(250)
    expect(val.truncated).toBeGreaterThan(0)
  })
})
