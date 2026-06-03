// Bandwidth throttling for background update downloads.
//
// We pace a download stream with a coarse one-second token bucket: count the
// bytes that flow in the current window and, once they reach the per-second
// budget, pause the stream for the remainder of the second before resuming.
// This keeps a background auto-download from saturating the user's connection
// while leaving manual (user-initiated) downloads at full speed.
//
// `nextPause` is the pure decision function; the stream wiring lives in
// github-download.ts (it needs real timers and the live response object).

/**
 * Milliseconds to pause the stream to hold it near `ratePerSec`, given how many
 * bytes have flowed in the current one-second window (`windowBytes`) and how long
 * that window has been open (`elapsedMs`). Returns 0 when no pause is needed —
 * either throttling is off (`ratePerSec <= 0`), the budget isn't spent yet, or the
 * window has already run a full second.
 */
export function nextPause(windowBytes: number, ratePerSec: number, elapsedMs: number): number {
  if (ratePerSec <= 0 || windowBytes < ratePerSec) return 0
  return Math.max(0, 1000 - elapsedMs)
}
