import React, { useEffect, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import {
  Globe,
  Download as DownloadIcon,
  AudioLines,
  Cookie,
  Blocks,
  Gauge,
  RefreshCw,
  Database,
  Terminal,
  ChevronRight,
  Info,
  ExternalLink,
  RotateCcw
} from 'lucide-react'
import type {
  Settings,
  Bitrate,
  MinBitrate,
  SampleRate,
  CompressionLevel,
  ProcessPriority,
  CookieSource,
  Language
} from '../../shared/types'
import type { TransformManifest } from '../../shared/transforms'
import { TransformsSection } from './transforms-section'
import { Panel, PanelRow } from './ui/panel'
import { Kbd } from './ui/kbd'
import { Switch } from './ui/switch'
import { formatShortcut, currentShortcutPlatform } from './format-shortcut'
import { ACCELERATORS } from '../../shared/shortcuts'
import { Segmented } from './ui/segmented'
import { Stepper } from './ui/stepper'
import { UpdateCard } from './ui/update-card'
import { applyLanguage } from './i18n'
import { version, repository, author, contributors } from '../../../package.json'

// The console toggle shortcut, formatted for the current platform (⌘J on macOS, Ctrl+J
// elsewhere). Sourced from the shared accelerator the native menu binds, so the hint
// always matches the live keybinding.
const CONSOLE_SHORTCUT = formatShortcut(ACCELERATORS.toggleConsole, currentShortcutPlatform())

// App metadata for the About panel, normalized from package.json (fields may be a
// bare string or an object, per npm conventions).
const REPO_URL = (typeof repository === 'string' ? repository : repository.url)
  .replace(/^git\+/, '')
  .replace(/\.git$/, '')
const RELEASES_URL = `${REPO_URL}/releases/latest`
const AUTHOR_NAME = typeof author === 'string' ? author : author.name
const CONTRIBUTOR_NAMES = (contributors as Array<string | { name: string }>).map((c) =>
  typeof c === 'string' ? c : c.name
)

const BITRATES: Bitrate[] = [320, 256, 192, 128]
const MIN_BITRATES: MinBitrate[] = [64, 96, 128, 160]
const SAMPLE_RATES: SampleRate[] = [48000, 44100, 32000]
const SOURCES: CookieSource[] = ['auto', 'none', 'chrome', 'edge', 'safari', 'firefox', 'brave']
const LANGUAGES: Language[] = ['system', 'en', 'de']

export function SettingsPanel({
  onClose,
  onOpenCache
}: {
  onClose: () => void
  onOpenCache: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [s, setS] = useState<Settings | null>(null)
  // Snapshot of the last-persisted settings, used to detect unsaved edits.
  const [saved, setSaved] = useState<Settings | null>(null)
  const [catalog, setCatalog] = useState<TransformManifest[]>([])
  // Latest draft vs. persisted language, read by the unmount cleanup below so a
  // live language preview that was never saved can be rolled back.
  const langRef = useRef<{ draft: Language; saved: Language }>({ draft: 'system', saved: 'system' })
  useEffect(() => {
    langRef.current = { draft: s?.language ?? 'system', saved: saved?.language ?? 'system' }
  })
  useEffect(() => {
    window.plucker.getSettings().then((loaded) => {
      setS(loaded)
      setSaved(loaded)
    })
    window.plucker.getTransformCatalog().then(setCatalog)
  }, [])
  // On close/unmount, if the previewed language was never persisted, restore the
  // saved one so leaving Settings without saving resets the live language.
  useEffect(() => {
    return () => {
      const { draft, saved: savedLang } = langRef.current
      if (draft !== savedLang) void applyLanguage(savedLang)
    }
  }, [])
  if (!s) return <div />

  const dirty = JSON.stringify(s) !== JSON.stringify(saved)
  const set = (patch: Partial<Settings>): void => setS({ ...s, ...patch })
  async function save(): Promise<void> {
    if (!s) return
    await window.plucker.saveSettings(s)
    await applyLanguage(s.language)
    setSaved(s)
    onClose()
  }
  async function chooseFolder(): Promise<void> {
    const f = await window.plucker.chooseFolder()
    if (f) set({ downloads: { ...s!.downloads, baseFolder: f } })
  }
  async function resetSettings(): Promise<void> {
    if (!window.confirm(t('settings.reset.confirm'))) return
    // Deletes the config and relaunches the app — nothing after this runs.
    await window.plucker.resetSettings()
  }

  const cookieLabel = (src: CookieSource): string =>
    src === 'auto' ? t('settings.cookies.auto') : src === 'none' ? t('settings.cookies.none') : src
  const languageLabel = (lang: Language): string =>
    lang === 'system' ? t('settings.language.system') : lang === 'de' ? 'Deutsch' : 'English'
  const sel =
    'pl-select h-8 rounded-md border border-line bg-[#0a0b0e] pl-[11px] text-[12.5px] text-ink outline-none'

  return (
    <div className="relative h-full">
      <div className="h-full overflow-auto px-5 pb-[90px] pt-[18px]">
        <h1 className="mb-4 text-[19px] font-semibold text-[#e7ebef]">{t('settings.title')}</h1>

        <Panel icon={Globe} title={t('settings.sections.language')}>
          <PanelRow name={t('settings.language.label')} desc={t('settings.language.desc')}>
            <select
              className={sel}
              value={s.language}
              onChange={(e) => {
                const language = e.target.value as Language
                set({ language })
                // Reflect the choice in the UI immediately; the unmount cleanup
                // reverts it if the user leaves without saving.
                void applyLanguage(language)
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {languageLabel(l)}
                </option>
              ))}
            </select>
          </PanelRow>
        </Panel>

        <Panel icon={DownloadIcon} title={t('settings.sections.downloads')}>
          <PanelRow name={t('settings.downloads.folder')} desc={t('settings.downloads.folderDesc')}>
            <div className="flex max-w-[420px] flex-1 items-center gap-2">
              <div className="flex h-8 flex-1 items-center truncate rounded-md border border-line bg-[#0a0b0e] px-[11px] font-mono text-[11.5px] text-ink-dim">
                {s.downloads.baseFolder}
              </div>
              <button
                onClick={chooseFolder}
                className="h-8 rounded-md border border-line bg-raise px-[13px] text-[12px] text-ink-dim hover:text-ink"
              >
                {t('settings.downloads.choose')}
              </button>
            </div>
          </PanelRow>
          <PanelRow
            name={t('settings.downloads.perPlaylistSubfolder')}
            desc={t('settings.downloads.subfolderDesc')}
          >
            <Switch
              checked={s.downloads.perPlaylistSubfolder}
              onChange={(v) => set({ downloads: { ...s.downloads, perPlaylistSubfolder: v } })}
            />
          </PanelRow>
        </Panel>

        <Panel icon={AudioLines} title={t('settings.sections.audio')}>
          <PanelRow
            name={t('settings.audio.preferredBitrate')}
            desc={t('settings.audio.preferredDesc')}
          >
            <Segmented
              options={BITRATES.map((b) => ({ value: b, label: String(b) }))}
              value={s.audio.preferredBitrate}
              onChange={(b) => set({ audio: { ...s.audio, preferredBitrate: b } })}
            />
          </PanelRow>
          <PanelRow name={t('settings.audio.minQuality')} desc={t('settings.audio.minDesc')}>
            <select
              className={sel}
              value={s.audio.minBitrate ?? ''}
              onChange={(e) =>
                set({
                  audio: {
                    ...s.audio,
                    minBitrate: e.target.value ? (Number(e.target.value) as MinBitrate) : null
                  }
                })
              }
            >
              <option value="">{t('settings.audio.off')}</option>
              {MIN_BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b}K
                </option>
              ))}
            </select>
          </PanelRow>
          <PanelRow name={t('settings.audio.sampleRate')} desc={t('settings.audio.sampleRateDesc')}>
            <select
              className={sel}
              value={s.audio.sampleRate ?? ''}
              onChange={(e) =>
                set({
                  audio: {
                    ...s.audio,
                    sampleRate: e.target.value ? (Number(e.target.value) as SampleRate) : null
                  }
                })
              }
            >
              <option value="">{t('settings.audio.sampleRateSource')}</option>
              {SAMPLE_RATES.map((hz) => (
                <option key={hz} value={hz}>
                  {hz / 1000} kHz
                </option>
              ))}
            </select>
          </PanelRow>
          <PanelRow name={t('settings.audio.previews')} desc={t('settings.audio.previewsDesc')}>
            <Switch
              checked={s.library.audioPreviews}
              onChange={(v) => set({ library: { ...s.library, audioPreviews: v } })}
            />
          </PanelRow>
        </Panel>

        <Panel icon={Cookie} title={t('settings.sections.cookies')}>
          <PanelRow name={t('settings.cookies.label')} desc={t('settings.cookies.desc')}>
            <select
              className={sel}
              value={s.cookies.source}
              onChange={(e) => set({ cookies: { source: e.target.value as CookieSource } })}
            >
              {SOURCES.map((src) => (
                <option key={src} value={src}>
                  {cookieLabel(src)}
                </option>
              ))}
            </select>
          </PanelRow>
        </Panel>

        <Panel
          icon={Blocks}
          title={t('settings.sections.transforms')}
          aside={t('settings.transforms.runsNote')}
        >
          <TransformsSection
            instances={s.transforms}
            catalog={catalog}
            onChange={(transforms) => set({ transforms })}
            t={(key) => t(key as never)}
          />
        </Panel>

        <Panel icon={Gauge} title={t('settings.sections.performance')}>
          <PanelRow
            name={t('settings.performance.parallel')}
            desc={t('settings.performance.parallelDesc')}
          >
            <Stepper
              value={s.performance.parallel}
              min={1}
              max={16}
              onChange={(n) => set({ performance: { ...s.performance, parallel: n } })}
            />
          </PanelRow>
          <PanelRow
            name={t('settings.performance.compressionLevel')}
            desc={t('settings.performance.compressionLevelDesc')}
          >
            <Stepper
              value={s.performance.compressionLevel}
              min={0}
              max={9}
              onChange={(n) =>
                set({
                  performance: { ...s.performance, compressionLevel: n as CompressionLevel }
                })
              }
            />
          </PanelRow>
          <PanelRow
            name={t('settings.performance.concurrentFragments')}
            desc={t('settings.performance.concurrentFragmentsDesc')}
          >
            <Stepper
              value={s.performance.concurrentFragments}
              min={1}
              max={16}
              onChange={(n) => set({ performance: { ...s.performance, concurrentFragments: n } })}
            />
          </PanelRow>
          <PanelRow
            name={t('settings.performance.priority')}
            desc={t('settings.performance.priorityDesc')}
          >
            <select
              className={sel}
              value={s.performance.priority}
              onChange={(e) =>
                set({
                  performance: { ...s.performance, priority: e.target.value as ProcessPriority }
                })
              }
            >
              <option value="normal">{t('settings.performance.priorityNormal')}</option>
              <option value="low">{t('settings.performance.priorityLow')}</option>
            </select>
          </PanelRow>
        </Panel>

        <Panel icon={RefreshCw} title={t('settings.sections.updates')}>
          <PanelRow name={t('settings.updates.checkOnLaunch')} desc={t('settings.updates.desc')}>
            <Switch
              checked={s.updates.checkOnLaunch}
              onChange={(v) => set({ updates: { ...s.updates, checkOnLaunch: v } })}
            />
          </PanelRow>
        </Panel>

        <Panel icon={Database} title={t('settings.sections.cache')}>
          <PanelRow name={t('settings.cache.manage')} desc={t('settings.cache.manageDesc')}>
            <button
              onClick={onOpenCache}
              className="flex h-8 items-center gap-1 rounded-md border border-line bg-raise pl-[13px] pr-2 text-[12px] text-ink-dim hover:text-ink"
            >
              {t('settings.cache.open')}
              <ChevronRight size={15} />
            </button>
          </PanelRow>
        </Panel>

        <Panel icon={Terminal} title={t('settings.sections.developer')}>
          <PanelRow
            name={t('settings.developer.console')}
            desc={
              <Trans
                i18nKey="settings.developer.consoleDesc"
                values={{ shortcut: CONSOLE_SHORTCUT }}
                components={{ kbd: <Kbd /> }}
              />
            }
          >
            <Switch
              checked={s.developer.console}
              onChange={(v) => set({ developer: { ...s.developer, console: v } })}
            />
          </PanelRow>
        </Panel>

        <Panel icon={RotateCcw} title={t('settings.sections.reset')}>
          <PanelRow name={t('settings.reset.label')} desc={t('settings.reset.desc')}>
            <button
              onClick={resetSettings}
              className="flex h-8 items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-[13px] text-[12px] text-rose-300 hover:border-rose-500/60 hover:text-rose-200"
            >
              <RotateCcw size={14} />
              {t('settings.reset.button')}
            </button>
          </PanelRow>
        </Panel>

        {/*
          About — KEEP LAST.
          This panel must always be the final section of the settings list. Add any new
          settings Panels ABOVE this block, never below it. It shows the Chrome-style
          update card plus repository/author/contributor metadata sourced from package.json.
        */}
        <Panel icon={Info} title={t('settings.sections.about')}>
          <div className="border-b border-line2">
            <UpdateCard version={version} releasesUrl={RELEASES_URL} />
          </div>
          <PanelRow name={t('settings.about.repository')} desc={t('settings.about.repositoryDesc')}>
            <button
              onClick={() => window.plucker.openExternal(REPO_URL)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-raise pl-[13px] pr-2.5 text-[12px] text-ink-dim hover:text-ink"
            >
              {t('settings.about.viewRepo')}
              <ExternalLink size={14} />
            </button>
          </PanelRow>
          <PanelRow name={t('settings.about.author')}>
            <span className="text-[12.5px] text-ink-dim">{AUTHOR_NAME}</span>
          </PanelRow>
          {CONTRIBUTOR_NAMES.length > 0 && (
            <PanelRow name={t('settings.about.contributors')}>
              <span className="max-w-[320px] text-right text-[12.5px] text-ink-dim">
                {CONTRIBUTOR_NAMES.join(', ')}
              </span>
            </PanelRow>
          )}
        </Panel>
      </div>

      {/* Cancel always closes; Save is inert until there are unsaved edits. */}
      <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2.5 border-t border-line bg-panel px-5 py-3">
        <button
          onClick={onClose}
          className="h-[34px] rounded-md border border-line px-4 text-[13px] text-ink-dim"
        >
          {t('settings.cancel')}
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className="h-[34px] rounded-md bg-accent px-5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {t('settings.save')}
        </button>
      </div>
    </div>
  )
}
