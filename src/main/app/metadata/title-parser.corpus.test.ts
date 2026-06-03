// src/main/title-parser.corpus.test.ts
import { describe, it, expect } from 'vitest'
import { parseTitle } from './title-parser'
import type { SourceKind } from './channel-classifier'

interface Case {
  title: string
  kind?: SourceKind
  channel?: string
  artist: string | null
  expectTitle: string
  featured?: string[]
  version?: string
}

const CASES: Case[] = [
  { title: 'Daft Punk - Around the World', artist: 'Daft Punk', expectTitle: 'Around the World' },
  {
    title: 'Daft Punk – Around the World (Official Video)',
    artist: 'Daft Punk',
    expectTitle: 'Around the World'
  },
  { title: 'Adele - Hello [Official Music Video]', artist: 'Adele', expectTitle: 'Hello' },
  {
    title: '01. Tame Impala - The Less I Know The Better',
    artist: 'Tame Impala',
    expectTitle: 'The Less I Know The Better'
  },
  { title: 'Eminem - Stan ft. Dido', artist: 'Eminem', expectTitle: 'Stan', featured: ['Dido'] },
  {
    title: 'Calvin Harris - Feel So Close (feat. Example & Friend)',
    artist: 'Calvin Harris',
    expectTitle: 'Feel So Close',
    featured: ['Example', 'Friend']
  },
  {
    title: 'Avicii - Levels (Skrillex Remix)',
    artist: 'Avicii',
    expectTitle: 'Levels',
    version: 'Skrillex Remix'
  },
  {
    title: 'Nirvana - Come As You Are (Live)',
    artist: 'Nirvana',
    expectTitle: 'Come As You Are',
    version: 'Live'
  },
  { title: 'The Weeknd | Blinding Lights', artist: 'The Weeknd', expectTitle: 'Blinding Lights' },
  {
    title: 'Blinding Lights',
    kind: 'official-artist',
    channel: 'The Weeknd',
    artist: 'The Weeknd',
    expectTitle: 'Blinding Lights'
  },
  { title: 'Just A Vibe (Lyrics)', kind: 'generic', artist: null, expectTitle: 'Just A Vibe' },
  { title: 'YOASOBI - アイドル', artist: 'YOASOBI', expectTitle: 'アイドル' }
]

describe('title parser corpus', () => {
  for (const c of CASES) {
    it(`parses: ${c.title}`, () => {
      const r = parseTitle(c.title, { kind: c.kind, channelName: c.channel })
      expect(r.artist).toBe(c.artist)
      expect(r.title).toBe(c.expectTitle)
      if (c.featured) expect(r.featured).toEqual(c.featured)
      if (c.version) expect(r.version).toBe(c.version)
    })
  }
})
