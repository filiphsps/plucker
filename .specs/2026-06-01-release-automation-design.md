# Release Automation Design

Date: 2026-06-01
Status: Approved

## Goal

Automate Plucker releases so that merging a PR to `master` eventually produces a
tagged GitHub release whose `CHANGELOG.md` is generated from commit titles and
whose assets are the built macOS DMGs. Add a lightweight CI workflow that runs
tests and a build on pull requests.

## Tooling decision

Use **release-please** (`googleapis/release-please-action@v4`, `release-type: node`).

Rejected alternatives:
- **semantic-release** — releases immediately on every `feat:`/`fix:` merge with no
  human-gated approval step. We want a reviewable Release PR.
- **Custom script** — more maintenance; release-please is battle-tested.

## Flow

1. On every `push` to `master` (i.e. when a PR merges), the `release-please` job runs.
2. release-please maintains a standing **Release PR** (e.g. `chore(main): release X.Y.Z`)
   that accumulates the `package.json` version bump and `CHANGELOG.md` entries. The
   semver bump is derived from Conventional Commit titles:
   - `feat:` → minor
   - `fix:` / `perf:` → patch
   - `feat!:` / `fix!:` / `BREAKING CHANGE:` footer → major
3. A maintainer **reviews and merges the Release PR** when ready. Merging lands the
   bumped `package.json` + `CHANGELOG.md` on `master`, and release-please then creates
   the **git tag** and **GitHub release**, exposing `release_created` and `tag_name`.
4. The `build-macos` job runs only when `release_created == 'true'`. On `macos-latest`
   it checks out the tagged commit, sets up pnpm + Node 22, installs, runs
   `pnpm build:mac` (fetches yt-dlp + both ffmpeg arches and packages two **unsigned**
   DMGs), then uploads both DMGs to the release via `gh release upload ${tag_name}`.

This satisfies the requirement: CHANGELOG.md is committed (via the merged Release PR)
under a release tag, the release is created at that tag, and the DMGs are attached.

### Note on non-feat/fix commits

release-please only opens a Release PR when there are releasable commits. Pure
`docs:`/`chore:` history will **not** trigger a release on its own. The smallest
automatic bump is a `fix:` → patch. To force a release without a feat/fix, add a
`Release-As: x.y.z` footer to a commit, or label the run accordingly.

## Files added

- `.github/workflows/release.yml` — the two-job release workflow above.
- `.github/workflows/ci.yml` — on `pull_request` (and push to `master`): install,
  lint, typecheck, test, and `pnpm build` on `ubuntu-latest`.
- `release-please-config.json` — manifest config: root package `.`, `release-type: node`.
- `.release-please-manifest.json` — seeds current version: `{ ".": "0.1.0" }`.

## Files changed

- `electron-builder.yml` — DMG `artifactName` changed from `${name}-${version}.${ext}`
  to `${name}-${version}-${arch}.${ext}` so arm64 and x64 DMGs don't collide on the
  same filename when both upload to the release.
- `package.json` — add `"packageManager": "pnpm@11.5.0"` so `pnpm/action-setup`
  resolves a deterministic pnpm version in CI (lockfile is v9.0).
- `CLAUDE.md` — document the enforced Conventional Commits style and how releases work.

## Permissions & one-time repo setting

The release workflow declares `permissions: contents: write` + `pull-requests: write`.
A maintainer must enable once in GitHub:
**Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"**,
otherwise the default `GITHUB_TOKEN` cannot open the Release PR. (Alternative: a PAT
secret, but the setting is simpler.)

## Out of scope

- Code signing / notarization (DMGs ship unsigned; matches current `electron-builder.yml`).
- Windows / Linux release artifacts (macOS DMGs only, per request).
