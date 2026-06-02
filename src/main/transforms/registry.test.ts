// src/main/transforms/registry.test.ts
import { describe, it, expect } from 'vitest'
import { buildRegistry, getCatalog } from './registry'

describe('registry', () => {
  it('registers the built-ins by type', () => {
    const r = buildRegistry()
    expect(r.get('auto-tag')?.type).toBe('auto-tag')
    expect(r.get('rename')?.type).toBe('rename')
    expect(r.get('square-cover')?.type).toBe('square-cover')
  })
  it('catalog is serializable and omits run()', () => {
    const catalog = getCatalog()
    const json = JSON.parse(JSON.stringify(catalog))
    expect(json.find((m: { type: string }) => m.type === 'auto-tag')).toBeTruthy()
    expect(json.every((m: Record<string, unknown>) => !('run' in m))).toBe(true)
    const autoTag = catalog.find((m) => m.type === 'auto-tag')!
    expect(autoTag.allowMultiple).toBe(false)
    expect(autoTag.configSchema.length).toBeGreaterThan(0)
  })
})
