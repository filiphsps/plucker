import type { Settings } from './types'
import type { TransformInstance } from './transforms'

export const DEFAULT_TRANSFORMS: TransformInstance[] = [
  {
    instanceId: 'auto-tag-default',
    type: 'auto-tag',
    enabled: true,
    config: {
      primarySource: 'youtube',
      enrichWithMusicBrainz: true,
      fetchCoverArt: true,
      fetchGenre: true,
      fetchTrackNumber: true,
      minMatchScore: 80
    }
  },
  {
    instanceId: 'rename-default',
    type: 'rename',
    enabled: true,
    config: { template: '{artist} - {track}. {title} - {album} ({year})' }
  }
]

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  language: 'system',
  history: [],
  downloads: { baseFolder: '~/Music/Plucker', perPlaylistSubfolder: true },
  audio: { format: 'mp3', preferredBitrate: 320, minBitrate: null, sampleRate: null },
  cookies: { source: 'auto' },
  transforms: DEFAULT_TRANSFORMS,
  performance: { parallel: 4, compressionLevel: 7, concurrentFragments: 4, priority: 'normal' },
  updates: { checkOnLaunch: true },
  developer: { console: false }
}
