/**
 * Minimal parser for electron-builder's `latest-mac.yml`, extracting just the
 * per-file base64 SHA-512 map (and the version). Avoids pulling in a YAML
 * dependency for a small, fixed-shape document.
 *
 * The document lists each artifact under `files:` as a `url:`/`sha512:` pair, then
 * repeats a top-level `path:`/`sha512:` for the primary artifact. We key sha512s by
 * the preceding `url:`, so the top-level `sha512:` (which has no pending `url:`) is
 * ignored.
 */
export function parseLatestMacYml(text: string): {
  version: string | null
  sha512ByName: Record<string, string>
} {
  const unquote = (s: string): string => s.replace(/^['"]|['"]$/g, '').trim()
  const sha512ByName: Record<string, string> = {}
  let version: string | null = null
  let pendingName: string | null = null
  for (const line of text.split(/\r?\n/)) {
    const v = line.match(/^version:\s*(.+?)\s*$/)
    if (v && version === null) {
      version = unquote(v[1])
      continue
    }
    const u = line.match(/^\s*-?\s*url:\s*(.+?)\s*$/)
    if (u) {
      pendingName = unquote(u[1])
      continue
    }
    const s = line.match(/^\s*sha512:\s*(.+?)\s*$/)
    if (s && pendingName) {
      sha512ByName[pendingName] = unquote(s[1])
      pendingName = null
    }
  }
  return { version, sha512ByName }
}
