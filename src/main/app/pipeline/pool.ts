// src/main/pool.ts

/** A dynamic concurrency pool: submit tasks over time, await them all with drain(). */
export function createPool(initialLimit: number): {
  run: (task: () => Promise<void>) => void
  setLimit: (n: number) => void
  drain: () => Promise<PromiseSettledResult<void>[]>
} {
  let limit = Math.max(1, initialLimit)
  let active = 0
  const waiters: Array<() => void> = []
  const all: Promise<void>[] = []

  // The waker (release/setLimit) increments `active` synchronously on the woken
  // waiter's behalf, so the slot count is always correct without relying on an
  // async .then — which is what lets setLimit bound how many waiters it wakes.
  const acquire = (): Promise<void> => {
    if (active < limit) {
      active++
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => waiters.push(resolve))
  }

  const wakeOne = (): void => {
    active++
    waiters.shift()!()
  }

  const release = (): void => {
    active--
    if (active < limit && waiters.length > 0) wakeOne()
  }

  // Raising the limit must wake enough queued waiters to fill the new headroom;
  // lowering it just lets in-flight tasks drain naturally (no preemption).
  const setLimit = (n: number): void => {
    limit = Math.max(1, n)
    while (active < limit && waiters.length > 0) wakeOne()
  }

  const run = (task: () => Promise<void>): void => {
    const p = (async () => {
      await acquire()
      try {
        await task()
      } finally {
        release()
      }
    })()
    all.push(p)
  }

  const drain = (): Promise<PromiseSettledResult<void>[]> => Promise.allSettled(all)
  return { run, setLimit, drain }
}
