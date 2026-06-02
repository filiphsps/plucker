import NodeID3 from 'node-id3'
import type { TrackTags } from '../shared/types'

/** Update (not overwrite) the given tags on an mp3 file. */
export function writeTrackTags(file: string, tags: TrackTags): void {
  const id3: NodeID3.Tags = {}
  if (tags.artist) id3.artist = tags.artist
  if (tags.title) id3.title = tags.title
  if (tags.album) id3.album = tags.album
  if (tags.date) id3.date = tags.date
  if (tags.year) id3.year = tags.year
  if (tags.trackNumber) id3.trackNumber = tags.trackNumber
  if (tags.genre) id3.genre = tags.genre
  if (tags.key) id3.initialKey = tags.key
  if (tags.bpm) id3.bpm = tags.bpm
  if (tags.camelot) id3.userDefinedText = [{ description: 'CAMELOT', value: tags.camelot }]
  const res = NodeID3.update(id3, file)
  if (res !== true) throw new Error(`Failed to write tags: ${String(res)}`)
}

export function readTrackTags(file: string): TrackTags {
  const t = NodeID3.read(file)
  const camelot = (t.userDefinedText ?? []).find((u) => u.description === 'CAMELOT')?.value
  return {
    artist: t.artist,
    title: t.title,
    album: t.album,
    date: t.date,
    year: t.year,
    trackNumber: t.trackNumber,
    genre: t.genre,
    key: t.initialKey,
    bpm: t.bpm,
    camelot
  }
}

export function embedCover(file: string, image: Buffer, mime = 'image/jpeg'): void {
  const res = NodeID3.update(
    { image: { mime, type: { id: 3 }, description: 'Front Cover', imageBuffer: image } },
    file
  )
  if (res !== true) throw new Error(`Failed to embed cover: ${String(res)}`)
}

/** Read the embedded front cover as raw bytes + mime, or null if absent/unreadable. */
export function readCoverImage(file: string): { image: Buffer; mime: string } | null {
  try {
    const img = NodeID3.read(file).image
    if (img && typeof img !== 'string' && img.imageBuffer) {
      return { image: Buffer.from(img.imageBuffer), mime: img.mime || 'image/jpeg' }
    }
  } catch {
    // unreadable / no tags
  }
  return null
}

/** Key/tempo analysis results written to dedicated ID3 frames. */
export interface AnalysisTags {
  /** Musical key, e.g. "Am" — written to TKEY (initialKey). */
  key?: string
  /** Camelot wheel code, e.g. "8A" — written to a TXXX:CAMELOT frame. */
  camelot?: string
  /** Tempo in BPM — written to TBPM. */
  bpm?: number
}

/**
 * Write key/BPM analysis frames to an mp3, leaving all other tags untouched
 * (partial NodeID3.update). Only the provided fields are written; an empty input
 * is a no-op.
 */
export function writeAnalysisTags(file: string, analysis: AnalysisTags): void {
  const id3: NodeID3.Tags = {}
  if (analysis.key) id3.initialKey = analysis.key
  if (typeof analysis.bpm === 'number') id3.bpm = String(analysis.bpm)
  if (analysis.camelot) {
    id3.userDefinedText = [{ description: 'CAMELOT', value: analysis.camelot }]
  }
  if (Object.keys(id3).length === 0) return
  const res = NodeID3.update(id3, file)
  if (res !== true) throw new Error(`Failed to write analysis tags: ${String(res)}`)
}

/** Read the embedded front cover as a data URL, or null if absent/unreadable. */
export function readCoverDataUrl(file: string): string | null {
  try {
    const img = NodeID3.read(file).image
    if (img && typeof img !== 'string' && img.imageBuffer) {
      const mime = img.mime || 'image/jpeg'
      return `data:${mime};base64,${Buffer.from(img.imageBuffer).toString('base64')}`
    }
  } catch {
    // unreadable / no tags
  }
  return null
}
