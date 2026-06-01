import React from 'react'
import type { ConfigField } from '../../shared/transforms'
import { Switch } from './ui/switch'

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
  const set = (key: string, value: unknown): void => onChange({ ...config, [key]: value })
  const klass = 'mb-[5px] font-mono text-[9px] uppercase tracking-[1px] text-ink-faint'
  const input =
    'flex h-[30px] items-center rounded-md border border-line bg-[#0a0b0e] px-2.5 font-mono text-[12px] text-ink outline-none'

  return (
    <div className="grid grid-cols-2 gap-x-[18px] gap-y-3 px-3.5 pb-3.5 pl-[41px]">
      {fields.map((f) => {
        const value = config[f.key] ?? f.default
        const label = t(f.labelKey)
        if (f.type === 'boolean') {
          return (
            <label key={f.key} className="flex items-center gap-2.5">
              <Switch checked={Boolean(value)} onChange={(v) => set(f.key, v)} label={label} />
              <span className="text-[12.5px] text-ink">{label}</span>
            </label>
          )
        }
        if (f.type === 'number') {
          return (
            <div key={f.key}>
              <div className={klass}>{label}</div>
              <input
                type="number"
                className={input + ' w-full'}
                value={Number(value)}
                min={f.min}
                max={f.max}
                onChange={(e) => set(f.key, Number(e.target.value))}
              />
            </div>
          )
        }
        if (f.type === 'enum') {
          return (
            <div key={f.key}>
              <div className={klass}>{label}</div>
              <select
                className={input + ' pl-select w-full'}
                value={String(value)}
                onChange={(e) => set(f.key, e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          )
        }
        return (
          <div key={f.key}>
            <div className={klass}>{label}</div>
            <input
              className={input + ' w-full'}
              value={String(value)}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        )
      })}
    </div>
  )
}
