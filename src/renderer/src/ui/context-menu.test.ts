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

  it('carries the symbol through to the descriptor', () => {
    const { descriptor } = serializeMenu([{ label: 'Reveal', symbol: 'folder', onClick: vi.fn() }])
    expect(descriptor[0].symbol).toBe('folder')
  })

  it('recurses submenus with hierarchical ids and wires nested handlers', () => {
    const onNested = vi.fn()
    const { descriptor, handlers } = serializeMenu([
      { label: 'YouTube', submenu: [{ label: 'Copy URL', onClick: onNested }] }
    ])
    const sub = descriptor[0].submenu
    expect(sub?.[0].label).toBe('Copy URL')
    expect(sub?.[0].id).toBe('item-0-item-0')
    handlers.get('item-0-item-0')?.()
    expect(onNested).toHaveBeenCalledOnce()
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

  it('forwards an explicit anchor to popupMenu', async () => {
    const popupMenu = vi.fn().mockResolvedValue(null)
    vi.stubGlobal('window', { plucker: { popupMenu } } as never)
    await showContextMenu([{ label: 'Reveal', onClick: vi.fn() }] as MenuItem[], { x: 12, y: 34 })
    expect(popupMenu).toHaveBeenCalledWith(expect.anything(), { x: 12, y: 34 })
  })

  it('falls back to a default anchor when none is given', async () => {
    const popupMenu = vi.fn().mockResolvedValue(null)
    vi.stubGlobal('window', { plucker: { popupMenu } } as never)
    await showContextMenu([{ label: 'Reveal', onClick: vi.fn() }] as MenuItem[])
    const [, anchor] = popupMenu.mock.calls[0]
    expect(anchor).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
  })
})
