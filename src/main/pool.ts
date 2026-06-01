// src/main/pool.ts

/** A dynamic concurrency pool: submit tasks over time, await them all with drain(). */
export function createPool(limit: number): {
  run: (task: () => Promise<void>) => void
  drain: () => Promise<PromiseSettledResult<void>[]>
} {
  let active = 0
  const waiters: Array<() => void> = []
  const all: Promise<void>[] = []

  const acquire = (): Promise<void> =>
    active < limit
      ? (active++, Promise.resolve())
      : new Promise<void>((resolve) => waiters.push(resolve)).then(() => {
          active++
        })

  const release = (): void => {
    active--
    waiters.shift()?.()
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
  return { run, drain }
}
