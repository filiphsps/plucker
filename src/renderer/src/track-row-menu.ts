// Builds the context-menu items for a TrackRow. Pure function (no rendering) so the
// item set / enabled states are unit-testable. Action closures (reveal, delete,
// re-download, edit tags) are supplied by the parent view that owns that logic.
import type { TFunction } from 'i18next'
import { watchUrl } from '../../shared/youtube-url'
import type { TrackStatus } from '../../shared/types'
import type { MenuItem } from './ui/context-menu'

export interface TrackMenuTrack {
  title: string
  file?: string
  videoId?: string
  errorCode?: string
  reason?: string
  /** Live status — drives the skip/pause/resume block on the download view. */
  status?: TrackStatus
  /** Whether this track is individually paused (download view only). */
  paused?: boolean
}

export function trackRowMenuItems(opts: {
  t: TFunction
  variant: 'download' | 'history' | 'cache'
  track: TrackMenuTrack
  missing: boolean
  failed: boolean
  onReveal: () => void
  onRedownload?: () => void
  onRetransform?: () => void
  onEditTags?: () => void
  onDelete?: () => void
  onSkip?: () => void
  onPause?: () => void
  onResume?: () => void
}): MenuItem[] {
  const { t, variant, track, missing, failed } = opts
  const hasFile = !!track.file && !missing
  const items: MenuItem[] = [
    { label: t('context.reveal'), symbol: 'folder', enabled: hasFile, onClick: opts.onReveal },
    {
      label: t('context.copyTitle'),
      symbol: 'doc.on.doc',
      onClick: () => void window.plucker.copyText(track.title)
    }
  ]

  // Live-job controls (download view): pause/resume an in-flight track and skip
  // any track that hasn't finished yet.
  const active = track.status === 'downloading' || track.status === 'transforming'
  const skippable = active || track.status === 'queued'
  if (variant === 'download' && skippable && opts.onSkip) {
    if (active && opts.onPause && opts.onResume) {
      items.push(
        track.paused
          ? { label: t('context.resumeTrack'), symbol: 'play.fill', onClick: opts.onResume }
          : { label: t('context.pauseTrack'), symbol: 'pause.fill', onClick: opts.onPause }
      )
    }
    items.push(
      { label: t('context.skip'), symbol: 'forward.fill', onClick: opts.onSkip },
      { type: 'separator' }
    )
  }

  // YouTube actions grouped into a submenu (flyout).
  if (track.videoId) {
    const url = watchUrl(track.videoId)
    items.push({
      label: t('context.youtube'),
      symbol: 'play.rectangle.fill',
      submenu: [
        {
          label: t('context.copyUrl'),
          symbol: 'link',
          onClick: () => void window.plucker.copyText(url)
        },
        {
          label: t('context.openYouTube'),
          symbol: 'arrow.up.forward.app',
          onClick: () => void window.plucker.openExternal(url)
        }
      ]
    })
  }

  if (variant === 'history' && opts.onRedownload) {
    items.push(
      { type: 'separator' },
      { label: t('context.redownload'), symbol: 'arrow.down.circle', onClick: opts.onRedownload }
    )
  }
  if (variant === 'history' && opts.onRetransform) {
    items.push({
      label: t('context.retransform'),
      symbol: 'wand.and.stars',
      enabled: hasFile,
      onClick: opts.onRetransform
    })
  }
  if (variant === 'cache' && opts.onEditTags) {
    items.push(
      { type: 'separator' },
      { label: t('context.editTags'), symbol: 'tag', onClick: opts.onEditTags }
    )
  }

  if (failed && (track.errorCode || track.reason)) {
    items.push(
      { type: 'separator' },
      {
        label: t('context.copyError'),
        symbol: 'exclamationmark.triangle',
        onClick: () => void window.plucker.copyText(track.errorCode ?? track.reason ?? '')
      }
    )
  }

  if (opts.onDelete) {
    items.push(
      { type: 'separator' },
      { label: t('context.deleteFile'), symbol: 'trash', enabled: hasFile, onClick: opts.onDelete }
    )
  }

  return items
}
