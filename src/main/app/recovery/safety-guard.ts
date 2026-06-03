// Last-resort recovery guard wiring. Two triggers funnel into one rollback:
//   1) no window visible within WATCHDOG_MS of launch (this session), and
//   2) badStreak >= BAD_LAUNCH_THRESHOLD at startup (force-close / crash loop across launches).
// "Healthy" = a window stays visible for HEALTHY_SETTLE_MS; reaching it clears the episode.
// All decision logic lives in launch-health.ts; this file is thin glue around timers + IPC-free
// Electron calls. Gated to packaged macOS builds by the caller (index.ts).
import { BrowserWindow, dialog } from 'electron'
import { log } from '@app/app/logging/log'
import { loadRecoveryState, saveRecoveryState, type RecoveryNotice } from './recovery-state'
import {
  accountForStartup,
  markCleanExit,
  markHealthy,
  shouldRecoverAtStartup
} from './launch-health'
import { performRollback } from './rollback'

/** No window visible within this long after launch → recover. */
export const WATCHDOG_MS = 20_000
/** A window must stay visible this long to count the launch as healthy. */
export const HEALTHY_SETTLE_MS = 10_000

export interface SafetyGuard {
  /** Account for the previous launch + mark this one in progress. Returns whether to recover now. */
  beginLaunch(): { recoverNow: boolean }
  /** Start the no-window watchdog (call once after the first createWindow()). */
  armWatchdog(): void
  /** A window became visible — start the healthy-settle timer. */
  onWindowVisible(): void
  /** A clean quit is happening (⌘Q / before-quit). */
  onCleanExit(): void
  /** Trigger a rollback now. Resolves true when the app is quitting to roll back. */
  recover(): Promise<boolean>
}

export function createSafetyGuard(getWindow: () => BrowserWindow | null): SafetyGuard {
  let watchdog: ReturnType<typeof setTimeout> | null = null
  let settle: ReturnType<typeof setTimeout> | null = null
  let healthy = false
  let recovering = false

  const cancelWatchdog = (): void => {
    if (watchdog) clearTimeout(watchdog)
    watchdog = null
  }

  const recover = async (): Promise<boolean> => {
    if (recovering) return false
    recovering = true
    cancelWatchdog()
    const did = await performRollback(getWindow)
    if (!did) recovering = false // bailed — allow a later trigger
    return did
  }

  return {
    beginLaunch() {
      const next = accountForStartup(loadRecoveryState())
      saveRecoveryState(next)
      log.info(
        'app',
        `launch health: badStreak=${next.badStreak}, rollbackAttempts=${next.rollbackAttempts}`
      )
      return { recoverNow: shouldRecoverAtStartup(next) }
    },

    armWatchdog() {
      cancelWatchdog()
      watchdog = setTimeout(() => {
        watchdog = null
        if (healthy) return
        const visible = BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible())
        if (visible) return
        log.error('app', `no window visible ${WATCHDOG_MS / 1000}s after launch; recovering`)
        void recover()
      }, WATCHDOG_MS)
    },

    onWindowVisible() {
      if (healthy || settle) return
      settle = setTimeout(() => {
        settle = null
        healthy = true
        cancelWatchdog()
        const prev = loadRecoveryState()
        const notice = prev.pendingRecoveryNotice
        saveRecoveryState(markHealthy())
        log.info('app', 'launch healthy; recovery state reset')
        if (notice) showRecoveryNotice(getWindow(), notice)
      }, HEALTHY_SETTLE_MS)
    },

    onCleanExit() {
      if (healthy) return // healthy already cleared launchInProgress
      saveRecoveryState(markCleanExit(loadRecoveryState()))
    },

    recover
  }
}

/** One-time "you were rolled back" notice, shown on the recovered build once it's healthy. */
function showRecoveryNotice(win: BrowserWindow | null, notice: RecoveryNotice): void {
  const opts: Electron.MessageBoxOptions = {
    type: 'info',
    buttons: ['OK'],
    message: 'Plucker was rolled back',
    detail:
      `Plucker had trouble starting on version ${notice.from}, so it was rolled back to ` +
      `${notice.rolledBackTo} to keep it working.`
  }
  try {
    void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
  } catch {
    // No display — never let a notice failure escape.
  }
}
