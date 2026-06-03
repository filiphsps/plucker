/**
 * Compare two dotted version strings numerically (major.minor.patch).
 * Missing trailing parts count as 0; any non-numeric suffix on a part is ignored.
 * Returns -1 if a < b, 1 if a > b, 0 if equal.
 *
 *   compareSemver('0.22.0', '0.21.5') →  1
 *   compareSemver('1.2',    '1.2.0')  →  0
 */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string): number[] => s.split('.').map((n) => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Extract a `major.minor.patch` version from an arbitrary string such as a GitHub
 * release tag (`plucker-v0.22.0` → `0.22.0`). Returns null when none is present.
 */
export function extractVersion(s: string): string | null {
  const m = s.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}
