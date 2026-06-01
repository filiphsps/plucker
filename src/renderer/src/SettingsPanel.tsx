import React from 'react'

export function SettingsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end">
      <div className="w-[420px] h-full bg-neutral-950 text-neutral-100 p-5 border-l border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">✕</button>
        </div>
        <p className="text-sm text-neutral-500">Settings coming soon.</p>
      </div>
    </div>
  )
}
