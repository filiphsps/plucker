import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import NodeID3 from 'node-id3'
import { writeTrackTags, readTrackTags, embedCover, writeAnalysisTags } from './tagger'

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
      artist: 'Daft Punk',
      title: 'Da Funk',
      album: 'Homework',
      date: '1997-01-20',
      year: '1997',
      trackNumber: '3',
      genre: 'House'
    })
    const t = readTrackTags(mp3)
    expect(t.artist).toBe('Daft Punk')
    expect(t.title).toBe('Da Funk')
    expect(t.album).toBe('Homework')
    expect(t.trackNumber).toBe('3')
    expect(t.genre).toBe('House')
  })

  it('round-trips key, Camelot, and BPM tags', () => {
    writeTrackTags(mp3, { title: 'X', key: 'Am', camelot: '8A', bpm: '124' })
    const t = readTrackTags(mp3)
    expect(t.key).toBe('Am')
    expect(t.camelot).toBe('8A')
    expect(t.bpm).toBe('124')
  })

  it('embeds cover art from a buffer', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex') // PNG signature bytes
    embedCover(mp3, png, 'image/png')
    const raw = NodeID3.read(mp3)
    expect(raw.image).toBeTruthy()
  })
})

describe('writeAnalysisTags', () => {
  it('writes initial key, BPM, and a CAMELOT TXXX frame', () => {
    writeAnalysisTags(mp3, { key: 'Am', camelot: '8A', bpm: 124 })
    const raw = NodeID3.read(mp3)
    expect(raw.initialKey).toBe('Am')
    expect(raw.bpm).toBe('124')
    const txxx = (raw.userDefinedText ?? []).find((t) => t.description === 'CAMELOT')
    expect(txxx?.value).toBe('8A')
  })

  it('writes only the provided fields and is a no-op when given nothing', () => {
    expect(() => writeAnalysisTags(mp3, {})).not.toThrow()
    writeAnalysisTags(mp3, { bpm: 90 })
    expect(NodeID3.read(mp3).bpm).toBe('90')
    expect(NodeID3.read(mp3).initialKey).toBeFalsy()
  })
})
