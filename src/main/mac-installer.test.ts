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
    logPath: '/Users/me/.plucker/plucker.log'
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

  it('relaunches the freshly installed bundle', () => {
    expect(script).toContain(`open '/Applications/Plucker.app'`)
  })

  it('quotes paths so spaces survive the shell', () => {
    const s = buildSwapScript({
      zipPath: '/tmp/u.zip',
      bundlePath: '/Applications/My App.app',
      pid: 1,
      logPath: '/tmp/l.log'
    })
    expect(s).toContain(`rm -rf '/Applications/My App.app'`)
    expect(s).toContain(`mv "$STAGE"/'My App.app' '/Applications/My App.app'`)
  })
})
