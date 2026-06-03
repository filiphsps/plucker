let enabled = true

/** Initialise from settings + subscribe to live changes. Returns an unsubscribe fn. */
export function initPreviewSettings(): () => void {
  void window.plucker.getSettings().then((s) => (enabled = s.library.audioPreviews))
  return window.plucker.onSettingsChanged((s) => (enabled = s.library.audioPreviews))
}

export const previewsEnabled = (): boolean => enabled
