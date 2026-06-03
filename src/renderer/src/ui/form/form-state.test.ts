import { describe, it, expect } from 'vitest'
import { initForm, setValue, validateAll, isDirty, firstError } from './form-state'
import type { FieldSpec } from '../../../../shared/forms/field'

const specs: FieldSpec[] = [
  { key: 'title', type: 'text', labelKey: 'x', required: true, maxLength: 5, trim: true }
]

describe('form-state', () => {
  it('initForm seeds values and clears errors; not dirty', () => {
    const s = initForm(specs, { title: 'Hi' })
    expect(s.values.title).toBe('Hi')
    expect(s.errors.title).toBeNull()
    expect(isDirty(s)).toBe(false)
  })
  it('setValue revalidates just that field and marks dirty', () => {
    let s = initForm(specs, { title: 'Hi' })
    s = setValue(s, 'title', '')
    expect(s.errors.title).toBe('required')
    expect(isDirty(s)).toBe(true)
  })
  it('isDirty compares normalized values (trimmed)', () => {
    let s = initForm(specs, { title: 'Hi' })
    s = setValue(s, 'title', '  Hi  ')
    expect(isDirty(s)).toBe(false)
  })
  it('validateAll + firstError surface the first failing rule', () => {
    let s = initForm(specs, { title: 'toolong' })
    s = validateAll(s)
    expect(firstError(s)).toBe('tooLong')
  })
})
