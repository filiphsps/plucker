import { useTranslation } from 'react-i18next'
import type { Version, Branch } from '../../../shared/library'

function label(v: Version): string {
  if (v.label) return v.label
  if (v.parentId === null) return 'Original'
  return v.recipe.steps.map((s) => s.type).join(' + ') || 'Edit'
}

export function VersionGraph({
  versions,
  branches,
  currentVersionId,
  onSelect
}: {
  versions: Version[]
  branches: Branch[]
  currentVersionId: string
  onSelect: (versionId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const tipFor = new Map(branches.map((b) => [b.tipVersionId, b.name]))
  return (
    <ol className="version-graph">
      {versions.map((v) => (
        <li key={v.id} className={`version-node${v.id === currentVersionId ? ' is-current' : ''}`}>
          <button onClick={() => onSelect(v.id)}>{label(v)}</button>
          {tipFor.has(v.id) && <span className="branch-tag">{tipFor.get(v.id)}</span>}
          {!v.materialized && (
            <span className="cold" title={t('library.cold')}>
              cold
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}
