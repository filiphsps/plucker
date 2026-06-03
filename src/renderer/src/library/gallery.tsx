import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Library as LibraryIcon } from 'lucide-react'
import type { CollectionView } from '../../../shared/library'
import { CollectionTile } from './collection-tile'
import { filterAndSort, type GallerySort } from './gallery-sort'

const SORTS: GallerySort[] = ['recent', 'az', 'kind']

export function Gallery({
  collections,
  onOpenCollection,
  onExportCollection,
  onDeleteCollection
}: {
  collections: CollectionView[]
  onOpenCollection: (id: string) => void
  onExportCollection: (id: string) => void
  onDeleteCollection: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<GallerySort>('recent')
  const shown = useMemo(() => filterAndSort(collections, query, sort), [collections, query, sort])
  const trackTotal = collections.reduce((n, c) => n + c.tracks.length, 0)

  if (collections.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <LibraryIcon size={34} className="text-ink-faint" />
        <div className="text-[15px] font-medium text-ink">{t('library.empty')}</div>
        <div className="text-[12.5px] text-ink-dim">{t('library.emptyHint')}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[46px] flex-none items-center gap-3 border-b border-line2 px-[18px]">
        <label className="flex w-[240px] items-center gap-1.5 rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-ink-faint">
          <Search size={12} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('library.search')}
            className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint"
          />
        </label>
        <span className="flex-1" />
        <span className="font-mono text-[10px] uppercase tracking-[1px] text-ink-faint tnum">
          {t('library.count', { collections: collections.length, tracks: trackTotal })}
        </span>
        <div className="flex rounded-md border border-line bg-panel2 p-0.5">
          {SORTS.map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={
                'rounded-[5px] px-2.5 py-1 text-[11px] ' +
                (sort === s ? 'bg-raise text-ink' : 'text-ink-dim hover:text-ink')
              }
            >
              {t(`library.sort.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-[18px]">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-[15px]">
          {shown.map((c) => (
            <CollectionTile
              key={c.id}
              collection={c}
              onOpen={onOpenCollection}
              onExport={onExportCollection}
              onDelete={onDeleteCollection}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
