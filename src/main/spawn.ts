import {
  spawn,
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
  type SpawnOptions
} from 'node:child_process'
import { setPriority } from 'node:os'

/**
 * Subprocess management for yt-dlp / ffmpeg.
 *
 * Two problems this solves:
 *  1. yt-dlp spawns its own ffmpeg child. SIGTERM'ing only yt-dlp can leave that
 *     grandchild running as an orphan. We instead spawn each process in its own
 *     process group (`detached`) and kill the whole group, so the entire tree
 *     dies together.
 *  2. A cancel (or app quit) must take effect immediately — SIGTERM can be slow
 *     or ignored, so we force-kill with SIGKILL, which cannot be trapped.
 */

type GroupKey = number | string
const UNGROUPED: GroupKey = '__ungrouped__'

/** Every still-running managed child, so orphans can be reaped on app quit. */
const live = new Set<ChildProcess>()
/** Children bucketed by group key (a track index) for per-track control. */
const groups = new Map<GroupKey, Set<ChildProcess>>()
/** Reverse lookup so cleanup can find a child's group without scanning. */
const groupOf = new WeakMap<ChildProcess, GroupKey>()

const isWindows = process.platform === 'win32'

/**
 * Whether ALL managed children are paused (the global deck pause). While true,
 * any child spawned mid-pause is stopped the moment it comes up — the download
 * pool launches yt-dlp processes over time, so a slot that frees during a pause
 * must not let a fresh process race ahead of the frozen ones.
 */
let globalPaused = false
/** Group keys individually paused, independent of the global flag. */
const pausedGroups = new Set<GroupKey>()

/** A child is frozen if the global pause is on, or its own group is paused. */
function shouldStop(key: GroupKey): boolean {
  return globalPaused || pausedGroups.has(key)
}

function childrenOf(key: GroupKey): ChildProcess[] {
  return [...(groups.get(key) ?? [])]
}

/**
 * Deliver a job-control signal to a child and (on POSIX) its whole process group
 * — so yt-dlp's ffmpeg grandchild freezes/wakes alongside it. Best-effort: a
 * missing process (ESRCH) just means it already exited. No-op on Windows, which
 * has no SIGSTOP/SIGCONT (the app ships macOS builds).
 */
function signalGroup(child: ChildProcess, sig: 'SIGSTOP' | 'SIGCONT'): void {
  if (isWindows) return
  const pid = child.pid
  if (pid === undefined) return
  try {
    // Negative pid targets the whole group (the child leads its own group
    // because it was spawned detached), so the ffmpeg grandchild stops/resumes too.
    process.kill(-pid, sig)
  } catch {
    try {
      process.kill(pid, sig)
    } catch {
      /* already exited */
    }
  }
}

/**
 * Force-kill a child and (on POSIX) its whole process group — covering
 * grandchildren like the ffmpeg yt-dlp spawns. Best-effort: a missing process
 * (ESRCH) just means it already exited.
 */
export function hardKill(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined) return
  if (isWindows) {
    try {
      child.kill()
    } catch {
      /* already exited */
    }
    return
  }
  try {
    // Negative pid targets the process group (the child leads its own group
    // because it was spawned detached). SIGKILL cannot be caught or ignored.
    process.kill(-pid, 'SIGKILL')
  } catch {
    // Group already gone, or no group — fall back to the single process.
    try {
      child.kill('SIGKILL')
    } catch {
      /* already exited */
    }
  }
}

/**
 * Spawn a managed subprocess. Like `child_process.spawn`, but:
 *  - runs in its own process group (POSIX `detached`, never `unref`'d) so the
 *    whole tree can be killed at once;
 *  - when `signal` aborts, the entire group is force-killed (SIGKILL) instead of
 *    SIGTERM'd — no stuck process, no orphaned grandchild;
 *  - is tracked in a registry so {@link killAllChildren} can reap it on quit.
 */
