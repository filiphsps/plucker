import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { createCrashGuard } from './window-recovery'

/** A fake window whose webContents is an EventEmitter we can drive crash events on. */
function fakeWindow(): { win: BrowserWindow; crash: (reason: string) => void } {
  const wc = new EventEmitter()
  return {
    win: { webContents: wc } as unknown as BrowserWindow,
    crash: (reason) => wc.emit('render-process-gone', {}, { reason, exitCode: 133 })
  }
}

describe('createCrashGuard', () => {
  it('recovers a crashed renderer', () => {
    const recover = vi.fn()
    const fatal = vi.fn()
    const { win, crash } = fakeWindow()
    createCrashGuard({ recover, fatal }).attach(win)
    crash('crashed')
    expect(recover).toHaveBeenCalledOnce()
    expect(fatal).not.toHaveBeenCalled()
  })

  it('ignores a clean exit', () => {
    const recover = vi.fn()
    const fatal = vi.fn()
    const { win, crash } = fakeWindow()
    createCrashGuard({ recover, fatal }).attach(win)
    crash('clean-exit')
    expect(recover).not.toHaveBeenCalled()
    expect(fatal).not.toHaveBeenCalled()
  })

  it('hard-crashes once crashes exceed the threshold within the window', () => {
    let t = 0
    const recover = vi.fn()
    const fatal = vi.fn()
    const { win, crash } = fakeWindow()
    createCrashGuard({ recover, fatal, threshold: 3, windowMs: 30_000, now: () => t }).attach(win)
    crash('crashed')
    t = 1_000
    crash('crashed')
    t = 2_000
    crash('crashed')
    expect(recover).toHaveBeenCalledTimes(3)
    expect(fatal).not.toHaveBeenCalled()
    t = 3_000
    crash('oom') // 4th within 30s
    expect(fatal).toHaveBeenCalledOnce()
    expect(recover).toHaveBeenCalledTimes(3) // the 4th crash was not recovered
  })

  it('shares one detector across recreated windows', () => {
    let t = 0
    const recover = vi.fn()
    const fatal = vi.fn()
    const guard = createCrashGuard({ recover, fatal, threshold: 2, windowMs: 30_000, now: () => t })
    // Each "recreation" attaches a brand-new window to the same guard.
    for (let i = 0; i < 2; i++) {
      const { win, crash } = fakeWindow()
      guard.attach(win)
      crash('crashed')
      t += 1_000
    }
    expect(recover).toHaveBeenCalledTimes(2)
    expect(fatal).not.toHaveBeenCalled()
    const { win, crash } = fakeWindow()
    guard.attach(win)
    crash('crashed') // 3rd crash across windows → loop
    expect(fatal).toHaveBeenCalledOnce()
  })

  it('hard-crashes when recovery itself throws', () => {
    const recover = vi.fn(() => {
      throw new Error('boom')
    })
    const fatal = vi.fn()
    const { win, crash } = fakeWindow()
    createCrashGuard({ recover, fatal }).attach(win)
    crash('crashed')
    expect(fatal).toHaveBeenCalledOnce()
  })
})
