/**
 * Earliest-possible logging bootstrap for the main process.
 *
 * Historically the file-log transport was attached late (after the window + all the
 * native-module init) AND only when the developer console was enabled — so a packaged
 * build that crashed during startup (e.g. a native module failing to `dlopen`) left no
 * window and no log file: a completely silent failure.
 *
 * This wires up, as the very first thing the process does:
 *   1. the `uncaughtException` / `unhandledRejection` handlers, and
 *   2. an **unconditional** append-to-disk file transport (bounded + rotated),
 * then writes a one-line runtime banner. After this runs, every `log.*` call and any
 * otherwise-fatal error is durably written to `~/.plucker/plucker.log` regardless of
 * the developer-console setting — so the next crash is diagnosable instead of silent.
 *
 * Kept free of any `electron` import so it can be unit-tested under plain Node.
 */
import { log, addLogTransport, installProcessErrorHandlers } from './log'
import { createFileTransport } from './log-file'

export interface BootstrapLoggingOptions {
  /** App version, for the startup banner. */
  version: string
  /** Absolute path of the log file (e.g. `~/.plucker/plucker.log`). */
  logFile: string
}

/**
 * Attach the durable file log + process error handlers before any window/native work.
 * Returns a disposer that detaches both (used by tests; the app keeps them for life).
 */
export function bootstrapFileLogging({ version, logFile }: BootstrapLoggingOptions): () => void {
  const detachHandlers = installProcessErrorHandlers()
  let detachFile = (): void => {}
  try {
    detachFile = addLogTransport(createFileTransport(logFile))
  } catch (err) {
    // Logging setup must never prevent the app from starting; surface to stderr and
    // continue (the in-memory ring + console still work).
    console.error('[bootstrap] failed to attach file log transport:', err)
  }
  log.info(
    'app',
    `Plucker ${version} starting — ${process.platform}/${process.arch} ` +
      `electron=${process.versions.electron ?? 'n/a'} node=${process.versions.node}`
  )
  return () => {
    detachFile()
    detachHandlers()
  }
}
