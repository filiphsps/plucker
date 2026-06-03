import React, { useEffect } from 'react'

/** A single transient toast, bottom-centre, auto-dismissing. */
export function Toast({
  message,
  onDone,
  ms = 3200
}: {
  message: string
  onDone: () => void
  ms?: number
}): React.JSX.Element {
  useEffect(() => {
    const id = setTimeout(onDone, ms)
    return () => clearTimeout(id)
  }, [message, ms, onDone])
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="rounded-lg border border-line bg-raise px-4 py-2.5 text-[12.5px] text-ink shadow-[0_12px_30px_rgba(0,0,0,.5)]">
        {message}
      </div>
    </div>
  )
}
