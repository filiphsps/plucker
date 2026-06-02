import { describe, it, expect, vi } from 'vitest'
import { consoleLineMenuItems } from './console-line-menu'

const t = ((k: string) => k) as never

describe('consoleLineMenuItems', () => {
  it('copies the given line, copies all, and reveals the log', () => {
    const copy = vi.fn()
    vi.stubGlobal('window', { plucker: { copyText: copy, revealLog: vi.fn() } } as never)
    const items = consoleLineMenuItems({ t, line: 'one line', allText: 'all\nlines' })
    const labels = items.filter((i) => i.type !== 'separator').map((i) => i.label)
    expect(labels).toEqual(['context.copyLine', 'context.copyAll', 'context.revealLog'])
    items.find((i) => i.label === 'context.copyLine')?.onClick?.()
    expect(copy).toHaveBeenCalledWith('one line')
    vi.restoreAllMocks()
  })
})
