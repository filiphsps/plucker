import { describe, it, expect } from 'vitest'
import { validateField, normalizeFieldValue, type FieldSpec } from './field'

const title: FieldSpec = {
  key: 'title',
  type: 'text',
  labelKey: 'x',
  required: true,
  maxLength: 5,
  trim: true
}

describe('normalizeFieldValue', () => {
  it('trims by default', () => expect(normalizeFieldValue(title, '  hi  ')).toBe('hi'))
  it('keeps whitespace when trim is false', () =>
    expect(normalizeFieldValue({ ...title, trim: false }, ' hi ')).toBe(' hi '))
})

describe('validateField', () => {
  it('passes a valid value', () => expect(validateField(title, 'abc')).toBeNull())
  it('flags required on empty or whitespace-only', () => {
    expect(validateField(title, '')).toBe('required')
    expect(validateField(title, '   ')).toBe('required')
  })
  it('flags tooLong only past maxLength, measured after trim', () => {
    expect(validateField(title, 'abcde')).toBeNull() // exactly 5
    expect(validateField(title, 'abcdef')).toBe('tooLong')
    expect(validateField(title, '  abcde  ')).toBeNull() // trims to 5
  })
  it('is valid when not required and empty', () =>
    expect(validateField({ ...title, required: false }, '')).toBeNull())
})
