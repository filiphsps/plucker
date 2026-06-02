/**
 * Split a total concurrency budget across N jobs as evenly as possible, giving
 * the remainder to the earliest jobs (one extra slot each). Every job always
 * receives at least 1 slot so it can make progress, even if that makes the sum
 * exceed `total` when jobs > total. Returns one limit per job, in order.
 */
export function distribute(total: number, jobs: number): number[] {
  if (jobs <= 0) return []
  const budget = Math.max(1, Math.floor(total))
  const base = Math.floor(budget / jobs)
  const remainder = budget % jobs
  return Array.from({ length: jobs }, (_, i) => Math.max(1, base + (i < remainder ? 1 : 0)))
}
