import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackDetail } from '../../../shared/library'
import { VersionGraph } from './version-graph'

export function TrackEditor({
  detail,
  onEdit,
  onExport,
  onClose,
  onSwitchBranch,
  onCreateBranch
}: {
  detail: TrackDetail
  onEdit: (trackId: string) => void
  onExport: (trackId: string) => void
  onClose: () => void
  onSwitchBranch?: (branchId: string) => void
  onCreateBranch?: (fromVersionId: string, name: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(null)
  const current = detail.branches.find((b) => b.id === detail.instance.activeBranchId)!
  const isTip = detail.branches.some((b) => b.tipVersionId === selected)
  return (
    <div className="track-editor">
      <header>
        <button onClick={onClose}>{t('common.back')}</button>
        <h2>{detail.instance.title}</h2>
        {detail.branches.length > 0 && (
          <select
            className="branch-select"
            value={detail.instance.activeBranchId}
            onChange={(e) => onSwitchBranch?.(e.target.value)}
          >
            {detail.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </header>
      <VersionGraph
        versions={detail.versions}
        branches={detail.branches}
        currentVersionId={current.tipVersionId}
        onSelect={(id) => setSelected(id)}
      />
      {selected && !isTip && onCreateBranch && (
        <div className="branch-from">
          <button
            onClick={() => {
              const name = window.prompt(t('library.branchNamePrompt'))
              if (name) onCreateBranch(selected, name)
            }}
          >
            {t('library.branchFrom')}
          </button>
        </div>
      )}
      <footer>
        <button onClick={() => onEdit(detail.instance.id)}>{t('library.applyTransforms')}</button>
        <button onClick={() => onExport(detail.instance.id)}>{t('library.export')}</button>
      </footer>
    </div>
  )
}
