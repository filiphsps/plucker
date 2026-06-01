# Automated screenshot generation

## Goal

Automatically render screenshots of the **real built Electron app** on a GitHub
Actions macOS runner, so the marketing/README images in `.github/img/` stay in
sync with the UI every release — no manual screenshotting.

## Feasibility (confirmed)

- `release.yml` already builds the full app on `macos-latest`; `playwright` is
  already a dev dependency (used by `scripts/build-icon.mjs`).
- macOS GitHub runners expose a real GUI session, so Electron windows render.
- Playwright's Electron driver (`_electron.launch`) captures via Chrome
  DevTools (`page.screenshot`), **not** an OS screen-grab — so it works even
  without a visible display. Robust on CI.
- The app is **dark-mode only** (`color-scheme: dark`, hardcoded tokens in
  `index.css`) → a single theme, no light/dark matrix.

## Approach: seeded fixtures + isolated HOME

All app state is derived from `$HOME`:

- Settings + history → `$HOME/.plucker/config.json`
- Metadata cache → `$HOME/Library/Application Support/Plucker/metadata-cache/`
  (Electron `userData`, since `app.setName('Plucker')` runs before ready).

So we launch the built app with `env.HOME` pointed at a throwaway directory we
pre-populate with deterministic fixtures. No network, no `yt-dlp`/`ffmpeg`, no
real downloads. Cover-art JPEGs are generated on the fly with the bundled
Playwright Chromium (gradient canvas → jpeg) so no binary blobs are committed.

## Captured views

| View     | How reached                  | Source of content       |
| -------- | ---------------------------- | ----------------------- |
| download | landing screen               | idle empty state        |
| history  | click `History` nav tab      | seeded `history[]`      |
| settings | click `Settings` icon button | seeded settings + About |
| cache    | settings → `Open cache`      | seeded metadata-cache   |

Selectors are language-independent via seeding `language: 'en'` and matching the
English `nav.*` / `app.settings` / `settings.cache.open` labels (accessible names).

## Deliverables

1. `scripts/build-screenshots.mjs` — seeds a temp HOME, launches `out/main/index.js`
   via Playwright Electron, screenshots each view to `.github/img/<view>.png`.
   Requires a prior `pnpm build`. Run locally with `pnpm build:screenshots`.
2. `pnpm build:screenshots` script in `package.json`.
3. `.github/workflows/screenshots.yml` — `workflow_dispatch` (on demand): build,
   generate, upload as artifacts (preview without committing).
4. `release.yml` integration — on a cut release: regenerate, commit the refreshed
   `.github/img/*.png` to the release tag's branch context, and `gh release upload`
   them alongside the DMGs.

## Out of scope

- Live download-progress screenshots (progress is push-only via IPC, not
  persisted) — the download view is captured in its idle state.
- Light theme (app is dark-only).
