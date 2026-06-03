// Last-resort rollback orchestration. Thin Electron/network glue over the tested pure
// modules (launch-health, github-download, recovery-state). Silent by design: a broken app
// may not be able to render UI, so we download + install + relaunch without an up-front
// prompt, then show a one-time notice on the rolled-back build once it's healthy
// (safety-guard.ts handles that). Best-effort: any failure logs and returns false so the
// caller can fall through to a normal startup attempt.
import { app, dialog, shell, type BrowserWindow } from 'electron'
import { basename } from 'node:path'
import { log } from '@app/app/logging/log'
import { logPath } from '@app/app/settings/settings'
import { appBundlePath, installMacUpdate } from '@app/app/updater/mac-installer'
import { fetchReleases, downloadReleaseZip } from '@app/app/updater/github-download'
import { extractVersion } from '@shared/compare-semver'
import { loadRecoveryState, saveRecoveryState } from './recovery-state'
import {
  canRollback,
  noteRollbackAttempt,
  noteRollbackTarget,
  pickRollbackTarget,
  type ReleaseRef
} from './launch-health'

/** Releases page for the manual-download escape hatch when auto-recovery gives up. */
export const RELEASES_URL = 'https://github.com/filiphsps/plucker/releases'

/**
 * Attempt to roll back to the previous release and relaunch. Returns true when a rollback
 * was initiated (the app is quitting to let the swap script run), false when it bailed
 * (loop guard tripped, no older release, or a download/install error) — in which case the
 * caller should continue a normal startup.
 */
export async function performRollback(getWindow: () => BrowserWindow | null): Promise<boolean> {
  const bundlePath = appBundlePath(app.getPath('exe'))
  if (!bundlePath) {
    log.warn('app', 'rollback skipped: not running from a packaged .app bundle')
    return false
  }

  let state = loadRecoveryState()
  if (!canRollback(state)) {
    log.error('app', `rollback loop guard tripped after ${state.rollbackAttempts} attempts`)
    await offerManualDownload(getWindow())
    return false
  }

  // Count this attempt up-front (and reset badStreak) so even a failed download converges
  // the loop guard and the rolled-back build isn't re-triggered by the stale streak.
  state = noteRollbackAttempt(state)
  saveRecoveryState(state)

  const current = app.getVersion()
  try {
    const releases = await fetchReleases()
    const refs: ReleaseRef[] = releases
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({ tag: r.tag_name, version: extractVersion(r.tag_name) ?? '' }))
      .filter((r) => r.version !== '')
    const target = pickRollbackTarget(refs, current, state.lastRollbackVersion)
    if (!target) {
      log.error('app', `no older release to roll back to (current ${current})`)
      return false
    }
    const release = releases.find((r) => r.tag_name === target.tag)
    if (!release) return false

    log.warn('app', `rolling back from ${current} to ${target.version} (${target.tag})`)
    const zipPath = await downloadReleaseZip({
      release,
      arch: process.arch,
      destDir: app.getPath('temp')
    })

    // Persist the target + post-recovery notice immediately before the relaunch.
    saveRecoveryState(noteRollbackTarget(loadRecoveryState(), { to: target.version, from: current }))
    installMacUpdate({
      zipPath,
      bundlePath,
      pid: process.pid,
      logPath: logPath(),
      scriptDir: app.getPath('temp'),
      exeName: basename(app.getPath('exe'))
    })
    app.quit()
    return true
  } catch (err) {
    log.error('app', 'rollback failed:', err)
    return false
  }
}

/** When auto-recovery gives up, point the user at the releases page for a manual download. */
async function offerManualDownload(win: BrowserWindow | null): Promise<void> {
  const opts: Electron.MessageBoxOptions = {
    type: 'warning',
    buttons: ['Download latest', 'OK'],
    defaultId: 0,
    cancelId: 1,
    message: "Plucker couldn't recover automatically",
    detail:
      'Plucker repeatedly failed to start and rolling back to a previous version did not ' +
      'help. Please download the latest version manually.'
  }
  try {
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    if (response === 0) await shell.openExternal(RELEASES_URL)
  } catch {
    // No display / dialog failure must not throw out of the recovery path.
  }
}
