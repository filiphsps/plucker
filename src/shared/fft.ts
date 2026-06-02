// src/shared/fft.ts

/**
 * In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` are the real and
 * imaginary parts; both must share the same power-of-two length. On return they
 * hold the transform. Pure and dependency-free so it can be unit-tested with
 * synthetic signals and reused by both chroma and tempo analysis.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length
  if (n !== im.length) throw new Error('fft: re/im length mismatch')
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`fft: length ${n} is not a power of two`)

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }

  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = i + k + len / 2
        const tRe = re[b] * curRe - im[b] * curIm
        const tIm = re[b] * curIm + im[b] * curRe
        re[b] = re[a] - tRe
        im[b] = im[a] - tIm
        re[a] += tRe
        im[a] += tIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}
