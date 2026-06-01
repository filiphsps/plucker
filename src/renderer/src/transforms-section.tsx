// src/renderer/src/TransformsSection.tsx
import React, { useState } from 'react'
import type { TransformInstance, TransformManifest } from '../../shared/transforms'
import { SchemaForm } from './schema-form'
import { move, addInstance, canAdd } from './transform-list-utils'

export function TransformsSection({
  instances,
  catalog,
  onChange,
  t
}: {
  instances: TransformInstance[]
  catalog: TransformManifest[]
  onChange: (next: TransformInstance[]) => void
  t: (key: string) => string
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const byType = (type: string): TransformManifest | undefined =>
    catalog.find((m) => m.type === type)
  const newId = (): string => crypto.randomUUID()

  const heading = 'text-sm uppercase tracking-wide text-neutral-500 mb-2'
  const update = (id: string, patch: Partial<TransformInstance>): void =>
    onChange(instances.map((i) => (i.instanceId === id ? { ...i, ...patch } : i)))

  return (
    <section className="mb-5">
      <h3 className={heading}>{t('settings.sections.transforms')}</h3>
      <ul className="flex flex-col gap-2">
        {instances.map((inst, idx) => {
          const manifest = byType(inst.type)
          const label = manifest ? t(manifest.labelKey) : inst.type
          return (
            <li key={inst.instanceId} className="rounded border border-neutral-800 p-2">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={inst.enabled}
                  onChange={(e) => update(inst.instanceId, { enabled: e.target.checked })}
                />
                <span className="flex-1">{label}</span>
                <button
                  aria-label="up"
                  onClick={() => onChange(move(instances, idx, idx - 1))}
                  className="px-1 text-neutral-400 hover:text-white"
                >
                  ▲
                </button>
                <button
                  aria-label="down"
                  onClick={() => onChange(move(instances, idx, idx + 1))}
                  className="px-1 text-neutral-400 hover:text-white"
                >
                  ▼
                </button>
                <button
                  onClick={() => setOpen(open === inst.instanceId ? null : inst.instanceId)}
                  className="px-1 text-neutral-400 hover:text-white"
                >
                  ⚙
                </button>
                <button
                  aria-label="remove"
                  onClick={() =>
                    onChange(instances.filter((i) => i.instanceId !== inst.instanceId))
                  }
                  className="px-1 text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
              {open === inst.instanceId && manifest && (
                <SchemaForm
                  fields={manifest.configSchema}
                  config={inst.config}
                  onChange={(config) => update(inst.instanceId, { config })}
                  t={t}
                />
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-2">
        <select
          className="w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm"
          value=""
          onChange={(e) => {
            const m = byType(e.target.value)
            if (m) onChange(addInstance(instances, m, newId))
          }}
        >
          <option value="">{t('settings.transforms.add')}</option>
          {catalog.map((m) => (
            <option key={m.type} value={m.type} disabled={!canAdd(instances, m)}>
              {t(m.labelKey)}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
