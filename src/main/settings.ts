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

/** Deep-merge a partial object onto defaults, one level per nested group. */
function mergeDefaults(partial: unknown): Settings {
  const p = (partial ?? {}) as { [K in keyof Settings]?: Partial<Settings[K]> }
  const d = DEFAULT_SETTINGS
  return {
    version: d.version,
    language: p.language ?? d.language,
    downloads: { ...d.downloads, ...(p.downloads ?? {}) },
    audio: { ...d.audio, ...(p.audio ?? {}) },
    cookies: { ...d.cookies, ...(p.cookies ?? {}) },
    tagging: { ...d.tagging, ...(p.tagging ?? {}) },
    rename: { ...d.rename, ...(p.rename ?? {}) },
    performance: { ...d.performance, ...(p.performance ?? {}) }
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
