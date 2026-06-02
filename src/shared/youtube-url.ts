// Canonical YouTube watch URL for a video id. Shared by the main process
// (pipeline source URLs) and the renderer (history / context menus / track detail)
// so the format lives in exactly one place.
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
