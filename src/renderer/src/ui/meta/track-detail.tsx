import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackMetadata, TrackTags, Waveform } from '../../../../shared/types'
import { watchUrl as ytWatchUrl } from '../../../../shared/youtube-url'
import { MetaField, MetaLink } from './meta-field'
import { MetaStrip } from './meta-strip'
import { MetaGrid } from './meta-grid'
import { WaveformStrip } from './waveform-strip'
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
  return source?.videoId ? ytWatchUrl(source.videoId) : undefined
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
 * Every renderable tag, in preferred display order. The panel renders these
 * dynamically, skipping any without a value — adding a tag here is all it takes
 * to surface it (analysis-derived key/BPM included). `get` overrides the default
 * `tags[key]` lookup for fields with a fallback.
 */
const DISPLAY_FIELDS: Array<{
  key: keyof TrackTags
  labelKey: string
  get?: (t: TrackTags) => string | undefined
}> = [
  { key: 'artist', labelKey: 'meta.tags.artist' },
  { key: 'title', labelKey: 'meta.tags.title' },
  { key: 'album', labelKey: 'meta.tags.album' },
  { key: 'year', labelKey: 'meta.tags.year', get: (t) => t.year ?? t.date },
  { key: 'trackNumber', labelKey: 'meta.tags.trackNumber' },
  { key: 'genre', labelKey: 'meta.tags.genre' },
  { key: 'key', labelKey: 'meta.tags.key' },
  { key: 'camelot', labelKey: 'meta.tags.camelot' },
  { key: 'bpm', labelKey: 'meta.tags.bpm' }
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
  file,
  state = 'ready',
  editing = false,
  onSave,
  onCancel,
  onOpenExternal,
  waveform,
  showWaveform = true,
  onContextMenu
}: {
  meta: TrackMetadata | null
  source?: TrackSource
  /** Absolute path to the on-disk file; shown as a tooltip on the size cell. */
  file?: string
  state?: 'loading' | 'ready' | 'unavailable'
  editing?: boolean
  onSave?: (tags: TrackTags) => void
  onCancel?: () => void
  onOpenExternal?: (url: string) => void
  /** Precomputed peaks; when present (and not editing) the strip is shown. */
  waveform?: Waveform
  /** When false, the waveform strip is suppressed even if peaks are supplied
   *  (e.g. the editor, which shows the waveform in its player instead). */
  showWaveform?: boolean
  /** Row context-menu handler, forwarded onto the waveform. */
  onContextMenu?: (e: React.MouseEvent) => void
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
    { label: t('meta.audio.size'), value: formatBytes(a.sizeBytes), tooltip: file || undefined }
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

  // Render the present tags dynamically, in the preferred order above.
  const tagFields = DISPLAY_FIELDS.map((f) => ({
    label: t(f.labelKey as never),
    value: (f.get ? f.get(tags) : tags[f.key]) ?? ''
  })).filter((f) => f.value)

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

      {showWaveform && waveform && (
        <WaveformStrip
          peaks={waveform.peaks}
          durationSec={waveform.durationSec}
          onContextMenu={onContextMenu}
        />
      )}
    </div>
  )
}
