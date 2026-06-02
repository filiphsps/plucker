// src/shared/string-similarity.ts

/** Lowercase, strip diacritics, collapse non-alphanumerics to single spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Jaccard similarity (0..1) over the normalized token sets of two strings. */
export function tokenSetSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  return union === 0 ? 0 : inter / union
}
