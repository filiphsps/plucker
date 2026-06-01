// src/renderer/src/SchemaForm.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SchemaForm } from './schema-form'
import type { ConfigField } from '../../shared/transforms'

const fields: ConfigField[] = [
  { key: 'flag', labelKey: 'flag', type: 'boolean', default: true },
  { key: 'num', labelKey: 'num', type: 'number', default: 5, min: 0, max: 10 },
  { key: 'txt', labelKey: 'txt', type: 'string', default: 'hi' },
  {
    key: 'mode',
    labelKey: 'mode',
    type: 'enum',
    default: 'a',
    options: [
      { value: 'a', labelKey: 'a' },
      { value: 'b', labelKey: 'b' }
    ]
  }
]

describe('SchemaForm', () => {
  it('renders an input per field, falling back to labelKey for missing translations', () => {
    const html = renderToStaticMarkup(
      <SchemaForm
        fields={fields}
        config={{ flag: false, num: 7, txt: 'yo', mode: 'b' }}
        onChange={() => {}}
        t={(k) => k}
      />
    )
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('type="number"')
    expect(html).toContain('<select')
    expect(html).toContain('value="yo"')
  })
})
