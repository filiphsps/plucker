import React from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, Trash2 } from 'lucide-react'
import type { CollectionView } from '../../../shared/library'
import { CollectionCover } from './collection-cover'
import { CollectionWaveform } from './collection-waveform'
import { useTrackBlob } from './use-track-blob'
import { useHoverPreview } from './use-hover-preview'
import { showContextMenu } from '../ui/context-menu'
import { collectionMenuItems } from './collection-menu'

/** Preview snippet window (seconds) for a gallery tile's hover-to-play. */
const TILE_PREVIEW_RANGE: [number, number] = [6, 22]

/** One cinematic gallery tile: cover/mosaic, hover waveform, scrim caption, hover actions. */
export function CollectionTile({
  collection,
  onOpen,
  onBeginRename,
  onExport,
  onDelete,
  onRedownload
}: {
  collection: CollectionView
  onOpen: (id: string) => void
  onBeginRename: (id: string) => void
  onExport: (id: string) => void
  onDelete: (id: string) => void
  onRedownload: (url: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  // The collection's signature waveform/audio = its first track's current version.
  const first = collection.tracks[0]?.id ?? null
  const { hash, loadWaveform } = useTrackBlob(first)
  const { hovered: hover, setHovered, posRef } = useHoverPreview(hash, TILE_PREVIEW_RANGE)

  const stop = (e: React.MouseEvent): void => e.stopPropagation()

  return (
    <button
      type="button"
      onClick={() => onOpen(collection.id)}
      onContextMenu={(e) => {
        e.preventDefault()
        void showContextMenu(
          collectionMenuItems({
            t,
            sourceUrl: collection.sourceUrl,
            onOpen: () => onOpen(collection.id),
            onBeginRename: () => onBeginRename(collection.id),
            onRedownload: () => collection.sourceUrl && onRedownload(collection.sourceUrl),
            onExportAll: () => onExport(collection.id),
            onDelete: () => onDelete(collection.id)
          })
        )
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative aspect-square overflow-hidden rounded-[10px] border border-line bg-black text-left transition-transform duration-150 hover:-translate-y-[3px] hover:border-[#33373f]"
    >
      <div
        className={
          'absolute inset-0 z-[1] transition-opacity duration-500 ' +
          (hover ? 'opacity-[0.07]' : 'opacity-100')
        }
      >
        <CollectionCover kind={collection.kind} tracks={collection.tracks} />
      </div>

      <CollectionWaveform active={hover} loadWaveform={loadWaveform} posRef={posRef} />

      {/* scrim + caption */}
      <div className="pointer-events-none absolute inset-0 z-[4] bg-gradient-to-t from-black/85 via-transparent to-transparent" />
      <div className="absolute inset-x-3 bottom-2.5 z-[5]">
        <div className="truncate text-[14px] font-semibold text-white">{collection.title}</div>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[1.1px] text-white/60">
          {t(`library.kind.${collection.kind}`)}
          {collection.kind !== 'single' && ` · ${collection.tracks.length}`}
        </div>
      </div>

      {/* hover actions */}
      <div
        className={
          'absolute right-2 top-2 z-[5] flex gap-1.5 transition-opacity ' +
          (hover ? 'opacity-100' : 'opacity-0')
        }
      >
        <span
          role="button"
          aria-label={t('library.exportAll')}
          onClick={(e) => {
            stop(e)
            onExport(collection.id)
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white backdrop-blur"
        >
          <Upload size={13} />
        </span>
        <span
          role="button"
          aria-label={t('common.delete')}
          onClick={(e) => {
            stop(e)
            onDelete(collection.id)
          }}
          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/60 text-white backdrop-blur"
        >
          <Trash2 size={13} />
        </span>
      </div>
    </button>
  )
}
