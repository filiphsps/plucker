import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import type { FieldSpec, FieldErrorCode } from '../../../../shared/forms/field'
import { useItemForm } from './use-item-form'

const ERROR_KEY = {
  required: 'forms.error.required',
  tooLong: 'forms.error.tooLong'
} as const satisfies Record<FieldErrorCode, string>

/** Inline single-field editor: click the value to edit it; Enter/blur saves (only when
 * valid AND changed), Esc cancels. The first consumer of the editable-item form core; a
 * future modal can drive `useItemForm` the same way. Set `autoEdit` to open it from an
 * external command (e.g. a "Rename" context-menu item); call `onAutoEditDone` so the
 * caller can clear the one-shot intent. */
export function InlineEdit({
  value,
  spec,
  onSave,
  autoEdit = false,
  onAutoEditDone,
  displayClassName = '',
  inputClassName = '',
  ariaLabel
}: {
  value: string
  spec: FieldSpec
  onSave: (next: string) => void | Promise<void>
  autoEdit?: boolean
  onAutoEditDone?: () => void
  displayClassName?: string
  inputClassName?: string
  ariaLabel?: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const key = spec.key
  const [editing, setEditing] = useState(false)
  const form = useItemForm({
    specs: [spec],
    initial: { [key]: value },
    onSubmit: async (vals) => {
      await onSave(vals[key])
      setEditing(false)
    }
  })

  const begin = (): void => {
    form.reset({ [key]: value })
    setEditing(true)
  }
  const cancel = (): void => {
    form.reset({ [key]: value })
    setEditing(false)
  }

  // One-shot external activation (e.g. a "Rename" command from a context menu).
  const armed = useRef(false)
  useEffect(() => {
    if (autoEdit && !armed.current) {
      armed.current = true
      begin()
      onAutoEditDone?.()
    } else if (!autoEdit) {
      armed.current = false
    }
    // begin/onAutoEditDone are stable enough for this one-shot trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit])

  if (!editing) {
    return (
      <button
        type="button"
        onClick={begin}
        aria-label={ariaLabel ?? t('library.rename')}
        className={
          'group/inline inline-flex max-w-full items-center gap-2 text-left ' + displayClassName
        }
      >
        <span className="truncate">{value}</span>
        <Pencil
          size={14}
          className="flex-none opacity-0 transition-opacity group-hover/inline:opacity-60"
        />
      </button>
    )
  }

  const err = form.error
  return (
    <span className="inline-flex flex-col gap-1">
      <input
        autoFocus
        value={form.values[key]}
        disabled={form.submitting}
        onChange={(e) => form.setValue(key, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (form.error) return
            if (form.dirty) void form.submit()
            else cancel()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        onBlur={() => {
          if (form.dirty && !form.error) void form.submit()
          else cancel()
        }}
        className={inputClassName}
      />
      {err && <span className="font-mono text-[10px] text-red-400">{t(ERROR_KEY[err])}</span>}
    </span>
  )
}
