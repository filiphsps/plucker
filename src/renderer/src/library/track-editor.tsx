import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackDetail } from '../../../shared/library'
import type { TransformInstance, TransformManifest } from '../../../shared/transforms'
import { resolveVersionBranchTarget } from '../../../shared/version-branch-target'
import { EditorPlayer } from './editor-player'
import { VersionGraph } from './version-graph'
import { VersionComposer } from './version-composer'
import { MetadataDrawer } from './metadata-drawer'
import { Button } from '../ui/button'

export function TrackEditor({
  detail,
  collectionTitle,
  onClose,
  onCreateVersion,
  onExport,
  onSwitchBranch,
  onCreateBranch,
  onDeleteVersion,
  onRenameVersion
}: {
  detail: TrackDetail
  collectionTitle: string
  onClose: () => void
  onCreateVersion: (parentVersionId: string, chain: TransformInstance[]) => void
  onExport: (trackId: string) => void
  onSwitchBranch: (branchId: string) => void
  onCreateBranch: (fromVersionId: string, name: string) => void
  onDeleteVersion: (versionId: string) => void
  onRenameVersion: (versionId: string, label: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const activeBranch = detail.branches.find((b) => b.id === detail.instance.activeBranchId)!
  const currentVersionId = activeBranch.tipVersionId
  const [selectedId, setSelectedId] = useState<string>(currentVersionId)
  const [branching, setBranching] = useState(false)
  const [branchName, setBranchName] = useState('')

  // Composer state: the one-off chain + the transform catalog and Settings chain it
  // can seed from. Catalog/settings are fetched once while the editor is open.
  const [composing, setComposing] = useState(false)
  const [chain, setChain] = useState<TransformInstance[]>([])
  const [catalog, setCatalog] = useState<TransformManifest[] | null>(null)
  const [settingsChain, setSettingsChain] = useState<TransformInstance[]>([])

  useEffect(() => {
    void window.plucker.getTransformCatalog().then(setCatalog)
    void window.plucker.getSettings().then((s) => setSettingsChain(s.transforms))
  }, [])

  const selected =
    detail.versions.find((v) => v.id === selectedId) ??
    detail.versions.find((v) => v.id === currentVersionId)!
  const isTip = detail.branches.some((b) => b.tipVersionId === selected.id)
  const recipeText = selected.recipe.steps.map((s) => s.type).join(' · ') || t('library.rawRoot')
  const versionLabel = selected.label ?? (selected.parentId === null ? 'Original' : recipeText)

  // Preview where a child of the selected version will land — the exact decision the
  // main-process fold makes, so the composer's "output" line never lies.
  const target = resolveVersionBranchTarget(
    detail.branches,
    detail.instance.activeBranchId,
    selected.id
  )
  const forking = target.kind === 'fork'
  const outcomeText = forking
    ? t('library.newBranch', { name: target.branchName })
    : t('library.onBranch', {
        name: detail.branches.find((b) => b.id === target.branchId)?.name ?? ''
      })

  const openComposer = (): void => {
    setChain([])
    setComposing(true)
  }
  const createVersion = (): void => {
    onCreateVersion(selected.id, chain)
    setComposing(false)
  }
  const seedFromSettings = (): void =>
    setChain(settingsChain.map((i) => ({ ...i, instanceId: crypto.randomUUID() })))

  const confirmBranch = (): void => {
    if (branchName.trim()) {
      onCreateBranch(selected.id, branchName.trim())
      setBranching(false)
      setBranchName('')
    }
  }

  const branchSwitcher = (
    <select
      value={detail.instance.activeBranchId}
      onChange={(e) => onSwitchBranch(e.target.value)}
      className="pl-select rounded-md border border-line bg-accent-dim px-2.5 py-1 font-mono text-[11px] text-accent"
    >
      {detail.branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorPlayer
        trackId={detail.instance.id}
        title={detail.instance.title}
        collectionTitle={collectionTitle}
        versionLabel={versionLabel}
        isCurrent={selected.id === currentVersionId}
        onBack={onClose}
        branchSwitcher={branchSwitcher}
      />

      {/* graph + recipe + action bar share a relative box so the composer can rise over them */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* version graph with the folding metadata drawer over it */}
        <MetadataDrawer trackId={detail.instance.id}>
          <VersionGraph
            versions={detail.versions}
            branches={detail.branches}
            currentVersionId={currentVersionId}
            selectedVersionId={selected.id}
            composing={composing}
            onSelect={setSelectedId}
          />
        </MetadataDrawer>

        {/* recipe of the selected version */}
        <div className="flex flex-none items-center gap-2 border-t border-line2 px-[18px] py-2.5 font-mono text-[9.5px] uppercase tracking-[.5px] text-ink-faint">
          <span>
            {t('library.recipeFor', { version: versionLabel })} —{' '}
            <span className="text-[#4aa3ff]">{recipeText}</span>
          </span>
        </div>

        {/* action bar */}
        <div className="flex flex-none items-center gap-2 border-t border-line2 px-[18px] py-2.5">
          <Button variant="primary" onClick={openComposer}>
            + {t('library.newVersion')}
          </Button>
          {branching ? (
            <span className="flex items-center gap-2">
              <input
                autoFocus
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder={t('library.branchNamePrompt')}
                className="h-[30px] rounded-md border border-line bg-[#0a0b0e] px-2 font-mono text-[12px] text-ink outline-none focus:border-accent"
              />
              <Button variant="primary" onClick={confirmBranch}>
                {t('library.branchFrom')}
              </Button>
            </span>
          ) : (
            <Button onClick={() => setBranching(true)}>⑂ {t('library.branchFrom')}</Button>
          )}
          <Button onClick={() => onRenameVersion(selected.id, selected.label ?? '')}>
            {t('library.rename')}
          </Button>
          <span className="flex-1" />
          <Button
            onClick={() => onDeleteVersion(selected.id)}
            disabled={isTip}
            className="text-bad disabled:opacity-40"
          >
            {t('library.deleteVersion')}
          </Button>
          <Button onClick={() => onExport(detail.instance.id)}>{t('library.export')}</Button>
        </div>

        {composing && catalog && (
          <VersionComposer
            parentLabel={versionLabel}
            parentRecipeText={recipeText}
            outcomeText={outcomeText}
            forking={forking}
            catalog={catalog}
            instances={chain}
            onChange={setChain}
            onSeedFromSettings={settingsChain.length ? seedFromSettings : undefined}
            onCreate={createVersion}
            onCancel={() => setComposing(false)}
            t={(k, o) => t(k as never, o as never) as unknown as string}
          />
        )}
      </div>
    </div>
  )
}
