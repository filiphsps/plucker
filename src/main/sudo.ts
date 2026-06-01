import sudoPrompt from '@vscode/sudo-prompt'

/** Thrown when the user dismisses the macOS admin prompt (vs. a real failure). */
export class SudoCancelledError extends Error {
  constructor() {
    super('Cookie access was not granted.')
    this.name = 'SudoCancelledError'
  }
}

/**
 * POSIX-quote a single argument: wrap in single quotes and escape any embedded
 * single quote as `'\''`. Used to build the elevated command string so URLs and
 * paths can never break out into shell injection.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Run a fully-formed shell command as root via the native macOS admin dialog
 * (Touch ID supported), branded with the app name. Callers MUST pre-quote every
 * interpolated value with {@link shellQuote}. Rejects with {@link SudoCancelledError}
 * when the user cancels, or a plain Error otherwise.
 */
export function execElevated(
  command: string,
  opts: { name?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    sudoPrompt.exec(command, { name: opts.name ?? 'Plucker' }, (error, stdout, stderr) => {
      if (error) {
        if (/did not grant permission/i.test(error.message)) reject(new SudoCancelledError())
        else reject(error)
        return
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}
