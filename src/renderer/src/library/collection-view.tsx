import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import type { CollectionView as CV } from '../../../shared/library'
import { CollectionCover } from './collection-cover'
import { LibraryTrackRow } from './library-track-row'
import { Button } from '../ui/button'
import { InlineEdit } from '../ui/form/inline-edit'
import { COLLECTION_TITLE_FIELD } from '../../../shared/library'

/** The cinematic collection page: blurred-cover hero + sharp art + meta + a dense track list. */
export function CollectionView({
  collection,
  onBack,
  onOpenTrack,
  onExportTrack,
  onDeleteTrack,
  onExportAll,
  onDelete,
  onRename,
  autoBeginRename = false,
  onAutoRenameConsumed,
  onRedownloadTrack
}: {
  collection: CV
  onBack: () => void
  onOpenTrack: (trackId: string) => void
  onExportTrack: (trackId: string) => void
  onDeleteTrack: (trackId: string) => void
  onExportAll: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  autoBeginRename?: boolean
  onAutoRenameConsumed?: () => void
  onRedownloadTrack: (url: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const host = collection.sourceUrl?.replace(/^https?:\/\//, '').split('/')[0]
  const added = new Date(collection.createdAt).toLocaleDateString()

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* HERO */}
      <div className="relative flex-none overflow-hidden border-b border-line">
        {/* blurred backdrop reuses the same artwork */}
        <div className="absolute -inset-10 scale-110 blur-[34px] brightness-[.55] saturate-[1.2]">
          <CollectionCover kind={collection.kind} tracks={collection.tracks} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-surface/95 to-surface/55" />
        <button
          onClick={onBack}
          className="absolute left-[18px] top-3 z-10 flex items-center gap-1 font-mono text-[10px] text-ink-dim hover:text-ink"
        >
          <ChevronLeft size={13} />
          {t('library.backToLibrary')}
        </button>
        <div className="relative z-[2] flex items-end gap-5 p-[18px] pt-9">
          <div className="h-[118px] w-[118px] flex-none overflow-hidden rounded-[10px] border border-white/10 shadow-[0_14px_30px_rgba(0,0,0,.55)]">
            <CollectionCover kind={collection.kind} tracks={collection.tracks} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="font-mono text-[9px] uppercase tracking-[1.5px] text-white/60">
              {t(`library.kind.${collection.kind}`)}
            </div>
            <InlineEdit
              value={collection.title}
              spec={COLLECTION_TITLE_FIELD}
              onSave={(title) => onRename(collection.id, title)}
              autoEdit={autoBeginRename}
              onAutoEditDone={onAutoRenameConsumed}
              ariaLabel={t('library.rename')}
              displayClassName="my-1.5 text-[30px] font-bold leading-none tracking-[-.5px] text-white"
              inputClassName="my-1.5 w-full rounded-md border border-white/20 bg-black/40 px-2 py-0.5 text-[30px] font-bold leading-none tracking-[-.5px] text-white outline-none"
            />
            <div className="flex flex-wrap gap-2 font-mono text-[11px] text-white/65">
              <span>{t('library.tracksN', { count: collection.tracks.length })}</span>
              {host && (
                <>
                  <span className="text-white/30">·</span>
                  <span>{host}</span>
                </>
              )}
              <span className="text-white/30">·</span>
              <span>{t('library.added', { date: added })}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" onClick={() => onExportAll(collection.id)}>
                {t('library.exportAll')}
              </Button>
              <Button onClick={() => onDelete(collection.id)}>{t('common.delete')}</Button>
            </div>
          </div>
        </div>
      </div>

      {/* TRACK LIST */}
      <div className="min-h-0 flex-1 overflow-auto">
        {collection.tracks.map((tr, i) => (
          <LibraryTrackRow
            key={tr.id}
            index={i}
            track={tr}
            onOpen={onOpenTrack}
            onExport={onExportTrack}
            onDelete={onDeleteTrack}
            onRedownload={onRedownloadTrack}
          />
        ))}
      </div>
    </div>
  )
}
