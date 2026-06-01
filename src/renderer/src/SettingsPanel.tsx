import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Settings, Bitrate, MinBitrate, CookieSource, Language } from '../../shared/types'
import type { TransformManifest } from '../../shared/transforms'
import { TransformsSection } from './TransformsSection'
import { applyLanguage } from './i18n'

const BITRATES: Bitrate[] = [320, 256, 192, 128]
const MIN_BITRATES: MinBitrate[] = [64, 96, 128, 160]
const SOURCES: CookieSource[] = ['auto', 'none', 'chrome', 'edge', 'safari', 'firefox', 'brave']
const LANGUAGES: Language[] = ['system', 'en', 'de']

export function SettingsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation()
  const [s, setS] = useState<Settings | null>(null)
  const [catalog, setCatalog] = useState<TransformManifest[]>([])
  useEffect(() => {
    window.plucker.getSettings().then(setS)
    window.plucker.getTransformCatalog().then(setCatalog)
  }, [])
  if (!s) return <div />

  const set = (patch: Partial<Settings>): void => setS({ ...s, ...patch })

  async function save(): Promise<void> {
    if (s) {
      await window.plucker.saveSettings(s)
      await applyLanguage(s.language)
      onClose()
    }
  }
  async function chooseFolder(): Promise<void> {
    const f = await window.plucker.chooseFolder()
    if (f) set({ downloads: { ...s!.downloads, baseFolder: f } })
  }

  const cookieLabel = (src: CookieSource): string =>
    src === 'auto' ? t('settings.cookies.auto') : src === 'none' ? t('settings.cookies.none') : src

  const languageLabel = (lang: Language): string =>
    lang === 'system' ? t('settings.language.system') : lang === 'de' ? 'Deutsch' : 'English'

  const field = 'w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm'
  const heading = 'text-sm uppercase tracking-wide text-neutral-500 mb-2'

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end">
      <div className="w-[420px] h-full bg-neutral-950 text-neutral-100 p-5 overflow-auto border-l border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">
            ✕
          </button>
        </div>

        <section className="mb-5">
          <h3 className={heading}>{t('settings.sections.language')}</h3>
          <select
            className={field}
            value={s.language}
            onChange={(e) => set({ language: e.target.value as Language })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {languageLabel(lang)}
              </option>
            ))}
          </select>
        </section>

        <section className="mb-5">
          <h3 className={heading}>{t('settings.sections.downloads')}</h3>
          <div className="flex gap-2 items-center">
            <input
              className={field}
              value={s.downloads.baseFolder}
              onChange={(e) => set({ downloads: { ...s.downloads, baseFolder: e.target.value } })}
            />
            <button
              onClick={chooseFolder}
              className="text-sm px-2 py-1 border border-neutral-800 rounded"
            >
              {t('settings.downloads.choose')}
            </button>
          </div>
          <label className="flex gap-2 items-center mt-2 text-sm">
            <input
              type="checkbox"
              checked={s.downloads.perPlaylistSubfolder}
              onChange={(e) =>
                set({ downloads: { ...s.downloads, perPlaylistSubfolder: e.target.checked } })
              }
            />
            {t('settings.downloads.perPlaylistSubfolder')}
          </label>
        </section>

        <section className="mb-5">
          <h3 className={heading}>{t('settings.sections.audio')}</h3>
          <label className="text-sm">
            {t('settings.audio.preferredBitrate')}
            <select
              className={field}
              value={s.audio.preferredBitrate}
              onChange={(e) =>
                set({ audio: { ...s.audio, preferredBitrate: Number(e.target.value) as Bitrate } })
              }
            >
              {BITRATES.map((b) => (
                <option key={b} value={b}>
                  {b}K
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm mt-2 block">
            {t('settings.audio.minQuality')}
            <select
              className={field}
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
          </label>
        </section>

        <section className="mb-5">
          <h3 className={heading}>{t('settings.sections.cookies')}</h3>
          <select
            className={field}
            value={s.cookies.source}
            onChange={(e) => set({ cookies: { source: e.target.value as CookieSource } })}
          >
            {SOURCES.map((src) => (
              <option key={src} value={src}>
                {cookieLabel(src)}
              </option>
            ))}
          </select>
        </section>

        <TransformsSection
          instances={s.transforms}
          catalog={catalog}
          onChange={(transforms) => set({ transforms })}
          t={(key) => t(key as never)}
        />

        <section className="mb-6">
          <h3 className={heading}>{t('settings.sections.performance')}</h3>
          <label className="text-sm">
            {t('settings.performance.parallel')}
            <input
              type="number"
              min={1}
              max={16}
              className={field}
              value={s.performance.parallel}
              onChange={(e) => set({ performance: { parallel: Number(e.target.value) } })}
            />
          </label>
        </section>

        <button
          onClick={save}
          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 font-medium"
        >
          {t('settings.done')}
        </button>
      </div>
    </div>
  )
}
