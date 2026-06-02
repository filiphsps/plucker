import { useEffect, useRef, useState } from 'react'

/** `offline` while disconnected, `online` for a brief flash after reconnecting, `null` when idle-online. */
export type NetworkPhase = 'offline' | 'online' | null

/** How long the "online again" confirmation lingers before the bar hides itself. */
export const ONLINE_FLASH_MS = 3000

/**
 * Tracks the renderer's connectivity for the status bar.
 *
 * - `offline` persists for as long as the connection is down.
 * - `online` shows briefly ({@link ONLINE_FLASH_MS}) right after reconnecting, then
 *   clears to `null`.
 * - `null` is the steady connected state — nothing to show, so the bar collapses.
 */
export function useNetworkStatus(): NetworkPhase {
  const [phase, setPhase] = useState<NetworkPhase>(() => (navigator.onLine ? null : 'offline'))
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const clear = (): void => {
      if (timer.current) clearTimeout(timer.current)
    }
    const goOffline = (): void => {
      clear()
      setPhase('offline')
    }
    const goOnline = (): void => {
      clear()
      setPhase('online')
      timer.current = setTimeout(() => setPhase(null), ONLINE_FLASH_MS)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      clear()
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  return phase
}
