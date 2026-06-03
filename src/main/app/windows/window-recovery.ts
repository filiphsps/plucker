// Renderer-crash safeguard. When a window's renderer process dies, the native BrowserWindow
// stays open but blank — an "empty shell". This watches each window's webContents for
// `render-process-gone` and either recovers (recreate the window) or, once crashes pile into a
// loop, gives up and hard-exits so the user is never left staring at a dead frame.
import type { BrowserWindow } from 'electron'
import { log } from '@app/app/logging/log'
import { createCrashLoopDetector } from './crash-loop'

export interface CrashGuardOptions {
  /** Recreate the crashed window from scratch (replaces the blank "empty shell"). */
  recover: () => void
  /** Hard-exit the app — invoked only when crashes form an unrecoverable loop. */
  fatal: (reason: string) => void
  /** Recoverable crashes tolerated within `windowMs` before giving up. Default 3. */
  threshold?: number
  /** Sliding crash-counting window, in ms. Default 30_000. */
  windowMs?: number
  /** Clock injection for tests. Default `Date.now`. */
  now?: () => number
}

export interface CrashGuard {
  /** Attach the crash listeners to a freshly created window. */
  attach: (win: BrowserWindow) => void
}

/**
 * Build a crash guard. One detector is shared across every window the guard attaches to —
 * including the recreated ones — so "crash → recover → crash again" still converges on the loop
 * threshold instead of resetting the count each time a fresh window is made.
 */
export function createCrashGuard(opts: CrashGuardOptions): CrashGuard {
  const now = opts.now ?? Date.now
  const detector = createCrashLoopDetector({
    threshold: opts.threshold ?? 3,
    windowMs: opts.windowMs ?? 30_000
  })
  return {
    attach(win) {
      win.webContents.on('render-process-gone', (_event, details) => {
        // A clean exit is intentional (the renderer asked to close), not a crash to recover from.
        if (details.reason === 'clean-exit') return
        const reason = `${details.reason} (exit ${details.exitCode})`
        log.error('app', `renderer process gone: ${reason}`)
        if (detector.record(now())) {
          log.error('app', 'renderer crash loop — abandoning recovery, shutting down')
          opts.fatal(reason)
          return
        }
        log.warn('app', 'recovering crashed window…')
        try {
          opts.recover()
        } catch (err) {
          // Recovery itself failing is unrecoverable — don't leave the empty shell up.
          log.error('app', 'window recovery failed:', err)
          opts.fatal(`recovery failed: ${String(err)}`)
        }
      })
      // A hung (but alive) renderer is logged, not killed: it may simply be busy, and tearing it
      // down could discard in-flight work. Crashes — not hangs — are what strand the empty shell.
      win.webContents.on('unresponsive', () => log.warn('app', 'renderer unresponsive'))
    }
  }
}
