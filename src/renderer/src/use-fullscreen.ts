import { useEffect, useState } from 'react'

/**
 * Tracks whether the main window is in macOS fullscreen.
 *
 * The custom toolbar normally reserves a gap on the left for the native traffic lights,
 * but macOS hides those lights in fullscreen — so the toolbar collapses that gap while
 * fullscreen is active. Seeds from the current window state, then follows the
 * enter/leave-fullscreen events pushed from the main process.
 */
export function useFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let active = true
    window.plucker.isFullscreen().then((full) => {
      if (active) setFullscreen(full)
    })
    const off = window.plucker.onFullscreenChanged(setFullscreen)
    return () => {
      active = false
      off()
    }
  }, [])

  return fullscreen
}
