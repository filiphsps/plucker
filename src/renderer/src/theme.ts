/** Convert `#rrggbb` to `rgba(r, g, b, alpha)`. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Write the accent hex (and its dim variant) onto :root so all *-accent utilities track it. */
export function applyAccent(hex: string): void {
  const root = document.documentElement
  root.style.setProperty('--color-accent', hex)
  root.style.setProperty('--color-accent-dim', withAlpha(hex, 0.16))
}

/** Fetch the OS accent once and subscribe to live changes. Returns an unsubscribe fn. */
export function initAccent(): () => void {
  window.plucker.getAccentColor().then(applyAccent)
  return window.plucker.onAccentChanged(applyAccent)
}
