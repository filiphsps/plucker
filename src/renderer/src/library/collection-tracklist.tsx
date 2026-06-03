import React from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import type { CollectionView } from '../../../shared/library'
import { Button } from '../ui/button'

/**
 * Interim collection view: a back bar + Export all/Delete + a dense list of tracks.
 * Plan 3 replaces this with the cinematic hero page; the contract (props) stays.
 */
export function CollectionTracklist({
  collection,
  onBack,
  onOpenTrack,
  onExportAll,
  onDelete
}: {
  collection: CollectionView
  onBack: () => void
  onOpenTrack: (trackId: string) => void
  onExportAll: (id: string) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none items-center gap-3 border-b border-line2 px-[18px] py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 font-mono text-[10px] text-ink-faint hover:text-ink"
        >
          <ChevronLeft size={13} />
          {t('library.backToLibrary')}
        </button>
        <h2 className="text-[15px] font-semibold text-ink">{collection.title}</h2>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => onExportAll(collection.id)}>
          {t('library.exportAll')}
        </Button>
        <Button onClick={() => onDelete(collection.id)}>{t('common.delete')}</Button>
      </header>
      <ul className="min-h-0 flex-1 overflow-auto">
        {collection.tracks.map((tr, i) => (
          <li key={tr.id}>
            <button
              onClick={() => onOpenTrack(tr.id)}
              className="flex h-12 w-full items-center gap-3 border-b border-line2 px-[18px] text-left hover:bg-white/[0.018]"
            >
              <span className="w-[22px] text-center font-mono text-[11px] text-ink-faint">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="truncate text-[13px] font-medium text-ink">{tr.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
