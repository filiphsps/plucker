import { describe, it, expect } from 'vitest'
import { appBundlePath, buildSwapScript } from './mac-installer'

describe('appBundlePath', () => {
  it('extracts the .app root from the executable path', () => {
    expect(appBundlePath('/Applications/Plucker.app/Contents/MacOS/Plucker')).toBe(
      '/Applications/Plucker.app'
    )
  })

  it('handles bundles outside /Applications', () => {
    expect(appBundlePath('/Users/me/Desktop/Plucker.app/Contents/MacOS/Plucker')).toBe(
      '/Users/me/Desktop/Plucker.app'
    )
  })

  it('returns null when not inside an .app bundle', () => {
    expect(appBundlePath('/usr/local/bin/plucker')).toBeNull()
  })
})

describe('buildSwapScript', () => {
  const script = buildSwapScript({
    zipPath: '/tmp/cache/update.zip',
    bundlePath: '/Applications/Plucker.app',
    pid: 4321,
    logPath: '/Users/me/.plucker/plucker.log',
    exeName: 'Plucker'
  })

  it('waits for the running pid before swapping', () => {
    expect(script).toContain('while kill -0 4321 2>/dev/null; do sleep 0.2; done')
  })

  it('stages on the same volume, then removes the old bundle and swaps in the new one', () => {
    expect(script).toContain(`mktemp -d '/Applications'/.plucker-update.XXXXXX`)
    expect(script).toContain(`ditto -x -k '/tmp/cache/update.zip' "$STAGE"`)
    expect(script).toContain(`rm -rf '/Applications/Plucker.app'`)
    expect(script).toContain(`mv "$STAGE"/'Plucker.app' '/Applications/Plucker.app'`)
  })

  it('relaunches with a fresh instance (open -n), retrying', () => {
    expect(script).toContain(`open -n '/Applications/Plucker.app'`)
    expect(script).toContain('for i in 1 2 3 4 5; do')
  })

  it('refreshes the LaunchServices registration before relaunching', () => {
    expect(script).toContain('lsregister')
    expect(script).toContain(`-f '/Applications/Plucker.app'`)
  })

  it('logs each relaunch attempt outcome', () => {
    expect(script).toContain('[plucker-update] relaunched')
    expect(script).toContain('[plucker-update] open attempt')
  })

  it('falls back to launching the executable directly when open keeps failing', () => {
    expect(script).toContain(`'/Applications/Plucker.app/Contents/MacOS/Plucker'`)
  })

  it('skips the relaunch when relaunch is false (install-on-quit)', () => {
    const s = buildSwapScript({
      zipPath: '/tmp/cache/update.zip',
      bundlePath: '/Applications/Plucker.app',
      pid: 4321,
      logPath: '/Users/me/.plucker/plucker.log',
      exeName: 'Plucker',
      relaunch: false
    })
    expect(s).not.toContain('open -n')
    expect(s).toContain('not relaunching')
    // still performs the swap
    expect(s).toContain(`mv "$STAGE"/'Plucker.app' '/Applications/Plucker.app'`)
  })

  it('quotes paths so spaces survive the shell', () => {
    const s = buildSwapScript({
      zipPath: '/tmp/u.zip',
      bundlePath: '/Applications/My App.app',
      pid: 1,
      logPath: '/tmp/l.log',
      exeName: 'My App'
    })
    expect(s).toContain(`rm -rf '/Applications/My App.app'`)
    expect(s).toContain(`mv "$STAGE"/'My App.app' '/Applications/My App.app'`)
    expect(s).toContain(`'/Applications/My App.app/Contents/MacOS/My App'`)
  })
})
