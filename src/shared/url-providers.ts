/**
 * Registry of URL providers Plucker can download from. Today this is YouTube only,
 * but the shape is deliberately extensible: adding a new supplier means appending a
 * `UrlProvider` entry here, and every consumer (input validation, history filtering)
 * picks it up automatically via {@link isSupportedUrl} / {@link matchProvider}.
 */
export interface UrlProvider {
  /** Stable identifier, e.g. `youtube`. */
  id: string
  /** Human-facing name. */
  label: string
  /** Returns true when this provider recognizes the given parsed URL. */
  matches: (url: URL) => boolean
}

/** True when `host` equals `domain` or is a subdomain of it (guards against `youtube.com.evil`). */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

export const URL_PROVIDERS: UrlProvider[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    matches: (url) => {
      const host = url.hostname.toLowerCase()
      return (
        hostMatches(host, 'youtube.com') ||
        hostMatches(host, 'youtu.be') ||
        hostMatches(host, 'youtube-nocookie.com')
      )
    }
  }
]

/** Parse a (possibly whitespace-padded) string into an http(s) URL, or null. */
function parseHttpUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
}

/** The provider that recognizes `input`, or null if none / the input is not a valid http(s) URL. */
export function matchProvider(input: string): UrlProvider | null {
  const url = parseHttpUrl(input)
  if (!url) return null
  return URL_PROVIDERS.find((p) => p.matches(url)) ?? null
}

/** True when `input` is a well-formed http(s) URL handled by some registered provider. */
export function isSupportedUrl(input: string): boolean {
  return matchProvider(input) !== null
}
