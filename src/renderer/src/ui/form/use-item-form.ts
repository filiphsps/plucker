import { useCallback, useState } from 'react'
import type { FieldSpec } from '../../../../shared/forms/field'
import {
  initForm,
  setValue as setFieldValue,
  validateAll,
  isDirty as formIsDirty,
  firstError as formFirstError,
  type FormState
} from './form-state'

export interface ItemForm {
  values: Record<string, string>
  errors: FormState['errors']
  dirty: boolean
  submitting: boolean
  error: ReturnType<typeof formFirstError>
  setValue: (key: string, raw: string) => void
  submit: () => Promise<void>
  reset: (initial?: Record<string, string>) => void
}

/** Headless form state for editing an item's fields. UI-agnostic: an inline editor or a
 * modal can both drive it. `submit()` validates, then (only if valid AND dirty) awaits
 * `onSubmit` with the current raw values. */
export function useItemForm(opts: {
  specs: FieldSpec[]
  initial: Record<string, string>
  onSubmit: (values: Record<string, string>) => void | Promise<void>
}): ItemForm {
  const { specs, initial, onSubmit } = opts
  const [state, setState] = useState<FormState>(() => initForm(specs, initial))
  const [submitting, setSubmitting] = useState(false)

  const setValue = useCallback((key: string, raw: string) => {
    setState((s) => setFieldValue(s, key, raw))
  }, [])

  const reset = useCallback(
    (next?: Record<string, string>) => setState(initForm(specs, next ?? initial)),
    [specs, initial]
  )

  const submit = useCallback(async () => {
    const validated = validateAll(state)
    setState(validated)
    if (formFirstError(validated) || !formIsDirty(validated)) return
    setSubmitting(true)
    try {
      await onSubmit(validated.values)
    } finally {
      setSubmitting(false)
    }
  }, [state, onSubmit])

  return {
    values: state.values,
    errors: state.errors,
    dirty: formIsDirty(state),
    submitting,
    error: formFirstError(state),
    setValue,
    submit,
    reset
  }
}
