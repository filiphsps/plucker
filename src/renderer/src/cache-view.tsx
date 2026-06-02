import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Trash2, Pencil, ChevronLeft } from 'lucide-react'
import type { CachedTrack, TrackTags } from '../../shared/types'
import { TrackRow } from './track-row'
import { VirtualList } from './ui/virtual-list'
import { showContextMenu } from './ui/context-menu'
import { trackRowMenuItems } from './track-row-menu'
import { formatBytes } from './ui/meta/format'

export function CacheView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<CachedTrack[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    window.plucker.getCache().then(setItems)
  }, [])

  const totalSize = useMemo(
    () => items.reduce((sum, it) => sum + (it.audio?.sizeBytes ?? 0), 0),
    [items]
  )

  // Pre-build each row's data props once per `items` change, keyed by hash, so
  // typing in the search box (which only narrows `filtered`) doesn't hand every
  // memoized TrackRow freshly-allocated track/meta/source objects.
  const rowData = useMemo(
    () =>
      new Map(
        items.map((it) => {
          const title = it.mb?.title || it.track?.title || `${it.hash.slice(0, 8)}…`
          return [
            it.hash,
            {
              title,
              track: {
                title,
                artist: it.mb?.artist,
                album: it.mb?.album,
                year: it.mb?.year,
                file: it.track?.file,
                hash: it.hash
              },
              meta: { tags: it.mb ?? {}, audio: it.audio ?? {} },
              source: { videoId: it.track?.videoId, downloadedAt: it.updatedAt },
              missing: !!it.track?.file && !it.fileExists
            }
          ]
        })
      ),
    [items]
  )

  const filtered = items.filter((it) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [it.mb?.title, it.mb?.artist, it.mb?.album, it.track?.title, it.hash]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(q))
  })

  async function save(hash: string, tags: TrackTags): Promise<void> {
    setItems(await window.plucker.updateCacheTrack(hash, tags))
    setEditing(null)
  }
  async function remove(hash: string): Promise<void> {
    if (!window.confirm(t('cache.deleteConfirm'))) return
    setItems(await window.plucker.deleteCacheTrack(hash))
    if (editing === hash) setEditing(null)
  }
  async function clearAll(): Promise<void> {
    if (!window.confirm(t('cache.clearConfirm'))) return
    setItems(await window.plucker.clearCache())
    setEditing(null)
  }

  const ra =
    'flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-raise hover:text-ink'

  return (
    <div className="flex h-full flex-col">
      {/* command bar */}
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <button
          onClick={onBack}
          className="flex h-9 items-center gap-1 rounded-[7px] border border-line bg-raise pl-2 pr-3 text-[12.5px] text-ink-dim hover:text-ink"
        >
          <ChevronLeft size={16} />
          {t('cache.back')}
        </button>
        <div className="flex flex-1 items-center gap-2.5 rounded-[7px] border border-line bg-[#0a0b0e] px-3">
          <Search size={14} className="text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('cache.search')}
            className="h-9 w-full bg-transparent font-mono text-[12px] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <span className="font-mono text-[11px] text-ink-faint">
          {t('cache.entries', { count: items.length, size: formatBytes(totalSize || undefined) })}
        </span>
        <button
          onClick={clearAll}
          disabled={items.length === 0}
          className="flex h-9 items-center gap-1.5 rounded-[7px] border border-line bg-raise px-3 text-[12px] text-ink-dim hover:border-bad/40 hover:text-bad disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-dim"
        >
          <Trash2 size={14} />
          {t('cache.clear')}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-ink-faint">
          {t('cache.empty')}
        </div>
      ) : (
        <>
          {/* column header */}
          <div className="flex items-center gap-3 border-b border-line py-[7px] pl-[42px] pr-4 font-mono text-[9.5px] uppercase tracking-[1px] text-ink-faint">
            <span className="w-[22px]">#</span>
            <span className="flex-1">{t('download.colTrack')}</span>
            <span className="w-[84px] text-right">{t('cache.colQuality')}</span>
            <span className="w-12 text-right">{t('cache.colTime')}</span>
            <span className="w-[64px]" />
          </div>

          <VirtualList
            className="min-h-0 flex-1 overflow-auto"
            items={filtered}
            getKey={(it) => it.hash}
            estimateSize={48}
            onContextMenu={(e) => {
              if (e.defaultPrevented) return
              e.preventDefault()
              void showContextMenu([
                {
                  label: t('context.clearCache'),
                  symbol: 'trash',
                  enabled: items.length > 0,
                  onClick: clearAll
                }
              ])
            }}
          >
            {(it, i) => {
              const row = rowData.get(it.hash)!
              const missing = row.missing
              return (
                <TrackRow
                  variant="cache"
                  index={i + 1}
                  track={row.track}
                  meta={row.meta}
                  source={row.source}
                  missing={missing}
                  editing={editing === it.hash}
                  onSaveTags={(tags) => save(it.hash, tags)}
                  onCancelEdit={() => setEditing(null)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    void showContextMenu(
                      trackRowMenuItems({
                        t,
                        variant: 'cache',
                        track: {
                          title: it.mb?.title || it.track?.title || `${it.hash.slice(0, 8)}…`,
                          file: it.track?.file,
                          videoId: it.track?.videoId
                        },
                        missing,
                        failed: false,
                        onReveal: () => it.track?.file && window.plucker.revealFile(it.track.file),
                        onEditTags: () => setEditing(it.hash),
                        onDelete: () => remove(it.hash)
                      })
                    )
                  }}
                  actions={
                    <>
                      <button
                        className={ra + (editing === it.hash ? ' bg-accent-dim text-accent' : '')}
                        title={t('cache.editingTags')}
                        onClick={() => setEditing(editing === it.hash ? null : it.hash)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className={ra + ' hover:text-bad'}
                        title={t('actions.delete')}
                        onClick={() => remove(it.hash)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  }
                />
              )
            }}
          </VirtualList>
        </>
      )}
    </div>
  )
}
