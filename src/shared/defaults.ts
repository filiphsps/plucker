import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  downloads: { baseFolder: '~/Music/Plucker', perPlaylistSubfolder: true },
  audio: { format: 'mp3', preferredBitrate: 320, minBitrate: null },
  cookies: { source: 'auto' },
  tagging: {
    enabled: true,
    primarySource: 'youtube',
    enrichWithMusicBrainz: true,
    fetchCoverArt: true,
    fetchGenre: true,
    fetchTrackNumber: true,
    minMatchScore: 80,
    userAgentEmail: 'you@example.com',
  },
  rename: { enabled: true, template: '{artist} - {track}. {title} - {album} ({year})' },
  performance: { parallel: 4 },
}
