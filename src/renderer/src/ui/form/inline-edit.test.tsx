import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../../i18n'
import { InlineEdit } from './inline-edit'
import type { FieldSpec } from '../../../../shared/forms/field'

const spec: FieldSpec = {
  key: 'title',
  type: 'text',
  labelKey: 'x',
  required: true,
  maxLength: 200,
  trim: true
}

describe('InlineEdit', () => {
  it('renders the value and an accessible edit affordance in display mode', () => {
    const html = renderToStaticMarkup(
      <InlineEdit value="Summer Mix" spec={spec} onSave={() => {}} ariaLabel="Rename" />
    )
    expect(html).toContain('Summer Mix')
    expect(html).toContain('aria-label="Rename"')
  })
})
