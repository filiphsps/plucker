import { describe, it, expect, vi } from 'vitest'

// `./context-menu` imports Electron main-process APIs (BrowserWindow, Menu, …) at load
// time. Under Vitest (plain Node, no Electron binary) requiring the real `electron` throws,
// so we stub it — `buildMenuTemplate` is pure. Same pattern as accent.test.ts.
vi.mock('electron', () => ({ BrowserWindow: {}, clipboard: {}, ipcMain: {}, Menu: {} }))

import { buildMenuTemplate } from './context-menu'
import type { MenuDescriptor } from '@shared/context-menu'

describe('buildMenuTemplate', () => {
  it('maps a clickable item to a click handler that calls onClick with its id', () => {
    const onClick = vi.fn()
    const descriptor: MenuDescriptor = [{ id: 'a', label: 'Reveal', enabled: true }]
    const template = buildMenuTemplate(descriptor, onClick)
    expect(template[0].label).toBe('Reveal')
    expect(template[0].enabled).toBe(true)
    template[0].click?.({} as never, undefined, {} as never)
    expect(onClick).toHaveBeenCalledWith('a')
  })

  it('passes separators and roles through without a click handler', () => {
    const onClick = vi.fn()
    const descriptor: MenuDescriptor = [{ type: 'separator' }, { role: 'copy', label: 'Copy' }]
    const template = buildMenuTemplate(descriptor, onClick)
    expect(template[0]).toEqual({ type: 'separator' })
    expect(template[1].role).toBe('copy')
    expect(template[1].click).toBeUndefined()
  })

  it('recurses submenus and dispatches nested clicks by id', () => {
    const onClick = vi.fn()
    const descriptor: MenuDescriptor = [
      { label: 'YouTube', submenu: [{ id: 'sub', label: 'Copy URL' }] }
    ]
    const template = buildMenuTemplate(descriptor, onClick)
    expect(template[0].label).toBe('YouTube')
    expect(template[0].click).toBeUndefined()
    const sub = template[0].submenu as Array<{ label?: string; click?: () => void }>
    expect(sub[0].label).toBe('Copy URL')
    sub[0].click?.()
    expect(onClick).toHaveBeenCalledWith('sub')
  })
})
