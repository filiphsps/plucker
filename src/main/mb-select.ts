import { verifyMatch, type VerifyTarget, type VerifyOptions } from './mb-verify'

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
  /** Recording length in milliseconds, when MusicBrainz reports it. */
  lengthMs: number | null
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
  length?: number
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
    releaseGroupId: rel?.['release-group']?.id ?? null,
    lengthMs: rec.length ?? null
  }
}

/**
 * Pick the best MusicBrainz recording that both clears `minScore` AND passes the
 * duration/name verification gate against the local target. Returns null when no
 * candidate verifies (the caller then keeps local tags).
 */
export function selectVerifiedMatch(
  json: unknown,
  minScore: number,
  target: VerifyTarget,
  opts: VerifyOptions
): MbMatch | null {
  const recs = (json as { recordings?: MbRecording[] })?.recordings ?? []
  const ranked = recs
    .filter((r) => (r.score ?? 0) >= minScore && r.id)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  for (const rec of ranked) {
    const verdict = verifyMatch(
      {
        lengthMs: rec.length,
        artist: rec['artist-credit']?.[0]?.artist?.name ?? null,
        title: rec.title
      },
      target,
      opts
    )
    if (!verdict.ok) continue
    const rel = pickRelease(rec.releases)
    return {
      score: rec.score ?? 0,
      recordingId: rec.id as string,
      artist: rec['artist-credit']?.[0]?.artist?.name ?? null,
      title: rec.title ?? '',
      album: rel?.title ?? null,
      date: rel?.date ?? null,
      year: year(rel?.date),
      releaseId: rel?.id ?? null,
      releaseGroupId: rel?.['release-group']?.id ?? null,
      lengthMs: rec.length ?? null
    }
  }
  return null
}
