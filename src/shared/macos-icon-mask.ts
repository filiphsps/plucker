/**
 * Geometry for masking the app icon into the macOS rounded-square ("squircle")
 * shape.
 *
 * macOS 13–25 do NOT mask app icons themselves — the artwork must ship
 * pre-shaped (rounded corners + the standard margin) or it renders as a hard
 * square next to every other app. macOS 26+ masks a full-bleed icon on its own
 * (via Icon Composer / the `.icon` asset — see scripts/build-icon.mjs), so the
 * pre-shaped variant produced here is only fed to the legacy `.icns`.
 *
 * Proportions follow Apple's macOS icon grid: on a 1024px canvas the icon body
 * is 824px — roughly a 100px margin per side (see {@link MAC_ICON_BODY_RATIO}).
 * The corners use a superellipse (continuous curvature), which matches the
 * system squircle far more closely than a plain rounded rectangle.
 */

/** Icon body side length as a fraction of the canvas (Apple grid: 824 / 1024). */
export const MAC_ICON_BODY_RATIO = 824 / 1024

/**
 * Superellipse exponent. ~5 approximates Apple's continuous-corner squircle;
 * higher tends toward a square, lower toward an ellipse.
 */
export const MAC_ICON_SUPERELLIPSE_EXPONENT = 5

/** Round to 3 decimals — plenty for a 1024px path, keeps the string compact. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * SVG path `d` for the macOS icon squircle, centered in a `size`×`size` box and
 * inset to {@link MAC_ICON_BODY_RATIO}. Suitable for CSS `clip-path: path('…')`.
 *
 * The curve is a superellipse sampled at `segments` points:
 *   x = cx + sign(cos t)·|cos t|^(2/n)·r,  y = cy + sign(sin t)·|sin t|^(2/n)·r
 *
 * @param size canvas edge length in px (e.g. 1024)
 * @param segments number of points sampled around the curve (higher = smoother)
 */
export function macIconSquirclePath(size: number, segments = 720): string {
  const radius = (size * MAC_ICON_BODY_RATIO) / 2
  const center = size / 2
  const power = 2 / MAC_ICON_SUPERELLIPSE_EXPONENT
  const points: string[] = []
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const x = center + Math.sign(cos) * Math.abs(cos) ** power * radius
    const y = center + Math.sign(sin) * Math.abs(sin) ** power * radius
    points.push(`${round(x)},${round(y)}`)
  }
  return `M${points[0]}L${points.slice(1).join('L')}Z`
}
