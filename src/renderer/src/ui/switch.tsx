import React from 'react'

/** A small toggle switch. Track turns accent when on; knob slides right. */
export function Switch({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
}): React.JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={
        'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ' +
        (checked ? 'bg-accent' : 'bg-[#262a31]')
      }
    >
      <span
        className={
          'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ' +
          (checked ? 'left-[18px]' : 'left-0.5')
        }
      />
    </button>
  )
}
