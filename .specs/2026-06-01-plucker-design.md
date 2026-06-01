# Plucker — Design Spec

**Date:** 2026-06-01
**Status:** Approved for planning
**Origin:** Port of `dl-playlist.sh` into a self-contained macOS desktop app.

## 1. Summary

Plucker is a macOS desktop app that downloads a YouTube playlist (or single
video) as tagged MP3s. It reimplements the existing `dl-playlist.sh` pipeline
(download → tag → rename) as an Electron app with a React UI, bundling every
external dependency so it works on a clean machine with nothing installed.

Target platform: **macOS Ventura (13)+**, both Intel (x86_64) and Apple
Silicon (arm64).

## 2. Goals & Non-Goals

### Goals
- One-window, good-looking, simple desktop app.
- Zero external runtime dependencies — `yt-dlp` and `ffmpeg` ship inside the app.
- Download a playlist or single video as MP3 at a configurable bitrate.
- Tag MP3s (artist/title/album/date/track #/genre + cover art), preferring
  YouTube-embedded metadata and enriching from MusicBrainz / Cover Art Archive.
- Optionally rename files from final tags.
- Persistent, human-readable settings in `~/.plucker.json`.

### Non-Goals
- Non-MP3 output formats (M4A/FLAC/Opus) — MP3 only for now.
- Multi-URL batch queue — single URL per run for v1.
- Code-signing / notarization — distributed unsigned (right-click → Open).
- Windows / Linux support.

## 3. Product Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| App name | **Plucker** (settings file `~/.plucker.json`) |
| Input | One URL box; auto-detects playlist vs single video |
| Output format | MP3 only, configurable bitrate + optional minimum-quality floor |
| Tag priority | Prefer YouTube metadata, enrich with MusicBrainz |
| Output location | Configurable base folder + per-playlist subfolder |
| Tagging engine | Pure JS (`node-id3`) — no kid3-cli binary |
| Rename step | User-configurable toggle, default on |
| Cookie source | Auto-detected + user-configurable (Edge was hardcoded in script) |
| Build tooling | electron-vite + electron-builder |
| Binary bundling | At build time via `extraResources` |
| Packaging | Two arch-specific DMGs (arm64, x64) |
| Distribution | Unsigned (recipients right-click → Open) |
| yt-dlp strategy | Bundle prebuilt universal `yt-dlp_macos` (supports macOS 10.15+) |

## 4. Architecture

Standard Electron three-part split:

- **Main process (Node/TS)** — all heavy lifting: spawning bundled
  `yt-dlp`/`ffmpeg`, parsing progress, MusicBrainz + Cover Art Archive HTTP
  calls (Node `fetch`, replacing `curl`/`jq`/`python3`), writing ID3 tags +
  cover art via `node-id3`, renaming files, reading/writing `~/.plucker.json`.
- **Renderer (React + TS + Tailwind)** — UI only. No Node access.
- **Preload bridge** — typed `contextBridge` API (`window.plucker`) exposing
  safe IPC: `startDownload(url)`, `cancel()`, `getSettings()`,
  `saveSettings(settings)`, plus an event stream for per-track progress.
  `contextIsolation: true`, `nodeIntegration: false`.

### Repo layout

```
plucker/
├─ package.json                 # pnpm
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ tailwind.config.ts
├─ resources/
│  └─ bin/
│     ├─ universal/  { yt-dlp }      # universal2, shared by both DMGs
│     ├─ arm64/      { ffmpeg }
│     └─ x64/        { ffmpeg }
├─ scripts/
│  └─ fetch-binaries.ts          # pulls yt-dlp + ffmpeg into resources/bin
└─ src/
   ├─ main/
   │  ├─ index.ts                # app lifecycle, window, IPC registration
   │  ├─ binaries.ts             # resolve bundled yt-dlp/ffmpeg paths
   │  ├─ pipeline.ts             # orchestrates resolve→download→tag→rename
   │  ├─ ytdlp.ts                # spawn + progress parsing
   │  ├─ musicbrainz.ts          # search + release/genre lookup, throttle+cache
   │  ├─ tagger.ts               # node-id3 read/write + cover art
   │  ├─ rename.ts               # filename template + sanitization
   │  └─ settings.ts             # load/validate/migrate ~/.plucker.json
   ├─ preload/
   │  └─ index.ts                # contextBridge API + shared types
   └─ renderer/
      ├─ App.tsx
      ├─ DownloadView.tsx
      ├─ SettingsPanel.tsx
      └─ components/...
```

`scripts/fetch-binaries.ts` downloads the pinned `yt-dlp_macos` universal
binary and per-arch static ffmpeg builds into `resources/bin/`, keeping the
repo itself binary-free. `electron-builder.yml` ships `bin/universal` plus only
the matching arch's `bin/<arch>` into each DMG via `extraResources`. At runtime
`binaries.ts` resolves paths from `process.resourcesPath` (packaged) or
`resources/bin` (dev), and yt-dlp is invoked with `--ffmpeg-location <bundled ffmpeg>`.

## 5. Pipeline (main process)

1. **Resolve** — `yt-dlp --flat-playlist --dump-single-json <url>` →
   playlist title + entries (or a single video). Compute destination folder
   (base + sanitized playlist subfolder; single videos go in base).
2. **Download** — run yt-dlp: extract audio → MP3 at preferred bitrate, embed
   thumbnail + metadata, output template
   `%(artist,uploader)s - %(track,title)s.%(ext)s`, `--ignore-errors`,
   pass cookies arg per settings. Parse `--progress-template`/`--newline`
   stdout into per-track progress events. **Minimum quality floor
   (source-based):** `preferredBitrate` is only the MP3 re-encode target —
   YouTube serves Opus/AAC source audio that tops out around 160 kbps. When
   `minBitrate` is set, enforce a *source* floor via format selection
   `-f "ba[abr>=<min>]"` with no fallback; videos whose best source audio is
   below the floor produce no matching format and are skipped (under
   `--ignore-errors`) and reported in the UI as `skipped`. Floor scale is
   off/64/96/128/160 — distinct from the encode-target scale.
   Concurrency capped by `performance.parallel`.
3. **Tag** (if `tagging.enabled`) — per MP3: read YouTube-embedded tags first
   (primary source = YouTube), parse `Artist - Title`, search MusicBrainz
   (score ≥ `minMatchScore`), and **enrich** missing fields (album, date,
   track #, genre, cover art). YouTube values win on conflict; MusicBrainz
   fills gaps. Cover art: Cover Art Archive front-500, fallback to embedded
   YouTube thumbnail. All writes via `node-id3`.
4. **Rename** (if `rename.enabled`) — apply filename template from tags,
   sanitizing filesystem-unsafe chars (`/<>:"|?*\`, leading dots/spaces).

Each phase emits progress events (per-track status: queued / downloading %% /
tagging / done / failed+reason) to the renderer over IPC.

## 6. Settings — `~/.plucker.json`

```jsonc
{
  "version": 1,
  "downloads": {
    "baseFolder": "~/Music/Plucker",
    "perPlaylistSubfolder": true
  },
  "audio": {
    "format": "mp3",
    "preferredBitrate": 320,        // MP3 re-encode target: 320 | 256 | 192 | 128
    "minBitrate": null              // SOURCE floor: null=off | 64 | 96 | 128 | 160
  },
  "cookies": {
    "source": "auto"                // auto | none | chrome | edge | safari | firefox | brave
  },
  "tagging": {
    "enabled": true,
    "primarySource": "youtube",     // youtube | musicbrainz
    "enrichWithMusicBrainz": true,
    "fetchCoverArt": true,
    "fetchGenre": true,
    "fetchTrackNumber": true,
    "minMatchScore": 80,
    "userAgentEmail": "you@example.com"
  },
  "rename": {
    "enabled": true,
    "template": "{artist} - {track}. {title} - {album} ({year})"
  },
  "performance": { "parallel": 4 }
}
```

- Loaded on startup; defaults written if file missing.
- Validated on read; invalid/corrupt file → recreate from defaults.
- `version` field supports future migrations.
- `~` expanded to the user's home dir at runtime.

## 7. UI

Single window, two views (main + settings panel). Dark, minimal, music-app feel.

```
┌─────────────────────────────────────────────┐
│  🎵 Plucker                            ⚙︎      │
├─────────────────────────────────────────────┤
│  Paste a YouTube playlist or video URL        │
│  ┌───────────────────────────────┐ ┌───────┐ │
│  │ https://youtube.com/playlist…  │ │ Pluck │ │
│  └───────────────────────────────┘ └───────┘ │
├─────────────────────────────────────────────┤
│  My Playlist · 12 tracks                      │
│  ✓ Artist - Song One                  tagged  │
│  ✓ Artist - Song Two                  tagged  │
│  ⬇ Artist - Song Three          72% ▓▓▓░░     │
│  ○ Artist - Song Four               queued     │
│  [████████░░░░░░] 8 / 12   ·   Cancel         │
└─────────────────────────────────────────────┘
```

Settings open in a slide-over/modal with groups mapping 1:1 to the schema:
Downloads, Audio, Cookies, Tagging, Naming, Performance.

## 8. Error handling

- Per-track failures isolated (`--ignore-errors`); one bad video doesn't kill
  the batch. Failures show inline with a reason.
- MusicBrainz failures/timeouts → keep YouTube tags, mark "not enriched."
- Cover-art failures degrade to YouTube thumbnail.
- Missing/corrupt settings → recreate from defaults.
- yt-dlp/ffmpeg invocation errors surfaced with captured stderr tail.
- MusicBrainz client: in-memory cache per run + **1 req/s throttle** with
  retry/backoff (respects their rate limits; replaces the script's `.cache` dir).

## 9. Testing

- **Unit (vitest):** title→artist/title parser; MusicBrainz match selection;
  filename template + sanitization; settings load/validate/migrate. Pure
  functions — the bug-prone logic.
- **Integration:** tagger writes/reads a real MP3 fixture via node-id3;
  settings round-trip to a temp file.
- **Manual smoke:** one short real playlist end-to-end on both arches.
- yt-dlp + MusicBrainz network calls mocked in automated tests.

## 10. References

- yt-dlp README — Recommended release files note the macOS universal standalone
  executable supports macOS 10.15+:
  https://github.com/yt-dlp/yt-dlp/blob/master/README.md
- yt-dlp Changelog 2025.08.11 — `yt-dlp_macos_legacy` builds discontinued:
  https://github.com/yt-dlp/yt-dlp/blob/master/Changelog.md
- Original source script: `dl-playlist.sh`
