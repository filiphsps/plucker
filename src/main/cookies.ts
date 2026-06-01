import { rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Settings } from '../shared/types'
import { shellQuote, execElevated } from './sudo'
import { log } from './log'

/** True when the cookie source is a real browser (so escalation could be needed). */
export function needsCookieEscalation(settings: Settings): boolean {
  const s = settings.cookies.source
  return s !== 'none' && s !== 'auto'
}

/**
 * Detect the yt-dlp browser-cookie permission failure in combined std streams.
 * Requires the word "cookie" to be present so an unrelated permission error
 * (e.g. writing the output file) does not trigger escalation.
 */
export function isCookiePermissionError(text: string): boolean {
  if (!/cookie/i.test(text)) return false
  return (
    /could not (copy|read|find).*cookie/i.test(text) ||
    /unable to (open|read).*cookie/i.test(text) ||
    /permission denied/i.test(text) ||
    /operation not permitted/i.test(text)
  )
}

/**
 * Pure: the single elevated shell command that exports cookies + hands the file
 * back to the invoking user. The target file MUST NOT pre-exist — yt-dlp loads
 * `--cookies` as a jar on startup and rejects an empty file, but writes a fresh
 * Netscape file when the path is absent. `--ignore-errors` lets the cookie jar
 * still be saved even if the probe URL's extraction fails.
 */
export function buildExportCommand(input: {
  ytdlpPath: string
  source: string
  tmpFile: string
  probeUrl: string
  uid: number
  gid: number
}): string {
  const { ytdlpPath, source, tmpFile, probeUrl, uid, gid } = input
  const q = shellQuote
  const ytdlp = [
    q(ytdlpPath),
    '--cookies-from-browser',
    q(source),
    '--cookies',
    q(tmpFile),
    '--flat-playlist',
    '--skip-download',
    '--ignore-errors',
    '--ignore-config',
    '--no-warnings',
    q(probeUrl)
  ].join(' ')
  return `${ytdlp} && chown ${uid}:${gid} ${q(tmpFile)} && chmod 600 ${q(tmpFile)}`
}

let cookieCounter = 0

/**
 * Run ONE elevated yt-dlp to export the browser cookies into a user-owned temp
 * file, returning its path. Throws (propagating SudoCancelledError) on failure.
 */
export async function exportBrowserCookies(
  ytdlpPath: string,
  source: string,
  probeUrl: string
): Promise<string> {
  const tmpFile = join(tmpdir(), `plucker-cookies-${process.pid}-${cookieCounter++}.txt`)
  const command = buildExportCommand({
    ytdlpPath,
    source,
    tmpFile,
    probeUrl,
    uid: process.getuid?.() ?? 0,
    gid: process.getgid?.() ?? 0
  })
  log.info('cookies', 'Requesting permission to read browser cookies…')
  await execElevated(command, { name: 'Plucker' })
  let size = 0
  try {
    size = statSync(tmpFile).size
  } catch {
    size = 0
  }
  if (size === 0) {
    cleanupCookieFile(tmpFile)
    throw new Error('Cookie export produced no cookies — the browser store could not be read.')
  }
  log.info('cookies', 'Browser cookies exported; continuing unprivileged.')
  return tmpFile
}

/** Best-effort removal of the temp cookie file. */
export function cleanupCookieFile(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    /* already gone */
  }
}
