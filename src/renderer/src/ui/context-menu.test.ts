import { describe, it, expect, vi, afterEach } from 'vitest'
import { serializeMenu, showContextMenu, type MenuItem } from './context-menu'

describe('serializeMenu', () => {
  it('assigns ids to clickable items and strips the onClick closure', () => {
    const onClick = vi.fn()
    const { descriptor, handlers } = serializeMenu([{ label: 'Reveal', onClick }])
    expect(descriptor[0].label).toBe('Reveal')
    expect(descriptor[0].id).toBeTruthy()
    expect('onClick' in descriptor[0]).toBe(false)
    handlers.get(descriptor[0].id!)?.()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('preserves separators and role items without ids', () => {
    const { descriptor, handlers } = serializeMenu([
      { type: 'separator' },
      { label: 'Copy', role: 'copy' }
    ])
    expect(descriptor[0]).toEqual({ type: 'separator' })
    expect(descriptor[1].role).toBe('copy')
    expect(descriptor[1].id).toBeUndefined()
    expect(handlers.size).toBe(0)
  })

  it('keeps the enabled flag', () => {
    const { descriptor } = serializeMenu([{ label: 'Delete', enabled: false, onClick: vi.fn() }])
    expect(descriptor[0].enabled).toBe(false)
  })
})

describe('showContextMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches the handler for the id main returns', async () => {
    const onClick = vi.fn()
    const popupMenu = vi.fn().mockResolvedValue('item-0')
    vi.stubGlobal('window', { plucker: { popupMenu } } as never)
    await showContextMenu([{ label: 'Reveal', onClick }] as MenuItem[])
    expect(popupMenu).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('runs no handler when main returns null (dismissed)', async () => {
    const onClick = vi.fn()
    vi.stubGlobal('window', { plucker: { popupMenu: vi.fn().mockResolvedValue(null) } } as never)
    await showContextMenu([{ label: 'Reveal', onClick }] as MenuItem[])
    expect(onClick).not.toHaveBeenCalled()
  })
})
