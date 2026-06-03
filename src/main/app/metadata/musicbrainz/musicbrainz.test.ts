import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { MusicBrainzClient } from './musicbrainz'

function mockFetch(payload: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0)
  })) as unknown as typeof fetch
}

describe('MusicBrainzClient', () => {
  it('searches recordings and sends a User-Agent', async () => {
    const fetchMock = mockFetch({ recordings: [] })
    const c = new MusicBrainzClient('app@example.com', { fetchImpl: fetchMock, throttleMs: 0 })
    await c.searchRecording('Daft Punk', 'Da Funk')
    const [url, init] = (fetchMock as unknown as Mock).mock.calls[0]
    expect(String(url)).toContain('/ws/2/recording')
    expect(String(url)).toContain('fmt=json')
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('app@example.com')
  })

  it('caches identical requests (one network call)', async () => {
    const fetchMock = mockFetch({ recordings: [] })
    const c = new MusicBrainzClient('app@example.com', { fetchImpl: fetchMock, throttleMs: 0 })
    await c.searchRecording('A', 'B')
    await c.searchRecording('A', 'B')
    expect((fetchMock as unknown as Mock).mock.calls.length).toBe(1)
  })
})
