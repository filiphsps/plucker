import {
  validateField,
  normalizeFieldValue,
  type FieldSpec,
  type FieldErrorCode
} from '../../../../shared/forms/field'

export interface FormState {
  specs: FieldSpec[]
  values: Record<string, string>
  initial: Record<string, string>
  errors: Record<string, FieldErrorCode | null>
}

/** Build a fresh form state from specs + initial values (no validation run yet). */
export function initForm(specs: FieldSpec[], initial: Record<string, string>): FormState {
  const values: Record<string, string> = {}
  const errors: Record<string, FieldErrorCode | null> = {}
  for (const s of specs) {
    values[s.key] = initial[s.key] ?? ''
    errors[s.key] = null
  }
  return { specs, values, initial: { ...values }, errors }
}

const specFor = (s: FormState, key: string): FieldSpec | undefined =>
  s.specs.find((f) => f.key === key)

/** Set one field's value and re-validate just that field. */
export function setValue(s: FormState, key: string, raw: string): FormState {
  const spec = specFor(s, key)
  return {
    ...s,
    values: { ...s.values, [key]: raw },
    errors: { ...s.errors, [key]: spec ? validateField(spec, raw) : null }
  }
}

/** Validate every field; returns a new state with all errors populated. */
export function validateAll(s: FormState): FormState {
  const errors: Record<string, FieldErrorCode | null> = {}
  for (const spec of s.specs) errors[spec.key] = validateField(spec, s.values[spec.key] ?? '')
  return { ...s, errors }
}

/** True when any field's normalized value differs from its initial value. */
export function isDirty(s: FormState): boolean {
  return s.specs.some((spec) => {
    const now = normalizeFieldValue(spec, s.values[spec.key] ?? '')
    const was = normalizeFieldValue(spec, s.initial[spec.key] ?? '')
    return now !== was
  })
}

/** The first non-null error across fields (in spec order), or null. */
export function firstError(s: FormState): FieldErrorCode | null {
  for (const spec of s.specs) {
    const e = s.errors[spec.key]
    if (e) return e
  }
  return null
}
