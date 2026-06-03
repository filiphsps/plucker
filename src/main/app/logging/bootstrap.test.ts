import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bootstrapFileLogging } from './bootstrap'
import { log, __resetLog } from './log'

describe('bootstrapFileLogging', () => {
  let dir: string
  let dispose: (() => void) | null = null

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'plucker-bootstrap-'))
  })
  afterEach(() => {
    dispose?.()
    dispose = null
    __resetLog()
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes a startup banner to the log file immediately', () => {
    const f = join(dir, 'plucker.log')
    dispose = bootstrapFileLogging({ version: '9.9.9', logFile: f })
    const content = readFileSync(f, 'utf8')
    expect(content).toContain('Plucker 9.9.9 starting')
    expect(content).toContain(`${process.platform}/${process.arch}`)
  })

  it('persists every subsequent log line, unconditionally', () => {
    const f = join(dir, 'plucker.log')
    dispose = bootstrapFileLogging({ version: '1.0.0', logFile: f })
    log.error('app', 'native module failed to load: incompatible architecture')
    const content = readFileSync(f, 'utf8')
    expect(content).toContain('[error] [app] native module failed to load: incompatible architecture')
  })

  it('creates the parent directory if missing', () => {
    const f = join(dir, 'nested', 'deeper', 'plucker.log')
    dispose = bootstrapFileLogging({ version: '1.0.0', logFile: f })
    expect(existsSync(f)).toBe(true)
  })

  it('never throws even if the transport cannot be created, and still returns a disposer', () => {
    // dirname collides with an existing file → mkdirSync inside the transport throws,
    // which the bootstrap must swallow rather than abort startup.
    const clash = join(dir, 'iam-a-file')
    rmSync(clash, { force: true })
    writeFileSync(clash, 'x')
    const f = join(clash, 'plucker.log') // parent path is a file, not a dir
    expect(() => {
      dispose = bootstrapFileLogging({ version: '1.0.0', logFile: f })
    }).not.toThrow()
    expect(typeof dispose).toBe('function')
  })

  it('detaches the file transport when disposed', () => {
    const f = join(dir, 'plucker.log')
    const d = bootstrapFileLogging({ version: '1.0.0', logFile: f })
    d() // dispose immediately
    dispose = null
    const before = readFileSync(f, 'utf8')
    log.info('app', 'this-line-must-not-be-written')
    expect(readFileSync(f, 'utf8')).toBe(before)
  })
})
