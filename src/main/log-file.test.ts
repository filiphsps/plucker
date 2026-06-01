import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { shouldRotate, createFileTransport } from './log-file'
import type { LogEntry } from '../shared/types'

const entry = (message: string): LogEntry => ({ time: 0, level: 'info', scope: 'app', message })

describe('shouldRotate', () => {
  it('rotates only once strictly above the cap', () => {
    expect(shouldRotate(10, 100)).toBe(false)
    expect(shouldRotate(100, 100)).toBe(false)
    expect(shouldRotate(101, 100)).toBe(true)
  })
})

describe('createFileTransport', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plucker-log-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('appends formatted lines', () => {
    const f = join(dir, 'plucker.log')
    const t = createFileTransport(f, 1024)
    t(entry('hello'))
    t(entry('world'))
    const content = readFileSync(f, 'utf8')
    expect(content).toContain('[info] [app] hello')
    expect(content).toContain('[info] [app] world')
  })

  it('rotates to a .1 backup once the cap is exceeded', () => {
    const f = join(dir, 'plucker.log')
    const t = createFileTransport(f, 40) // tiny cap → rotates quickly
    for (let i = 0; i < 8; i++) t(entry(`line ${i}`))
    expect(existsSync(`${f}.1`)).toBe(true)
    expect(existsSync(f)).toBe(true)
    // The live file holds only the most recent lines (post-rotation).
    expect(readFileSync(f, 'utf8')).toContain('line 7')
  })
})
