import { describe, it, expect } from 'vitest'
import { spawnManaged, killAllChildren } from './spawn'

// Process groups / SIGKILL semantics are POSIX-only; the app ships macOS builds.
const itPosix = process.platform === 'win32' ? it.skip : it

const closed = (child: { on: (e: string, cb: () => void) => void }): Promise<void> =>
  new Promise((res) => child.on('close', () => res()))

describe('spawnManaged', () => {
  itPosix('force-kills the process when its signal aborts', async () => {
    const ac = new AbortController()
    const child = spawnManaged('sleep', ['30'], {}, ac.signal)
    const done = closed(child)
    ac.abort()
    await done // resolving at all proves the child was killed, not left running
    expect(child.signalCode).toBe('SIGKILL')
  })

  itPosix('kills immediately when the signal is already aborted at spawn time', async () => {
    const ac = new AbortController()
    ac.abort()
    const child = spawnManaged('sleep', ['30'], {}, ac.signal)
    await closed(child)
    expect(child.signalCode).toBe('SIGKILL')
  })
})

describe('killAllChildren', () => {
  itPosix('reaps every still-running managed child', async () => {
    const a = spawnManaged('sleep', ['30'])
    const b = spawnManaged('sleep', ['30'])
    const done = Promise.all([closed(a), closed(b)])
    killAllChildren()
    await done
    expect(a.signalCode).toBe('SIGKILL')
    expect(b.signalCode).toBe('SIGKILL')
  })
})
