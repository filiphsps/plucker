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
  const res = NodeID3.update(id3, file)
  if (res !== true) throw new Error(`Failed to write tags: ${String(res)}`)
}

export function readTrackTags(file: string): TrackTags {
  const t = NodeID3.read(file)
  return {
    artist: t.artist,
    title: t.title,
    album: t.album,
    date: t.date,
    year: t.year,
    trackNumber: t.trackNumber,
    genre: t.genre
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
