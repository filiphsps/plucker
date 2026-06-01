import React, { useState } from 'react'
import { GripVertical, ArrowUp, ArrowDown, ChevronDown, X, Plus } from 'lucide-react'
import type { TransformInstance, TransformManifest } from '../../shared/transforms'
import { SchemaForm } from './schema-form'
import { Switch } from './ui/switch'
import { move, addInstance, canAdd, hasConfig } from './transform-list-utils'
import { transformConfigComponents } from './transform-config-registry'

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
  const update = (id: string, patch: Partial<TransformInstance>): void =>
    onChange(instances.map((i) => (i.instanceId === id ? { ...i, ...patch } : i)))

  const tool =
    'flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-raise hover:text-ink'

  return (
    <div>
      {instances.map((inst, idx) => {
        const manifest = byType(inst.type)
        const label = manifest ? t(manifest.labelKey) : inst.type
        const expandable = hasConfig(manifest)
        const isOpen = expandable && open === inst.instanceId
        const Custom = transformConfigComponents[inst.type]
        const toggle = (): void => setOpen(isOpen ? null : inst.instanceId)
        return (
          <div key={inst.instanceId} className="border-b border-line2">
            <div className="flex items-center gap-[11px] px-3.5 py-[11px]">
              <span className="flex cursor-grab text-ink-faint">
                <GripVertical size={14} />
              </span>
              <span className="w-4 font-mono text-[10px] text-ink-faint">{idx + 1}</span>
              <Switch
                checked={inst.enabled}
                onChange={(v) => update(inst.instanceId, { enabled: v })}
                label={label}
              />
              {expandable ? (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={isOpen}
                  className={
                    'flex-1 text-left text-[13px] font-medium ' +
                    (inst.enabled ? 'text-ink' : 'text-ink-faint')
                  }
                >
                  {label}
                </button>
              ) : (
                <span
                  className={
                    'flex-1 text-[13px] font-medium ' +
                    (inst.enabled ? 'text-ink' : 'text-ink-faint')
                  }
                >
                  {label}
                </span>
              )}
              <div className="flex gap-0.5">
                <button
                  aria-label="up"
                  className={tool}
                  onClick={() => onChange(move(instances, idx, idx - 1))}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label="down"
                  className={tool}
                  onClick={() => onChange(move(instances, idx, idx + 1))}
                >
                  <ArrowDown size={14} />
                </button>
                {expandable && (
                  <button
                    aria-label={isOpen ? 'collapse' : 'expand'}
                    className={tool + (isOpen ? ' text-accent' : '')}
                    onClick={toggle}
                  >
                    <ChevronDown
                      size={15}
                      className={'transition-transform' + (isOpen ? ' rotate-180' : '')}
                    />
                  </button>
                )}
                <button
                  aria-label="remove"
                  className={tool + ' hover:text-bad'}
                  onClick={() =>
                    onChange(instances.filter((i) => i.instanceId !== inst.instanceId))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            {isOpen &&
              manifest &&
              (Custom ? (
                <div className="px-3.5 pb-3.5 pl-[41px]">
                  <Custom
                    config={inst.config}
                    onChange={(config) => update(inst.instanceId, { config })}
                    t={t}
                  />
                </div>
              ) : (
                <SchemaForm
                  fields={manifest.configSchema}
                  config={inst.config}
                  onChange={(config) => update(inst.instanceId, { config })}
                  t={t}
                />
              ))}
          </div>
        )
      })}

      <label className="relative m-3.5 flex h-10 cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-dashed border-line font-mono text-[12px] tracking-[0.5px] text-ink-faint hover:border-accent hover:text-accent">
        <Plus size={14} />
        {t('settings.transforms.add')}
        <select
          className="absolute inset-0 cursor-pointer opacity-0"
          value=""
          onChange={(e) => {
            const m = byType(e.target.value)
            if (m) onChange(addInstance(instances, m, newId))
          }}
        >
          <option value="" />
          {catalog.map((m) => (
            <option key={m.type} value={m.type} disabled={!canAdd(instances, m)}>
              {t(m.labelKey)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
