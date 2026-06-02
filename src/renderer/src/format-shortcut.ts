/** Which display convention to render an accelerator in. */
export type ShortcutPlatform = 'mac' | 'other'

// macOS renders modifiers as glyphs with no separators (⌘⇧J). Everywhere else uses
// words joined by '+' (Ctrl+Shift+J). `CmdOrCtrl` is the cross-platform modifier Electron
// resolves to ⌘ on mac and Ctrl elsewhere — we mirror that split here.
const MAC_GLYPHS: Record<string, string> = {
  cmdorctrl: '⌘',
  command: '⌘',
  cmd: '⌘',
  meta: '⌘',
  super: '⌘',
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧'
}

const OTHER_WORDS: Record<string, string> = {
  cmdorctrl: 'Ctrl',
  command: 'Win',
  cmd: 'Win',
  meta: 'Win',
  super: 'Win',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift'
}

/** Render one accelerator token (modifier or key) for the given platform. */
function renderToken(part: string, platform: ShortcutPlatform): string {
  const key = part.toLowerCase()
  const map = platform === 'mac' ? MAC_GLYPHS : OTHER_WORDS
  if (key in map) return map[key]
  // A plain key: single letters/digits read best uppercased (J, not j); named keys
  // (Enter, Space, Up) are passed through verbatim.
  return part.length === 1 ? part.toUpperCase() : part
}

/**
 * Turn an Electron accelerator string (e.g. `'CmdOrCtrl+J'`) into a human-readable
 * shortcut for display, matching each platform's convention: `⌘J` on macOS, `Ctrl+J`
 * elsewhere. Unknown tokens pass through so it degrades gracefully on novel keys.
 */
export function formatShortcut(accelerator: string, platform: ShortcutPlatform): string {
  const tokens = accelerator
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => renderToken(p, platform))
  return tokens.join(platform === 'mac' ? '' : '+')
}

/** Detect the display convention from the current renderer environment. */
export function currentShortcutPlatform(): ShortcutPlatform {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? 'mac' : 'other'
}
