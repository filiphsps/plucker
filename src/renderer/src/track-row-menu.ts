// Builds the context-menu items for a TrackRow. Pure function (no rendering) so the
// item set / enabled states are unit-testable. Action closures (reveal, delete,
// re-download, edit tags) are supplied by the parent view that owns that logic.
import type { TFunction } from 'i18next'
import { watchUrl } from '../../shared/youtube-url'
import type { MenuItem } from './ui/context-menu'

export interface TrackMenuTrack {
  title: string
  file?: string
  videoId?: string
  errorCode?: string
  reason?: string
}

export function trackRowMenuItems(opts: {
  t: TFunction
  variant: 'download' | 'history' | 'cache'
  track: TrackMenuTrack
  missing: boolean
  failed: boolean
  onReveal: () => void
  onRedownload?: () => void
  onEditTags?: () => void
  onDelete?: () => void
}): MenuItem[] {
  const { t, variant, track, missing, failed } = opts
  const hasFile = !!track.file && !missing
  const items: MenuItem[] = [
    { label: t('context.reveal'), enabled: hasFile, onClick: opts.onReveal },
    { label: t('context.copyTitle'), onClick: () => void window.plucker.copyText(track.title) }
  ]

  if (track.videoId) {
    const url = watchUrl(track.videoId)
    items.push(
      { label: t('context.copyUrl'), onClick: () => void window.plucker.copyText(url) },
      { label: t('context.openYouTube'), onClick: () => void window.plucker.openExternal(url) }
    )
  }

  if (variant === 'history' && opts.onRedownload) {
    items.push(
      { type: 'separator' },
      { label: t('context.redownload'), onClick: opts.onRedownload }
    )
  }
  if (variant === 'cache' && opts.onEditTags) {
    items.push({ type: 'separator' }, { label: t('context.editTags'), onClick: opts.onEditTags })
  }

  if (failed && (track.errorCode || track.reason)) {
    items.push(
      { type: 'separator' },
      {
        label: t('context.copyError'),
        onClick: () => void window.plucker.copyText(track.errorCode ?? track.reason ?? '')
      }
    )
  }

  if (opts.onDelete) {
    items.push(
      { type: 'separator' },
      { label: t('context.deleteFile'), enabled: hasFile, onClick: opts.onDelete }
    )
  }

  return items
}