export function spawnManaged(
  command: string,
  args: string[],
  options: SpawnOptions = {},
  signal?: AbortSignal,
  /**
   * Scheduling priority (`os` nice value, -20..19). Applied to the child after
   * spawn; its own children (e.g. yt-dlp's ffmpeg) inherit it. Best-effort —
   * raising priority (negative) needs privileges and is silently ignored if denied.
   */
  priority?: number,
  /**
   * Process-group key (the track index) so per-track pause/skip can target just
   * this child's tree. Ungrouped children share a sentinel key and are only
   * affected by the global pause / app-quit reap.
   */
  groupKey?: GroupKey
): ChildProcessWithoutNullStreams {
  // Default (pipe) stdio, so stdout/stderr are always present — callers stream
  // them. Cast reflects that; do not pass a non-pipe `stdio` to this helper.
  const child = spawn(command, args, {
    ...options,
    detached: !isWindows
  }) as ChildProcessWithoutNullStreams
  const key = groupKey ?? UNGROUPED
  live.add(child)
  let bucket = groups.get(key)
  if (!bucket) {
    bucket = new Set()
    groups.set(key, bucket)
  }
  bucket.add(child)
  groupOf.set(child, key)

  // Came up while frozen (global pause OR this group paused) — freeze it now so
  // it doesn't run ahead of the already-stopped processes until the next resume.
  if (shouldStop(key)) signalGroup(child, 'SIGSTOP')

  if (priority !== undefined && child.pid !== undefined) {
    try {
      setPriority(child.pid, priority)
    } catch {
      /* insufficient privileges or unsupported — leave at default priority */
    }
  }

  const onAbort = (): void => hardKill(child)
  if (signal) {
    if (signal.aborted) hardKill(child)
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  const cleanup = (): void => {
    live.delete(child)
    const k = groupOf.get(child) ?? UNGROUPED
    const set = groups.get(k)
    if (set) {
      set.delete(child)
      if (set.size === 0) groups.delete(k)
    }
    signal?.removeEventListener('abort', onAbort)
  }
  child.on('close', cleanup)
  child.on('error', cleanup)

  return child
}

/**
 * Force-kill every still-running managed child. Call on app quit so a download
 * in flight can never leave yt-dlp/ffmpeg processes running after the app exits.
 */
export function killAllChildren(): void {
  for (const child of live) hardKill(child)
  live.clear()
  groups.clear()
}

/**
 * Pause every running managed child (and any spawned later) by stopping it with
 * SIGSTOP. The process freezes in place — a partial download keeps its bytes, a
 * mid-flight transform holds its state — and resumes exactly where it left off.
 */
export function pauseAllChildren(): void {
  globalPaused = true
  for (const child of live) signalGroup(child, 'SIGSTOP')
}

/**
 * Clear the global pause and resume every child with SIGCONT — except children
 * whose group is still individually paused, which stay frozen (union semantics).
 */
export function resumeAllChildren(): void {
  globalPaused = false
  for (const child of live) {
    if (!pausedGroups.has(groupOf.get(child) ?? UNGROUPED)) signalGroup(child, 'SIGCONT')
  }
}

/** Whether the global pause is currently engaged. */
export function isPaused(): boolean {
  return globalPaused
}

/** Freeze one group's process trees (SIGSTOP). Independent of the global pause. */
export function pauseGroup(key: GroupKey): void {
  pausedGroups.add(key)
  for (const child of childrenOf(key)) signalGroup(child, 'SIGSTOP')
}

/** Wake one group — but only if the global pause isn't also holding it down. */
export function resumeGroup(key: GroupKey): void {
  pausedGroups.delete(key)
  if (globalPaused) return
  for (const child of childrenOf(key)) signalGroup(child, 'SIGCONT')
}

/** Force-kill one group's process trees (a per-track skip). */
export function killGroup(key: GroupKey): void {
  for (const child of childrenOf(key)) hardKill(child)
}
