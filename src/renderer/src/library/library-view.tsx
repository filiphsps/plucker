import { useTranslation } from 'react-i18next'
import type { CollectionView } from '../../../shared/library'

export function LibraryView({
  collections,
  onOpenTrack,
  onDeleteCollection,
  onExportCollection
}: {
  collections: CollectionView[]
  onOpenTrack: (trackId: string) => void
  onDeleteCollection: (id: string) => void
  onExportCollection?: (id: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  if (collections.length === 0) {
    return <div className="library-empty">{t('library.empty')}</div>
  }
  return (
    <div className="library-view">
      {collections.map((c) => (
        <section key={c.id} className="library-collection">
          <header>
            <h2>{c.title}</h2>
            <span className="library-kind">{t(`library.kind.${c.kind}`)}</span>
            {onExportCollection && (
              <button onClick={() => onExportCollection(c.id)}>{t('library.exportAll')}</button>
            )}
            <button onClick={() => onDeleteCollection(c.id)}>{t('common.delete')}</button>
          </header>
          <ul>
            {c.tracks.map((tr) => (
              <li key={tr.id}>
                <button className="library-track" onClick={() => onOpenTrack(tr.id)}>
                  {tr.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
