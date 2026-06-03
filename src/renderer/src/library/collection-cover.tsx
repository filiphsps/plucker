import React from 'react'
import { Music } from 'lucide-react'
import type { CollectionKind, TrackSummary } from '../../../shared/library'
import { useTrackBlob } from './use-track-blob'

/** One track's cover image (or a gradient fallback) for the mosaic/single frame. */
function Cell({ trackId }: { trackId: string }): React.JSX.Element {
  const { cover } = useTrackBlob(trackId)
  return cover ? (
    <img src={cover} alt="" className="h-full w-full object-cover" />
  ) : (
    <div className="h-full w-full bg-gradient-to-br from-[#1c1f24] to-[#101216]" />
  )
}

/**
 * A collection's artwork: a 2×2 mosaic of the first four tracks for playlists with
 * enough tracks, otherwise the first track's single cover. Empty → a Music glyph.
 */
export function CollectionCover({
  kind,
  tracks
}: {
  kind: CollectionKind
  tracks: TrackSummary[]
}): React.JSX.Element {
  if (tracks.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c1f24] to-[#101216]">
        <Music size={28} className="text-ink-faint" />
      </div>
    )
  }
  if (kind === 'playlist' && tracks.length >= 4) {
    return (
      <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px">
        {tracks.slice(0, 4).map((t) => (
          <Cell key={t.id} trackId={t.id} />
        ))}
      </div>
    )
  }
  return <Cell trackId={tracks[0].id} />
}
