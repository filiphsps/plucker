// Tracks renderer crashes over a sliding time window to tell a recoverable crash (recreate the
// window and move on) apart from a crash *loop* (the renderer dies again as soon as it's
// recreated). The detector is pure and clock-injected, so the decision logic is unit-testable
// without real time.

export interface CrashLoopOptions {
  /** Crashes tolerated within `windowMs` before it counts as a loop. */
  threshold: number
  /** Length of the trailing window, in milliseconds. */
  windowMs: number
}

export interface CrashLoopDetector {
  /**
   * Record a crash at `now` (epoch ms) and report whether we've entered a crash loop — i.e.
   * more than `threshold` crashes have occurred within the trailing `windowMs`. Crashes older
   * than the window are forgotten first, so occasional one-off crashes never trip it.
   */
  record(now: number): boolean
  /** Forget all recorded crashes. */
  reset(): void
}

export function createCrashLoopDetector(opts: CrashLoopOptions): CrashLoopDetector {
  const stamps: number[] = []
  return {
    record(now) {
      while (stamps.length > 0 && now - stamps[0] >= opts.windowMs) stamps.shift()
      stamps.push(now)
      return stamps.length > opts.threshold
    },
    reset() {
      stamps.length = 0
    }
  }
}
