'use strict'

// Thin JS wrapper around the node-swift addon. Loads lazily and degrades gracefully:
// if the binary is missing (non-macOS, not built yet, unsupported OS) `isAvailable()`
// returns false and callers fall back to the Electron `Menu`.

let native = null
let loadError = null

function load() {
  if (native || loadError) return native
  if (process.platform !== 'darwin') {
    loadError = new Error('native context menu is macOS-only')
    return null
  }
  try {
    // Produced by `node-swift rebuild` (see scripts/build.mjs).
    native = require('./.build/Module.node')
  } catch (err) {
    loadError = err
  }
  return native
}

/** Whether the native panel can be used in this process. */
function isAvailable() {
  return !!load()
}

/**
 * Show the native SwiftUI context menu.
 * @param {Array<object>} items  serialized menu descriptor (same shape as MenuDescriptor)
 * @param {{x:number,y:number,screenId?:number}} anchor  cursor anchor in screen coords
 * @returns {Promise<string|null>} chosen item id, or null on dismiss
 */
async function popup(items, anchor) {
  const mod = load()
  if (!mod) throw loadError ?? new Error('native context menu unavailable')
  const id = await mod.popup(JSON.stringify(items ?? []), JSON.stringify(anchor ?? { x: 0, y: 0 }))
  return id ?? null
}

/**
 * Render an SF Symbol to PNG bytes for use as an application-menu icon. Returns a
 * Buffer (@2x PNG) or null when the addon is unavailable or the symbol name is unknown.
 * @param {string} name  SF Symbol name (e.g. "gearshape")
 * @param {number} [pointSize=15]  glyph point size before the @2x scale
 * @returns {Buffer|null}
 */
function symbolPng(name, pointSize = 15) {
  const mod = load()
  if (!mod) return null
  try {
    const b64 = mod.symbolPNG(String(name), Number(pointSize))
    return b64 ? Buffer.from(b64, 'base64') : null
  } catch {
    return null
  }
}

module.exports = { isAvailable, popup, symbolPng }
