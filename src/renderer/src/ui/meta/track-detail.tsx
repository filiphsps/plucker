import React from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackMetadata } from '../../../../shared/types'
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

/**
 * The full expanded-row metadata panel: a segmented audio spec strip, a dynamic
 * grid of present ID3 tags, and the source column. Built from the reusable
 * MetaField / MetaLink / MetaStrip / MetaGrid primitives.
 */
export function TrackDetail({
  meta,
  source,
  state = 'ready',
  onOpenExternal
}: {
  meta: TrackMetadata | null
  source?: TrackSource
  state?: 'loading' | 'ready' | 'unavailable'
  onOpenExternal?: (url: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const open = onOpenExternal ?? ((url: string) => window.plucker.openExternal(url))

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
