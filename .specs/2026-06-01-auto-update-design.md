# Auto-update (notify-only) Design

Date: 2026-06-01
Status: Implemented — build/CI portion (commit 67da565) + app-code portion (commit b58e084)

## Goal

Notify the user when a newer Plucker release exists on GitHub and let them open the
releases page to download it manually. Do **not** auto-download or auto-install — the
app is unsigned, so Squirrel.Mac cannot apply updates anyway.

## Tooling decision

Use **electron-updater** (`autoDownload = false`), pointed at the GitHub releases of
`filiphsps/plucker`. Chosen over a lightweight GitHub Releases API check so the project
is ready for true in-app updates once code signing is added.

## Constraints (from electron-builder docs)

macOS auto-update requires a `zip` target so electron-builder emits `latest-mac.yml`;
`dmg` alone is insufficient. The release must therefore carry the DMG **and** the zip +
`latest-mac.yml` for electron-updater to detect a new version.

## Implemented (build/CI plumbing) — commit 67da565

- `electron-builder.yml`: `publish` → `provider: github, owner: filiphsps, repo: plucker`;
  added a macOS `zip` target (arm64 + x64) alongside `dmg`.
- `package.json`: `build:mac` now ends with `--publish never` (release-please owns the
  GitHub release; CI uploads assets). Added `electron-updater@^6.8.3` dependency.
- `.github/workflows/release.yml`: the macOS job uploads `dist/*.zip` and
  `dist/latest-mac.yml` alongside the DMGs, via a `nullglob` array so a missing metadata
  file can never fail the release.

## App-code wiring — implemented (commit b58e084)

Implemented after the concurrent transform-pipeline refactor landed:

1. **`src/main/updater.ts`** — wrap electron-updater:
   - `autoUpdater.autoDownload = false`, `autoUpdater.autoInstallOnAppQuit = false`.
   - `checkForUpdates({ silent })`: on `update-available` show a native dialog
     ("Plucker X.Y.Z is available") with **View Release** →
     `shell.openExternal('https://github.com/filiphsps/plucker/releases/latest')` and
     **Later**. On `update-not-available` show an info dialog only when not silent.
   - Guard on `app.isPackaged` (electron-updater errors in dev); in dev the manual check
     reports "only available in the installed app."
2. **`src/main/index.ts`** — a few seconds after the window opens, if
   `settings.updates.checkOnLaunch`, call `checkForUpdates({ silent: true })`. Add an
   application menu (`Menu.buildFromTemplate`) with a **"Check for Updates…"** item →
   `checkForUpdates({ silent: false })`.
3. **Settings** — add `updates: { checkOnLaunch: boolean }` (default `true`) to the
   `Settings` type, `DEFAULT_SETTINGS`, and `mergeDefaults`; add a toggle to
   `SettingsPanel.tsx` with `en`/`de` labels.

### Scope notes

- Update dialogs are English-only (the main process has no i18n wiring today).
- No new IPC needed: the toggle persists via the existing `settings:save`; the check
  lives entirely in the main process.

## Verification note

A full `pnpm build:mac` could not be run locally to confirm `latest-mac.yml` generation
because the shared working tree was mid-refactor (does not typecheck). The
`nullglob`-resilient upload step ensures the release pipeline is safe regardless; confirm
`latest-mac.yml` appears in the release assets on the next real release build.
