import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackMetadata, TrackTags } from '../../../../shared/types'
import { MetaField, MetaLink } from './meta-field'
import { MetaStrip } from './meta-strip'
import { MetaGrid } from './meta-grid'
import {
  formatBitrate,
  formatDuration,
  formatSampleRate,
  formatChannels,
  formatCodec,
  formatBytes
} from './format'

export interface TrackSource {
  videoId?: string
  url?: string
  /** ISO timestamp the track was downloaded/completed. */
  downloadedAt?: string
}

function watchUrl(source?: TrackSource): string | undefined {
  if (source?.url) return source.url
  return source?.videoId ? `https://www.youtube.com/watch?v=${source.videoId}` : undefined
}

const LABEL =
  'mb-1 h-3 truncate font-mono text-[9px] uppercase leading-3 tracking-[1px] text-ink-faint select-none'

/** The editable tag fields, in display order. */
const EDIT_FIELDS: Array<{ key: keyof TrackTags; labelKey: string }> = [
  { key: 'artist', labelKey: 'meta.tags.artist' },
  { key: 'title', labelKey: 'meta.tags.title' },
  { key: 'album', labelKey: 'meta.tags.album' },
  { key: 'year', labelKey: 'meta.tags.year' },
  { key: 'trackNumber', labelKey: 'meta.tags.trackNumber' },
  { key: 'genre', labelKey: 'meta.tags.genre' }
]

/**
 * The full expanded-row metadata panel: a segmented audio spec strip, a dynamic
 * grid of present ID3 tags (or editable inputs in edit mode), and the source
 * column. Built from the reusable MetaField / MetaLink / MetaStrip / MetaGrid
 * primitives.
 */
export function TrackDetail({
  meta,
  source,
  state = 'ready',
  editing = false,
  onSave,
  onCancel,
  onOpenExternal
}: {
  meta: TrackMetadata | null
  source?: TrackSource
  state?: 'loading' | 'ready' | 'unavailable'
  editing?: boolean
  onSave?: (tags: TrackTags) => void
  onCancel?: () => void
  onOpenExternal?: (url: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const open = onOpenExternal ?? ((url: string) => window.plucker.openExternal(url))
  const [draft, setDraft] = useState<TrackTags>(() => ({ ...(meta?.tags ?? {}) }))

  const wrapper =
    'flex flex-col gap-3.5 bg-gradient-to-b from-accent-dim to-transparent px-4 pb-4 pt-3.5'

  if (state !== 'ready') {
    return (
      <div className={wrapper}>
        <div className="font-mono text-[11px] text-ink-faint select-none">
          {t(state === 'loading' ? 'meta.loading' : 'meta.unavailable')}
        </div>
      </div>
    )
  }

  const a = meta?.audio ?? {}
  const tags = meta?.tags ?? {}
  const url = watchUrl(source)

  const audioCells = [
    { label: t('meta.audio.bitrate'), value: formatBitrate(a.bitrateKbps) },
    { label: t('meta.audio.duration'), value: formatDuration(a.durationSec) },
    { label: t('meta.audio.sampleRate'), value: formatSampleRate(a.sampleRateHz) },
    { label: t('meta.audio.channels'), value: formatChannels(a.channels) },
    { label: t('meta.audio.codec'), value: formatCodec(a.codec) },
    { label: t('meta.audio.size'), value: formatBytes(a.sizeBytes) }
  ]

  if (editing) {
    return (
      <div className={wrapper}>
        <MetaStrip cells={audioCells} />

        <div className="flex items-center gap-2">
          <span className="rounded-[4px] border border-accent/80 px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[1.4px] text-accent">
            {t('cache.editingTags')}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[9px] uppercase tracking-[1px] text-ink-faint select-none">
            {t('cache.audioReadonly')}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-x-[18px] gap-y-3">
          {EDIT_FIELDS.map((f) => (
            <div key={f.key}>
              <div className={LABEL}>{t(f.labelKey as never)}</div>
              <input
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className="h-[26px] w-full rounded-[5px] border border-line bg-[#0a0b0e] px-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-line2 pt-3">
          <button
            onClick={() => onCancel?.()}
            className="h-[30px] rounded-md border border-line bg-raise px-4 text-[12.5px] font-medium text-ink-dim hover:text-ink"
          >
            {t('settings.cancel')}
          </button>
          <button
            onClick={() => onSave?.(draft)}
            className="h-[30px] rounded-md bg-accent px-4 text-[12.5px] font-semibold text-white"
          >
            {t('cache.save')}
          </button>
        </div>
      </div>
    )
  }

  // Only render tag fields that actually have a value (dynamic count).
  const tagFields: Array<{ label: string; value: string }> = [
    { label: t('meta.tags.artist'), value: tags.artist ?? '' },
    { label: t('meta.tags.title'), value: tags.title ?? '' },
    { label: t('meta.tags.album'), value: tags.album ?? '' },
    { label: t('meta.tags.year'), value: tags.year ?? tags.date ?? '' },
    { label: t('meta.tags.trackNumber'), value: tags.trackNumber ?? '' },
    { label: t('meta.tags.genre'), value: tags.genre ?? '' }
  ].filter((f) => f.value)

  return (
    <div className={wrapper}>
      <MetaStrip cells={audioCells} />

      <div className="grid grid-cols-2 items-start gap-[22px]">
        {tagFields.length > 0 && (
          <MetaGrid columns={3}>
            {tagFields.map((f) => (
              <MetaField key={f.label} label={f.label} value={f.value} />
            ))}
          </MetaGrid>
        )}

        <MetaGrid columns={2}>
          {url && (
            <MetaLink
              className="col-span-2"
              label={t('meta.source.url')}
              href={url}
              display={url.replace(/^https?:\/\//, '')}
              onOpen={open}
            />
          )}
          {source?.videoId && <MetaField label={t('meta.source.videoId')} value={source.videoId} />}
          {source?.downloadedAt && (
            <MetaField
              label={t('meta.source.downloaded')}
              value={new Date(source.downloadedAt).toLocaleDateString()}
            />
          )}
        </MetaGrid>
      </div>
    </div>
  )
}
