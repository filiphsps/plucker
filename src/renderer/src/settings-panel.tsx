import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Globe,
  Download as DownloadIcon,
  AudioLines,
  Cookie,
  Blocks,
  Gauge,
  RefreshCw,
  Database,
  ChevronRight
} from 'lucide-react'
import type {
  Settings,
  Bitrate,
  MinBitrate,
  SampleRate,
  CompressionLevel,
  CookieSource,
  Language
} from '../../shared/types'
import type { TransformManifest } from '../../shared/transforms'
import { TransformsSection } from './transforms-section'
import { Panel, PanelRow } from './ui/panel'
import { Switch } from './ui/switch'
import { Segmented } from './ui/segmented'
import { Stepper } from './ui/stepper'
import { applyLanguage } from './i18n'

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
  useEffect(() => {
    window.plucker.getSettings().then((loaded) => {
      setS(loaded)
      setSaved(loaded)
    })
    window.plucker.getTransformCatalog().then(setCatalog)
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
              onChange={(e) => set({ language: e.target.value as Language })}
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
