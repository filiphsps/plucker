// Pure, framework-free field schema + validation. Shared by the renderer form core and
// the main process (defense-in-depth). Returns error *codes*, not messages, so callers
// own i18n. Extend FieldType / FieldErrorCode as new field kinds appear.

export type FieldType = 'text'

export interface FieldSpec {
  key: string
  type: FieldType
  /** i18n key for the field's label (used by labelled form UIs). */
  labelKey: string
  required?: boolean
  maxLength?: number
  /** Trim surrounding whitespace before validating/normalizing. Defaults to true. */
  trim?: boolean
}

export type FieldErrorCode = 'required' | 'tooLong'

/** Normalize a raw input value per its spec (currently: optional trim). */
export function normalizeFieldValue(spec: FieldSpec, raw: string): string {
  return spec.trim === false ? raw : raw.trim()
}

/** Validate a raw value; returns the first failing rule's code, or null when valid. */
export function validateField(spec: FieldSpec, raw: string): FieldErrorCode | null {
  const value = normalizeFieldValue(spec, raw)
  if (spec.required && value.length === 0) return 'required'
  if (spec.maxLength != null && value.length > spec.maxLength) return 'tooLong'
  return null
}
