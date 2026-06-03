import { previewsEnabled } from './preview-settings'

export const FADE_IN = 850
export const FADE_OUT = 650
const VOL = 0.9
const INTENT_MS = 220

export function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
}

/** currentTime → 0..1 within the loop window [t0,t1). */
export function loopPosition(ct: number, t0: number, t1: number): number {
  const win = t1 - t0
  const p = (ct - t0) % win
  return (((p % win) + win) % win) / win
}

export interface PreviewHandle {
  /** 0..1 playback position within the snippet, updated each frame. */
  onFrame?: (pos: number) => void
  onState?: (state: 'buffering' | 'playing' | 'stopped') => void
}

let audio: HTMLAudioElement | null = null
let activeToken = 0 // identifies the active preview; bumping it cancels older callbacks
let raf = 0

function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void): void {
  const from = el.volume
  const start = performance.now()
  const step = (now: number): void => {
    const k = Math.min(1, (now - start) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * easeInOut(k)))
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  requestAnimationFrame(step)
}

/** Stop whatever is previewing (eased), if anything. */
export function stopPreview(): void {
  activeToken++
  if (raf) cancelAnimationFrame(raf)
  const el = audio
  if (el && !el.paused) fade(el, 0, FADE_OUT, () => el.pause())
}

/**
 * Play a looping snippet of a blob, eased in, scrolling via `onFrame`. Single-active:
 * a new call cancels the previous. No-op when previews are disabled in settings.
 * Returns a stop fn for the caller (e.g. mouseleave).
 */
export function playPreview(
  hash: string,
  range: [number, number],
  h: PreviewHandle = {}
): () => void {
  if (!previewsEnabled() || !hash) return () => {}
  const [t0, t1] = range
  const mine = ++activeToken
  if (raf) cancelAnimationFrame(raf)
  if (!audio) audio = new Audio()
  const el = audio
  el.src = `plucker-audio://${hash}`
  el.volume = 0
  h.onState?.('buffering')
  try {
    el.currentTime = t0
  } catch {
    /* before metadata loads — corrected in the loop below */
  }
  void el
    .play()
    .then(() => h.onState?.('playing'))
    .catch(() => h.onState?.('stopped'))
  fade(el, VOL, FADE_IN)
  const loop = (): void => {
    if (mine !== activeToken) return
    if (el.currentTime < t0 || el.currentTime > t1) {
      try {
        el.currentTime = t0
      } catch {
        /* not seekable yet */
      }
    }
    h.onFrame?.(loopPosition(el.currentTime, t0, t1))
    raf = requestAnimationFrame(loop)
  }
  loop()
  return () => {
    if (mine === activeToken) stopPreview()
  }
}

/** Hover-intent wrapper: only starts after the cursor dwells `INTENT_MS`. */
export function hoverPreview(
  hash: string,
  range: [number, number],
  h: PreviewHandle = {}
): { enter: () => void; leave: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stop: (() => void) | null = null
  return {
    enter: () => {
      timer = setTimeout(() => {
        stop = playPreview(hash, range, h)
      }, INTENT_MS)
    },
    leave: () => {
      if (timer) clearTimeout(timer)
      stop?.()
      h.onState?.('stopped')
    }
  }
}
