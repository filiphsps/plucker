import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VersionComposer } from './version-composer'
import type { TransformInstance, TransformManifest } from '../../../shared/transforms'

const catalog: TransformManifest[] = [
  {
    type: 'trim-silence',
    apiVersion: 1,
    labelKey: 'transforms.trim.label',
    descriptionKey: 'transforms.trim.desc',
    allowMultiple: true,
    configSchema: [],
    defaultConfig: {}
  }
]

const t = (k: string): string => k

function render(instances: TransformInstance[], over: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <VersionComposer
      parentLabel="Original"
      parentRecipeText="raw · root"
      outcomeText="on branch: main"
      forking={false}
      catalog={catalog}
      instances={instances}
      onChange={() => {}}
      onCreate={() => {}}
      onCancel={() => {}}
      t={t}
      {...over}
    />
  )
}

const disabledCount = (html: string): number => (html.match(/disabled=""/g) ?? []).length

describe('VersionComposer', () => {
  it('shows the empty hint and disables Create with no steps', () => {
    const html = render([])
    expect(html).toContain('library.composerEmpty')
    expect(html).toContain('Original') // the source slab echoes the selected version
    expect(html).toContain('on branch: main') // the output preview
    expect(disabledCount(html)).toBe(1) // only the Create button is disabled
  })

  it('enables Create once at least one step is enabled', () => {
    const html = render([{ instanceId: 'i1', type: 'trim-silence', enabled: true, config: {} }])
    expect(html).not.toContain('library.composerEmpty')
    expect(disabledCount(html)).toBe(0)
  })

  it('keeps Create disabled when the only step is turned off', () => {
    const html = render([{ instanceId: 'i1', type: 'trim-silence', enabled: false, config: {} }])
    expect(disabledCount(html)).toBe(1)
  })

  it('offers the settings-seed shortcut only when wired', () => {
    expect(render([])).not.toContain('library.loadSettingsChain')
    expect(render([], { onSeedFromSettings: () => {} })).toContain('library.loadSettingsChain')
  })
})
