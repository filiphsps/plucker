// src/main/mb-verify.ts
import { tokenSetSimilarity } from '@shared/string-similarity'

export interface VerifyTarget {
  durationSec?: number
  artist?: string
  title?: string
}

export interface VerifyCandidate {
  lengthMs?: number
  artist?: string | null
  title?: string
}

export interface VerifyOptions {
  durationToleranceSec: number
  nameSimilarityThreshold: number // 0..100
}

export interface VerifyResult {
  ok: boolean
  reason: string
}

/**
 * Accept a MusicBrainz recording as the same track as the downloaded audio only
 * when its duration is within tolerance AND artist+title fuzzily agree. When the
 * recording has no length we cannot duration-check, so require a stronger name
 * match instead of auto-rejecting.
 */
export function verifyMatch(
  cand: VerifyCandidate,
  target: VerifyTarget,
  opts: VerifyOptions
): VerifyResult {
  const threshold = opts.nameSimilarityThreshold / 100
  const artistSim = tokenSetSimilarity(cand.artist ?? '', target.artist ?? '')
  const titleSim = tokenSetSimilarity(cand.title ?? '', target.title ?? '')

  const hasLength = typeof cand.lengthMs === 'number' && typeof target.durationSec === 'number'
  if (hasLength) {
    const gap = Math.abs((cand.lengthMs as number) / 1000 - (target.durationSec as number))
    if (gap > opts.durationToleranceSec) {
      return { ok: false, reason: `duration off by ${Math.round(gap)}s` }
    }
    if (artistSim < threshold)
      return { ok: false, reason: `artist mismatch (${artistSim.toFixed(2)})` }
    if (titleSim < threshold)
      return { ok: false, reason: `title mismatch (${titleSim.toFixed(2)})` }
    return { ok: true, reason: 'duration + names agree' }
  }

  // No length: demand near-exact names (raise the bar to max(0.9, threshold)).
  const strong = Math.max(0.9, threshold)
  if (artistSim >= strong && titleSim >= strong) {
    return { ok: true, reason: 'no length; strong name agreement' }
  }
  return { ok: false, reason: 'no length; insufficient name agreement' }
}
