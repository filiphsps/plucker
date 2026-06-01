import React, { useEffect, useState } from 'react'
import type { Settings, Bitrate, MinBitrate, CookieSource } from '../../shared/types'

const BITRATES: Bitrate[] = [320, 256, 192, 128]
const MIN_BITRATES: MinBitrate[] = [64, 96, 128, 160]
const SOURCES: CookieSource[] = ['auto', 'none', 'chrome', 'edge', 'safari', 'firefox', 'brave']

export function SettingsPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    window.plucker.getSettings().then(setS)
  }, [])
  if (!s) return <div />

  const set = (patch: Partial<Settings>): void => setS({ ...s, ...patch })

  async function save(): Promise<void> {
    if (s) {
      await window.plucker.saveSettings(s)
      onClose()
    }
  }
  async function chooseFolder(): Promise<void> {
    const f = await window.plucker.chooseFolder()
    if (f) set({ downloads: { ...s!.downloads, baseFolder: f } })
  }

  const field = 'w-full rounded bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm'

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end">
      <div className="w-[420px] h-full bg-neutral-950 text-neutral-100 p-5 overflow-auto border-l border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">✕</button>
        </div>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Downloads</h3>
          <div className="flex gap-2 items-center">
            <input className={field} value={s.downloads.baseFolder}
              onChange={(e) => set({ downloads: { ...s.downloads, baseFolder: e.target.value } })} />
            <button onClick={chooseFolder} className="text-sm px-2 py-1 border border-neutral-800 rounded">Choose</button>
          </div>
          <label className="flex gap-2 items-center mt-2 text-sm">
            <input type="checkbox" checked={s.downloads.perPlaylistSubfolder}
              onChange={(e) => set({ downloads: { ...s.downloads, perPlaylistSubfolder: e.target.checked } })} />
            Per-playlist subfolder
          </label>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Audio</h3>
          <label className="text-sm">Preferred bitrate
            <select className={field} value={s.audio.preferredBitrate}
              onChange={(e) => set({ audio: { ...s.audio, preferredBitrate: Number(e.target.value) as Bitrate } })}>
              {BITRATES.map((b) => <option key={b} value={b}>{b}K</option>)}
            </select>
          </label>
          <label className="text-sm mt-2 block">Minimum source quality (skip below)
            <select className={field} value={s.audio.minBitrate ?? ''}
              onChange={(e) => set({ audio: { ...s.audio, minBitrate: e.target.value ? Number(e.target.value) as MinBitrate : null } })}>
              <option value="">Off</option>
              {MIN_BITRATES.map((b) => <option key={b} value={b}>{b}K</option>)}
            </select>
          </label>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Cookies</h3>
          <select className={field} value={s.cookies.source}
            onChange={(e) => set({ cookies: { source: e.target.value as CookieSource } })}>
            {SOURCES.map((src) => <option key={src} value={src}>{src}</option>)}
          </select>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Tagging</h3>
          {([
            ['enabled', 'Enable tagging'],
            ['enrichWithMusicBrainz', 'Enrich with MusicBrainz'],
            ['fetchCoverArt', 'Fetch album cover'],
            ['fetchGenre', 'Fetch genre'],
            ['fetchTrackNumber', 'Fetch track number'],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex gap-2 items-center text-sm">
              <input type="checkbox" checked={s.tagging[k] as boolean}
                onChange={(e) => set({ tagging: { ...s.tagging, [k]: e.target.checked } })} />
              {label}
            </label>
          ))}
          <label className="text-sm mt-2 block">Primary source
            <select className={field} value={s.tagging.primarySource}
              onChange={(e) => set({ tagging: { ...s.tagging, primarySource: e.target.value as 'youtube' | 'musicbrainz' } })}>
              <option value="youtube">YouTube</option>
              <option value="musicbrainz">MusicBrainz</option>
            </select>
          </label>
          <label className="text-sm mt-2 block">Min match score
            <input type="number" className={field} value={s.tagging.minMatchScore}
              onChange={(e) => set({ tagging: { ...s.tagging, minMatchScore: Number(e.target.value) } })} />
          </label>
          <label className="text-sm mt-2 block">MusicBrainz contact email
            <input className={field} value={s.tagging.userAgentEmail}
              onChange={(e) => set({ tagging: { ...s.tagging, userAgentEmail: e.target.value } })} />
          </label>
        </section>

        <section className="mb-5">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Naming</h3>
          <label className="flex gap-2 items-center text-sm">
            <input type="checkbox" checked={s.rename.enabled}
              onChange={(e) => set({ rename: { ...s.rename, enabled: e.target.checked } })} />
            Rename files after tagging
          </label>
          <input className={`${field} mt-2`} value={s.rename.template}
            onChange={(e) => set({ rename: { ...s.rename, template: e.target.value } })} />
          <p className="text-xs text-neutral-500 mt-1">Tokens: {'{artist} {track} {title} {album} {year}'}</p>
        </section>

        <section className="mb-6">
          <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-2">Performance</h3>
          <label className="text-sm">Parallel downloads
            <input type="number" min={1} max={16} className={field} value={s.performance.parallel}
              onChange={(e) => set({ performance: { parallel: Number(e.target.value) } })} />
          </label>
        </section>

        <button onClick={save} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 font-medium">Done</button>
      </div>
    </div>
  )
}
