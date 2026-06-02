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
    { label: t('context.reveal'), enabled: hasFile, onClick: opts.onReveal },
    { label: t('context.copyTitle'), onClick: () => void window.plucker.copyText(track.title) }
  ]

  // Live-job controls (download view): pause/resume an in-flight track and skip
  // any track that hasn't finished yet.
  const active = track.status === 'downloading' || track.status === 'transforming'
  const skippable = active || track.status === 'queued'
  if (variant === 'download' && skippable && opts.onSkip) {
    if (active && opts.onPause && opts.onResume) {
      items.push(
        track.paused
          ? { label: t('context.resumeTrack'), onClick: opts.onResume }
          : { label: t('context.pauseTrack'), onClick: opts.onPause }
      )
    }
    items.push({ label: t('context.skip'), onClick: opts.onSkip }, { type: 'separator' })
  }

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
  if (variant === 'history' && opts.onRetransform) {
    items.push({ label: t('context.retransform'), enabled: hasFile, onClick: opts.onRetransform })
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
