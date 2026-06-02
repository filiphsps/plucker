import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import './i18n'
import { ConsolePanel } from './console-panel'
import type { LogEntry } from '../../shared/types'

const entries: LogEntry[] = [{ time: 0, level: 'info', scope: 'app', message: 'hello' }]

describe('ConsolePanel', () => {
  it('docked variant shows the Undock control and no Pin control', () => {
    const html = renderToStaticMarkup(
      <ConsolePanel variant="docked" entries={entries} onClear={() => {}} onUndock={() => {}} />
    )
    expect(html).toContain('Undock')
    expect(html).not.toContain('Keep on top')
  })

  it('floating variant shows the Dock and Pin controls', () => {
    const html = renderToStaticMarkup(
      <ConsolePanel
        variant="floating"
        entries={entries}
        onClear={() => {}}
        onDock={() => {}}
        alwaysOnTop={false}
        onToggleAlwaysOnTop={() => {}}
      />
    )
    expect(html).toContain('Dock')
    expect(html).toContain('Keep on top')
  })
})
