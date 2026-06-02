import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  copyFileSync,
  rmSync
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Settings } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/defaults'

/** Plucker's app-data directory (`~/.plucker`), holding the config + log. Created on access. */
export function pluckerDir(home = homedir()): string {
  const dir = join(home, '.plucker')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function settingsPath(): string {
  return join(pluckerDir(), 'config.json')
}

/** Absolute path of the unified log file (`~/.plucker/plucker.log`). */
export function logPath(): string {
  return join(pluckerDir(), 'plucker.log')
}

/**
 * One-time relocation of the legacy `~/.plucker.json` config into `~/.plucker/config.json`.
 * Idempotent and safe to run every launch: migrates only when the old file exists and the
 * new one does not, never clobbering an existing new config. Returns true when it moved a file.
 */
export function migrateConfigLocation(oldPath: string, newPath: string): boolean {
  if (!existsSync(oldPath) || existsSync(newPath)) return false
  mkdirSync(join(newPath, '..'), { recursive: true })
  try {
    renameSync(oldPath, newPath)
  } catch {
    // Cross-device or locked rename: fall back to copy (leaving the old file in place).
    copyFileSync(oldPath, newPath)
  }
  return true
}

/** Run the legacy → `~/.plucker/` config migration using the real home directory. */
export function migrateLegacyConfig(home = homedir()): void {
  migrateConfigLocation(join(home, '.plucker.json'), join(home, '.plucker', 'config.json'))
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
    urlHistory: Array.isArray(p.urlHistory)
      ? p.urlHistory.filter((u) => typeof u === 'string')
      : [],
    downloads: { ...d.downloads, ...(p.downloads ?? {}) },
    audio: { ...d.audio, ...(p.audio ?? {}) },
    cookies: { ...d.cookies, ...(p.cookies ?? {}) },
    transforms:
      isV2 && Array.isArray(p.transforms) ? (p.transforms as Settings['transforms']) : d.transforms,
    performance: { ...d.performance, ...(p.performance ?? {}) },
    updates: { ...d.updates, ...(p.updates ?? {}) },
    developer: {
      ...d.developer,
      ...(p.developer ?? {}),
      consoleWindow: {
        ...d.developer.consoleWindow,
        ...((p.developer as { consoleWindow?: Partial<Settings['developer']['consoleWindow']> })
          ?.consoleWindow ?? {})
      }
    }
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

/**
 * Wipe Plucker's persisted config (`~/.plucker/config.json`) entirely. Removing the file
 * makes the next `loadSettings` fall through to `DEFAULT_SETTINGS`, so every setting and the
 * download history reset to factory state. No-op when the file is already gone.
 */
export function resetSettings(file = settingsPath()): void {
  rmSync(file, { force: true })
}
