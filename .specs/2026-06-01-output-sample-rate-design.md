# Configurable output sample rate

## Problem

Downloaded MP3s are always 48 kHz regardless of any setting. `buildDownloadArgs`
(`src/main/ytdlp.ts`) passes `--audio-format mp3` and `--audio-quality` (bitrate)
but never a sample-rate (`-ar`) flag, so ffmpeg's MP3 encode inherits the source
rate. YouTube's Opus audio is 48 kHz, so every download lands at 48 kHz. Changing
the preferred or minimum bitrate has no effect on the sample rate.

## Goal

Let the user choose the output sample rate, defaulting to today's behavior
(keep the source rate).

## Design

### 1. Settings schema (`src/shared/types.ts`)

- New type: `export type SampleRate = 44100 | 48000 | 32000` — the valid MPEG-1
  Layer III MP3 rates. (MP3 caps at 48 kHz, so no 88.2/96 kHz.)
- Extend audio:
  `audio: { format: 'mp3'; preferredBitrate: Bitrate; minBitrate: MinBitrate | null; sampleRate: SampleRate | null }`
- `sampleRate: null` means **Source** — keep whatever the source delivers
  (current behavior).

### 2. Default (`src/shared/defaults.ts`)

- `sampleRate: null`.
- No `version` bump: `mergeDefaults` already does `{ ...d.audio, ...p.audio }`,
  so existing settings files get `null` filled in and behavior is unchanged
  until the user picks a rate.

### 3. ffmpeg flag (`src/main/ytdlp.ts`)

- Build the single `ExtractAudio:` postprocessor-args string dynamically:
  - base: `-compression_level <level>`
  - when `sampleRate != null`, append ` -ar <rate>`
- When `null`, the emitted arg is byte-for-byte what it is today
  (`ExtractAudio:-compression_level 7`). Keeping one `ExtractAudio:` arg avoids
  relying on yt-dlp merging duplicate `--postprocessor-args` keys.

### 4. UI (`src/renderer/src/settings-panel.tsx`)

- New `PanelRow` "Sample rate" in the existing Audio panel, modeled on the
  `minBitrate` `<select>`. Options: **Source** (value `""` → `null`),
  **48 kHz**, **44.1 kHz**, **32 kHz**.

### 5. i18n (`en.ts`, `de.ts`)

- `settings.audio.sampleRate` label + `settings.audio.sampleRateDesc`
  description, and a "Source" option label (`settings.audio.sampleRateSource`).

### 6. Tests (`src/main/ytdlp.test.ts`)

- Default (`null`) → PP arg stays `ExtractAudio:-compression_level 7`, no `-ar`.
- `sampleRate: 44100` → PP arg becomes
  `ExtractAudio:-compression_level 7 -ar 44100`.

## Decisions

- Default stays **Source** (no silent behavior change); the user selects a rate
  in Settings.
- Rate options: **Source / 48 / 44.1 / 32 kHz**.
