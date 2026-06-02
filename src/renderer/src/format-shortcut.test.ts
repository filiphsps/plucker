import { describe, it, expect } from 'vitest'
import { formatShortcut } from './format-shortcut'

describe('formatShortcut', () => {
  it('renders CmdOrCtrl as ⌘ glyph with no separator on mac', () => {
    expect(formatShortcut('CmdOrCtrl+J', 'mac')).toBe('⌘J')
  })

  it('renders CmdOrCtrl as the word Ctrl joined by + on other platforms', () => {
    expect(formatShortcut('CmdOrCtrl+J', 'other')).toBe('Ctrl+J')
  })

  it('stacks multiple modifiers in order', () => {
    expect(formatShortcut('CmdOrCtrl+Shift+K', 'mac')).toBe('⌘⇧K')
    expect(formatShortcut('CmdOrCtrl+Shift+K', 'other')).toBe('Ctrl+Shift+K')
  })

  it('maps each modifier to its glyph on mac', () => {
    expect(formatShortcut('Ctrl+Alt+Shift+P', 'mac')).toBe('⌃⌥⇧P')
  })

  it('uppercases single-character keys', () => {
    expect(formatShortcut('CmdOrCtrl+,', 'other')).toBe('Ctrl+,')
    expect(formatShortcut('cmdorctrl+j', 'mac')).toBe('⌘J')
  })

  it('passes named keys through verbatim', () => {
    expect(formatShortcut('CmdOrCtrl+Enter', 'mac')).toBe('⌘Enter')
    expect(formatShortcut('Shift+Up', 'other')).toBe('Shift+Up')
  })

  it('tolerates stray whitespace and empty segments', () => {
    expect(formatShortcut(' CmdOrCtrl + J ', 'mac')).toBe('⌘J')
  })
})
