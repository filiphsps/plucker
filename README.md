# Plucker

Download YouTube playlists as tagged MP3s. A macOS desktop app built with Electron, React, and TypeScript.

## Requirements

- Node.js (see `package.json` for the toolchain)
- [pnpm](https://pnpm.io/) — the only supported package manager

## Setup

```bash
pnpm install
```

`postinstall` fetches the bundled `yt-dlp` + `ffmpeg` binaries automatically.

## Develop

```bash
pnpm dev        # run the app with HMR
pnpm test       # run the vitest suite
pnpm lint       # eslint
pnpm typecheck  # tsc (node + web)
```

## Build

```bash
pnpm build:mac  # package unsigned arm64 + x64 DMGs
```

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please).
Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) — the
prefix drives the version bump. Merging the auto-generated Release PR tags the release
and uploads the built DMGs. See [`CLAUDE.md`](./CLAUDE.md) for the full workflow.
