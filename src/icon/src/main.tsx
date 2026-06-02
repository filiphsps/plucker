import '../../renderer/src/index.css'

import { createRoot } from 'react-dom/client'
import '@fontsource/geist-mono/600.css'
import '@fontsource/geist-mono/700.css'
import themes from './themes.json'
import { Icon, type IconTheme } from './icon'
import { macIconSquirclePath } from '../../shared/macos-icon-mask'

const params = new URLSearchParams(window.location.search)
const id = params.get('theme') ?? 'dark'
const theme = (themes as IconTheme[]).find((t) => t.id === id) ?? (themes as IconTheme[])[0]

// `?shape=mask` clips the icon to the macOS squircle (transparent corners) for the
// pre-shaped legacy `.icns` consumed on macOS 13–25. The default render is
// full-bleed — macOS 26 masks that itself via the Icon Composer asset.
const masked = params.get('shape') === 'mask'
if (masked) {
  // The renderer's index.css paints an opaque body; clear it so the squircle's
  // corners screenshot as transparent (with Playwright's omitBackground).
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}
const root = masked ? (
  <div style={{ width: 1024, height: 1024, clipPath: `path('${macIconSquirclePath(1024)}')` }}>
    <Icon theme={theme} />
  </div>
) : (
  <Icon theme={theme} />
)

createRoot(document.getElementById('root')!).render(root)

// Tell the screenshot driver we're done: render committed and the mono font is
// actually loaded (otherwise the capture races the font swap).
document.fonts.ready.then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ;(window as unknown as { __ICON_READY__?: boolean }).__ICON_READY__ = true
    })
  })
})
