import { describe, it, expect } from 'vitest'
import { visibleItems, type StatusBarItem } from './status-bar-utils'

const item = (id: string): StatusBarItem => ({ id, node: id })

describe('visibleItems', () => {
  it('drops null/false/undefined entries', () => {
    expect(visibleItems([null, false, undefined])).toEqual([])
  })

  it('drops items with no node', () => {
    expect(visibleItems([{ id: 'a', node: null }, item('b')])).toEqual([item('b')])
  })

  it('keeps items with content in order', () => {
    expect(visibleItems([item('a'), null, item('b')])).toEqual([item('a'), item('b')])
  })
})
