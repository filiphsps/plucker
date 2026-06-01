const BASE = 'https://musicbrainz.org/ws/2'

interface Opts {
  fetchImpl?: typeof fetch
  throttleMs?: number
}

export class MusicBrainzClient {
  private ua: string
  private fetchImpl: typeof fetch
  private throttleMs: number
  private last = 0
  private cache = new Map<string, unknown>()

  constructor(email: string, opts: Opts = {}) {
    this.ua = `Plucker/1.0 ( ${email} )`
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.throttleMs = opts.throttleMs ?? 1000
  }

  private async throttle(): Promise<void> {
    const wait = this.throttleMs - (Date.now() - this.last)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    this.last = Date.now()
  }

  private async getJson(url: string): Promise<unknown> {
    if (this.cache.has(url)) return this.cache.get(url)
    await this.throttle()
    const res = await this.fetchImpl(url, { headers: { 'User-Agent': this.ua } })
    if (!res.ok) throw new Error(`MusicBrainz ${res.status}`)
    const json = await res.json()
    this.cache.set(url, json)
    return json
  }

  async searchRecording(artist: string | null, title: string): Promise<unknown> {
    const parts = [artist ? `artist:"${artist}"` : '', `recording:"${title}"`]
      .filter(Boolean)
      .join(' AND ')
    const q = encodeURIComponent(parts)
    return this.getJson(`${BASE}/recording?query=${q}&fmt=json&limit=5`)
  }

  async getRelease(releaseId: string): Promise<unknown> {
    return this.getJson(`${BASE}/release/${releaseId}?inc=recordings&fmt=json`)
  }

  async getReleaseGroupGenre(rgId: string): Promise<string | null> {
    const json = (await this.getJson(`${BASE}/release-group/${rgId}?inc=genres&fmt=json`)) as {
      genres?: Array<{ name: string; count: number }>
    }
    const top = (json.genres ?? []).sort((a, b) => b.count - a.count)[0]
    return top?.name ?? null
  }

  /** Find the track number for a recording within a release. */
  async getTrackNumber(releaseId: string, recordingId: string): Promise<string | null> {
    const json = (await this.getRelease(releaseId)) as {
      media?: Array<{ tracks?: Array<{ number?: string; recording?: { id?: string } }> }>
    }
    for (const m of json.media ?? []) {
      for (const t of m.tracks ?? []) {
        if (t.recording?.id === recordingId) return t.number ?? null
      }
    }
    return null
  }
}
