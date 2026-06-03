import { describe, it, expect, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import {
  spawnManaged,
  killAllChildren,
  pauseAllChildren,
  resumeAllChildren,
  pauseGroup,
  resumeGroup,
  killGroup,
  isPaused
} from './spawn'

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

/** Wait a beat for an async job-control signal to be delivered + reflected by ps. */
const tick = (): Promise<void> => new Promise((res) => setTimeout(res, 80))

/** Process state letter from `ps` — 'T' means stopped (SIGSTOP), 'S'/'R' running. */
const procState = (pid: number): string => {
  try {
    return execSync(`ps -o stat= -p ${pid}`).toString().trim()[0] ?? ''
  } catch {
    return '' // process gone
  }
}

describe('pause/resume', () => {
  afterEach(() => {
    resumeAllChildren() // clear the module-level paused flag between tests
    killAllChildren()
  })

  itPosix('toggles the paused flag', () => {
    expect(isPaused()).toBe(false)
    pauseAllChildren()
    expect(isPaused()).toBe(true)
    resumeAllChildren()
    expect(isPaused()).toBe(false)
  })

  itPosix('stops a running child and resumes it', async () => {
    const child = spawnManaged('sleep', ['30'])
    const pid = child.pid as number
    pauseAllChildren()
    await tick()
    expect(procState(pid)).toBe('T') // stopped
    resumeAllChildren()
    await tick()
    expect(procState(pid)).not.toBe('T') // running again
  })

  itPosix('starts a child stopped when spawned during a pause', async () => {
    pauseAllChildren()
    const child = spawnManaged('sleep', ['30'])
    await tick()
    expect(procState(child.pid as number)).toBe('T')
  })
})

describe('per-group pause/resume', () => {
  afterEach(() => {
    resumeAllChildren()
    killAllChildren()
  })

  itPosix('pauses and resumes only the targeted group', async () => {
    const a = spawnManaged('sleep', ['30'], {}, undefined, undefined, 1)
    const b = spawnManaged('sleep', ['30'], {}, undefined, undefined, 2)
    pauseGroup(1)
    await tick()
    expect(procState(a.pid as number)).toBe('T') // group 1 stopped
    expect(procState(b.pid as number)).not.toBe('T') // group 2 untouched
    resumeGroup(1)
    await tick()
    expect(procState(a.pid as number)).not.toBe('T')
  })

  itPosix('global resume leaves an individually-paused group stopped', async () => {
    const a = spawnManaged('sleep', ['30'], {}, undefined, undefined, 1)
    pauseGroup(1)
    pauseAllChildren()
    await tick()
    expect(procState(a.pid as number)).toBe('T')
    resumeAllChildren() // group 1 is still individually paused
    await tick()
    expect(procState(a.pid as number)).toBe('T')
    resumeGroup(1)
    await tick()
    expect(procState(a.pid as number)).not.toBe('T')
  })

  itPosix('killGroup reaps only its own group', async () => {
    const a = spawnManaged('sleep', ['30'], {}, undefined, undefined, 1)
    const b = spawnManaged('sleep', ['30'], {}, undefined, undefined, 2)
    const aClosed = closed(a)
    killGroup(1)
    await aClosed
    expect(a.signalCode).toBe('SIGKILL')
    expect(procState(b.pid as number)).not.toBe('') // group 2 alive
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
