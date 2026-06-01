// src/renderer/src/SchemaForm.tsx
import React from 'react'
import type { ConfigField } from '../../shared/transforms'

export function SchemaForm({
  fields,
  config,
  onChange,
  t
}: {
  fields: ConfigField[]
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  t: (key: string) => string
}): React.JSX.Element {
  const field = 'w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm'
  const set = (key: string, value: unknown): void => onChange({ ...config, [key]: value })

  return (
    <div className="flex flex-col gap-2 mt-2">
      {fields.map((f) => {
        const value = config[f.key] ?? f.default
        const label = t(f.labelKey)
        if (f.type === 'boolean') {
          return (
            <label key={f.key} className="flex gap-2 items-center text-sm">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => set(f.key, e.target.checked)}
              />
              {label}
            </label>
          )
        }
        if (f.type === 'number') {
          return (
            <label key={f.key} className="text-sm block">
              {label}
              <input
                type="number"
                className={field}
                value={Number(value)}
                min={f.min}
                max={f.max}
                onChange={(e) => set(f.key, Number(e.target.value))}
              />
            </label>
          )
        }
        if (f.type === 'enum') {
          return (
            <label key={f.key} className="text-sm block">
              {label}
              <select
                className={field}
                value={String(value)}
                onChange={(e) => set(f.key, e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          )
        }
        return (
          <label key={f.key} className="text-sm block">
            {label}
            <input
              className={field}
              value={String(value)}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </label>
        )
      })}
    </div>
  )
}
