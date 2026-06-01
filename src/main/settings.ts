import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Settings } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/defaults'

export function settingsPath(): string {
  return join(homedir(), '.plucker.json')
}

export function expandHome(p: string, home = homedir()): string {
  return p.startsWith('~') ? join(home, p.slice(1)) : p
}

/** Merge a partial object onto defaults; reset transforms when migrating from < v2. */
function mergeDefaults(partial: unknown): Settings {
  const p = (partial ?? {}) as Partial<Settings> & { version?: number }
  const d = DEFAULT_SETTINGS
  const isV2 = typeof p.version === 'number' && p.version >= 2
  return {
    version: d.version,
    language: p.language ?? d.language,
    history: Array.isArray(p.history) ? (p.history as Settings['history']) : d.history,
    downloads: { ...d.downloads, ...(p.downloads ?? {}) },
    audio: { ...d.audio, ...(p.audio ?? {}) },
    cookies: { ...d.cookies, ...(p.cookies ?? {}) },
    transforms:
      isV2 && Array.isArray(p.transforms) ? (p.transforms as Settings['transforms']) : d.transforms,
    performance: { ...d.performance, ...(p.performance ?? {}) },
    updates: { ...d.updates, ...(p.updates ?? {}) }
  }
}

export function loadSettings(file = settingsPath()): Settings {
  if (!existsSync(file)) {
    saveSettings(file, DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
  try {
    return mergeDefaults(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    saveSettings(file, DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(file: string, settings: Settings): void {
  writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8')
}
