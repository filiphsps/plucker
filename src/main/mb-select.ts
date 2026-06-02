export interface MbMatch {
  /** MusicBrainz relevance score (0–100) of the chosen recording. */
  score: number
  recordingId: string
  artist: string | null
  title: string
  album: string | null
  date: string | null
  year: string | null
  releaseId: string | null
  releaseGroupId: string | null
}

interface MbRelease {
  id?: string
  title?: string
  date?: string
  'release-group'?: { 'primary-type'?: string; id?: string }
}
interface MbRecording {
  id?: string
  score?: number
  title?: string
  'artist-credit'?: Array<{ artist?: { name?: string } }>
  releases?: MbRelease[]
}

function pickRelease(releases: MbRelease[] = []): MbRelease | null {
  if (releases.length === 0) return null
  const album = releases.find((r) => r['release-group']?.['primary-type'] === 'Album')
  return album ?? releases[0]
}

function year(date?: string): string | null {
  const m = (date ?? '').match(/^(\d{4})/)
  return m ? m[1] : null
}

export function selectBestMatch(json: unknown, minScore: number): MbMatch | null {
  const recs = (json as { recordings?: MbRecording[] })?.recordings ?? []
  const eligible = recs
    .filter((r) => (r.score ?? 0) >= minScore)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const rec = eligible[0]
  if (!rec || !rec.id) return null

  const rel = pickRelease(rec.releases)
  return {
    score: rec.score ?? 0,
    recordingId: rec.id,
    artist: rec['artist-credit']?.[0]?.artist?.name ?? null,
    title: rec.title ?? '',
    album: rel?.title ?? null,
    date: rel?.date ?? null,
    year: year(rel?.date),
    releaseId: rel?.id ?? null,
    releaseGroupId: rel?.['release-group']?.id ?? null
  }
}
