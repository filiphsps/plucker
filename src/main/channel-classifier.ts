// src/main/channel-classifier.ts
import type { SourceMetadata } from './source-metadata'
import { tokenSetSimilarity } from '../shared/string-similarity'

export type SourceKind = 'topic' | 'vevo' | 'label' | 'official-artist' | 'generic'

const LABEL_SUFFIX = /\b(records|recordings|music group|label|entertainment)\b/i

/** Bucket a video by its channel/uploader so the parser can interpret the title. */
export function classifySource(src: SourceMetadata): SourceKind {
  const channel = src.channel ?? ''
  const uploader = src.uploader ?? ''
  const both = `${channel} ${uploader}`

  if (/ - topic$/i.test(uploader) || / - topic$/i.test(channel)) return 'topic'
  if (/provided to youtube by/i.test(src.description ?? '')) return 'topic'
  if (/vevo$/i.test(channel) || /vevo$/i.test(uploader)) return 'vevo'
  if (LABEL_SUFFIX.test(both)) return 'label'
  if (src.artist) {
    const name = channel || uploader
    if (name && tokenSetSimilarity(name, src.artist) >= 0.6) return 'official-artist'
  }
  return 'generic'
}
