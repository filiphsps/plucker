import React from 'react'
import { X } from 'lucide-react'
import type { TransformInstance, TransformManifest } from '../../../shared/transforms'
import { TransformsSection } from '../transforms-section'
import { Button } from '../ui/button'

/**
 * The version composer "signal-chain rack": a panel that rises over the version
 * graph to build a one-off ordered transform chain and create a child version off
 * the **selected** (amber-focused) parent. Reuses {@link TransformsSection} verbatim
 * for the add/reorder/configure chain so the editor and Settings stay in lockstep.
 *
 * Presentational + controlled: the parent owns `instances`; this component only
 * shapes the rack and reports intent (create / cancel / seed-from-settings).
 */
export function VersionComposer({
  parentLabel,
  parentRecipeText,
  outcomeText,
  forking,
  catalog,
  instances,
  onChange,
  onSeedFromSettings,
  onCreate,
  onCancel,
  t
}: {
  /** Display name of the selected parent version. */
  parentLabel: string
  /** The parent's recipe summary (e.g. `trim · auto-tag`, or "raw · root"). */
  parentRecipeText: string
  /** Preview of where the child lands ("on branch: main" / "new branch: edit 2"). */
  outcomeText: string
  /** The child will fork a new branch (interior parent) — emphasise the outcome. */
  forking: boolean
  catalog: TransformManifest[]
  instances: TransformInstance[]
  onChange: (next: TransformInstance[]) => void
  /** Seed the chain from the global Settings chain; omitted when there is none. */
  onSeedFromSettings?: () => void
  onCreate: () => void
  onCancel: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}): React.JSX.Element {
  const enabledCount = instances.filter((i) => i.enabled).length
  const canCreate = enabledCount > 0

  const cable = <div className="mx-auto my-1.5 h-4 w-px border-l border-dashed border-warn/50" />

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col"
      role="dialog"
      aria-label={t('library.newVersion')}
    >
      {/* scrim — click to dismiss */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/55"
      />

      {/* the rack itself, pinned to the bottom, rising over the graph */}
      <div className="composer-rise relative z-[1] mt-auto flex max-h-full min-h-0 flex-col border-t border-line bg-panel2 shadow-[0_-20px_44px_rgba(0,0,0,.55)]">
        <header className="flex flex-none items-center gap-2 border-b border-line2 px-[18px] py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-ink-faint">
            {t('library.newVersion')}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('common.cancel')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-raise hover:text-ink"
          >
            <X size={15} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-[18px] py-3">
          {/* source slab — an amber echo of the selected version card */}
          <div className="rounded-[9px] border border-warn/50 bg-panel px-3 py-2.5">
            <div className="font-mono text-[8.5px] uppercase tracking-[.6px] text-warn">
              ◆ {t('library.fromVersion')}
            </div>
            <div className="mt-0.5 truncate text-[13px] font-medium text-ink">{parentLabel}</div>
            <div className="mt-0.5 truncate font-mono text-[9px] tracking-[.4px] text-ink-faint">
              {parentRecipeText}
            </div>
          </div>

          {cable}

          {/* the signal chain (reused builder) */}
          <div className="overflow-hidden rounded-[10px] border border-line bg-panel2">
            <div className="flex items-center gap-2 border-b border-line bg-panel px-3.5 py-2 font-mono text-[10px] uppercase tracking-[1.5px] text-ink-faint">
              {t('library.signalChain')}
              {onSeedFromSettings && (
                <button
                  type="button"
                  onClick={onSeedFromSettings}
                  className="ml-auto font-mono text-[10px] normal-case tracking-normal text-accent hover:underline"
                >
                  {t('library.loadSettingsChain')} ↧
                </button>
              )}
            </div>
            {instances.length === 0 && (
              <div className="px-3.5 pt-5 text-center font-mono text-[11px] text-ink-faint">
                {t('library.composerEmpty')}
              </div>
            )}
            <TransformsSection instances={instances} catalog={catalog} onChange={onChange} t={t} />
          </div>

          {cable}

          {/* output ghost — what will drop into the graph */}
          <div
            className={
              'rounded-[9px] border border-dashed px-3 py-2.5 ' +
              (forking ? 'border-warn/60' : 'border-line')
            }
          >
            <div className="font-mono text-[8.5px] uppercase tracking-[.6px] text-ink-faint">
              ◇ {t('library.output')}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-dim">
              {t('library.newChildOf', { version: parentLabel })}
            </div>
            <div
              className={
                'mt-0.5 font-mono text-[9px] tracking-[.4px] ' +
                (forking ? 'text-warn' : 'text-ink-faint')
              }
            >
              {outcomeText}
            </div>
          </div>
        </div>

        <footer className="flex flex-none items-center gap-2 border-t border-line2 px-[18px] py-2.5">
          <span
            className={
              'font-mono text-[10px] tracking-[.4px] ' +
              (canCreate ? 'text-warn' : 'text-ink-faint')
            }
          >
            {t('library.stepsN', { count: enabledCount })}
          </span>
          <span className="flex-1" />
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={onCreate} disabled={!canCreate}>
            ◇ {t('library.create')}
          </Button>
        </footer>
      </div>
    </div>
  )
}
