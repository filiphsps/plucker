import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import NodeID3 from 'node-id3'
import { writeTrackTags, readTrackTags, embedCover } from './tagger'

let dir: string
let mp3: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'plucker-tag-'))
  mp3 = join(dir, 'a.mp3')
  // A minimal file with no audio frames is fine for ID3 read/write.
  writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x00]))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('tagger', () => {
  it('writes and reads back core tags', () => {
    writeTrackTags(mp3, {
      artist: 'Daft Punk', title: 'Da Funk', album: 'Homework',
      date: '1997-01-20', year: '1997', trackNumber: '3', genre: 'House',
    })
    const t = readTrackTags(mp3)
    expect(t.artist).toBe('Daft Punk')
    expect(t.title).toBe('Da Funk')
    expect(t.album).toBe('Homework')
    expect(t.trackNumber).toBe('3')
    expect(t.genre).toBe('House')
  })

  it('embeds cover art from a buffer', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex') // PNG signature bytes
    embedCover(mp3, png, 'image/png')
    const raw = NodeID3.read(mp3)
    expect(raw.image).toBeTruthy()
  })
})
