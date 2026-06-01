import React from 'react'
import { Minus, Plus } from 'lucide-react'
import { clampStep } from './stepper-utils'

/** A `− value +` numeric stepper clamped to [min, max]. */
export function Stepper({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (next: number) => void
}): React.JSX.Element {
  const step = (delta: number): void => onChange(clampStep(value, delta, min, max))
  const btn =
    'flex h-8 w-[30px] items-center justify-center text-ink-dim hover:bg-raise hover:text-ink'
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-line bg-[#0a0b0e]">
      <button className={btn} onClick={() => step(-1)} aria-label="decrement">
        <Minus size={15} />
      </button>
      <span className="h-8 w-[42px] border-x border-line text-center font-mono text-[13px] leading-8 tnum text-ink">
        {value}
      </span>
      <button className={btn} onClick={() => step(+1)} aria-label="increment">
        <Plus size={15} />
      </button>
    </div>
  )
}
