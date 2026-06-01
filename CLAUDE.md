# Plucker

## Package manager

Use **pnpm** for every command (install, scripts, adding deps). Never use `npm` or `npx` — use `pnpm` and `pnpm dlx`.

## Specs & plans

Write all specs, plans, and design docs to the **`.specs/`** folder. This overrides any skill's default location (e.g. `docs/superpowers/specs`, `docs/superpowers/plans`) — always use `.specs/` instead.

## Commit messages

Every commit **must** follow [Conventional Commits](https://www.conventionalcommits.org/).
Releases and the changelog are generated automatically from commit titles, so the
prefix is not optional — it directly controls the version bump.

Format: `type(optional scope): summary`

Allowed types and their release impact:

| Type | Use for | Version bump |
| --- | --- | --- |
| `feat` | a new user-facing feature | **minor** |
| `fix` | a bug fix | **patch** |
| `perf` | a performance improvement | **patch** |
| `docs` | documentation only | none |
| `refactor` | code change that neither fixes a bug nor adds a feature | none |
| `test` | adding or fixing tests | none |
| `build` | build system, deps, packaging | none |
| `ci` | CI configuration | none |
| `chore` | anything else (tooling, housekeeping) | none |

Breaking changes: append `!` after the type (`feat!: …`) **or** add a
`BREAKING CHANGE:` footer → **major** bump.

Examples: `feat: add playlist resume`, `fix(history): keep cover after redownload`,
`feat!: drop x64 DMG`.

## Releases

Releases are automated with **release-please** (`.github/workflows/release.yml`).

- Merging any PR to `master` updates a standing **Release PR**
  (`chore(main): release X.Y.Z`) that accumulates the version bump + `CHANGELOG.md`
  entries derived from the commit titles above.
- **Cut a release by merging that Release PR.** Doing so commits the bumped
  `package.json` + `CHANGELOG.md`, creates the git tag and GitHub release, then builds
  and uploads the macOS DMGs (arm64 + x64, unsigned) to that release.
- Pure `docs:`/`chore:` history does not open a Release PR. The smallest automatic
  bump is `fix:` → patch. To force a specific version, add a `Release-As: x.y.z`
  footer to a commit.
- One-time repo setting required: **Settings → Actions → General → "Allow GitHub
  Actions to create and approve pull requests"**.

`.github/workflows/ci.yml` runs lint, typecheck, tests, and a build on every PR.

## Conventions

Infer toolchain details (Node version, dependencies, scripts) from `package.json` rather than assuming.

### File naming

Component files (and their tests) use **kebab-case**: `download-view.tsx`,
`settings-panel.tsx`, `track-row.test.tsx`. The exported React component keeps
**PascalCase** (`export function DownloadView`). Non-component modules are already
kebab-case (`transform-list-utils.ts`) — keep them that way.
