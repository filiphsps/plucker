// src/shared/camelot.ts

/**
 * Map a musical key (sharp notation; major = "C", minor = "Cm") to its Camelot
 * wheel code (major → B side, minor → A side). Returns undefined for input that
 * is not one of the 24 recognized keys. Pure lookup table.
 */
const CAMELOT: Record<string, string> = {
  // Major keys (B side)
  C: '8B',
  'C#': '3B',
  D: '10B',
  'D#': '5B',
  E: '12B',
  F: '7B',
  'F#': '2B',
  G: '9B',
  'G#': '4B',
  A: '11B',
  'A#': '6B',
  B: '1B',
  // Minor keys (A side)
  Cm: '5A',
  'C#m': '12A',
  Dm: '7A',
  'D#m': '2A',
  Em: '9A',
  Fm: '4A',
  'F#m': '11A',
  Gm: '6A',
  'G#m': '1A',
  Am: '8A',
  'A#m': '3A',
  Bm: '10A'
}

export function keyToCamelot(key: string): string | undefined {
  return CAMELOT[key]
}
