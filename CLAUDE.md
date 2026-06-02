# Plucker

## Package manager

Use **pnpm** for every command (install, scripts, adding deps). Never use `npm` or `npx` — use `pnpm` and `pnpm dlx`.

## Toolchain corrections

Defaults that would otherwise be wrong here:

- **Use `pnpm <script>` whenever a `package.json` script exists** — `pnpm test`,
  `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm dev`, `pnpm start`. Don't
  hand-roll the underlying `vitest`/`tsc`/`electron-vite`/`eslint` invocation; the
  scripts carry the right flags **and** the `pre*` hooks that fix native modules
  (below).
- **`better-sqlite3` is a native (node-gyp) module with a per-runtime ABI, and one
  `node_modules` serves two runtimes:** the app runs under **Electron**, Vitest runs
  under plain **Node** — different ABIs. `scripts/ensure-better-sqlite3-abi.mjs`
  reconciles this and is wired as `pretest` → `--target node`, `predev`/`prestart`
  → `--target electron`. It short-circuits when the binary already matches, so just
  run the right `pnpm` script and let the guard switch the binary. **Don't** manually
  `rebuild` / `node-gyp` / `electron-builder install-app-deps` to "fix a crash":
  - better-sqlite3 ships **no Electron prebuilt**, so the Electron binary must be
    compiled **from source** (which also bakes in the pnpm V8-compat patch in
    `patches/better-sqlite3.patch`).
  - The dep is pnpm-`patchedDependencies`-patched, so the copy the app actually
    loads is the `…_patch_hash=…` virtual-store dir. Running
    `electron-builder install-app-deps` rebuilds the **unpatched** store dir
    instead and silently leaves the loaded binary at the Node ABI → the app
    crashes under Electron. The guard drives node-gyp against the **resolved
    (patched)** module directly.
- **Node / ABI pinning:** `.nvmrc` pins Node for local dev; the GitHub workflows
  pin their own `node-version` (kept in sync via `.nvmrc`). ABI reference: **Electron
  42 = ABI 146**, **Node 26 = ABI 147** — a `NODE_MODULE_VERSION` mismatch in a crash
  is this conflict, not a code bug.
- **Root cause before symptom.** Don't revert versions, disable features, or return
  empty results as a first-guess fix — especially for native-module ABI, electron-vite
  build issues, or release-please/CI failures. Diagnose the actual cause.
- **electron-vite builds three targets** (main / preload / renderer). A renderer-only
  change still needs the preload/main contracts (`src/preload`, `src/shared/types.ts`)
  to stay in sync.

## Code intelligence

Prefer **LSP over `Grep`/`Read`** for navigation — faster, precise, no whole-file
reads. TypeScript and Tailwind LSPs are vendored in `.claude/plugins/pl-dl-plugins`
and enabled in `.claude/settings.json`, so they work on a fresh clone.

- The built-in LSP tool's `workspaceSymbol` has **no `query` param**, so symbol-by-name
  search returns nothing. To find a symbol by name: `Grep` for the name, then point a
  position-based op at the hit.
- Position-based ops (`filePath` + `line` + `character`):
  - **`findReferences`** for every usage across the repo.
  - **`goToDefinition` / `goToImplementation`** to jump to source.
  - **`hover`** for type info without opening the file.
  - **`documentSymbol`** to list a file's symbols (file-scoped, works).
- **Check LSP diagnostics after writing or editing code** and fix errors before
  moving on.

## Specs & plans

Write all specs, plans, and design docs to the **`.specs/`** folder. This overrides any skill's default location (e.g. `docs/superpowers/specs`, `docs/superpowers/plans`) — always use `.specs/` instead.

## Branching

Work directly on the current branch (usually `master`). **Do not create new
branches** — not for features, specs, or experiments — unless the user explicitly
asks for one. This overrides any skill's default "branch first" behavior.

## Commit messages

Every commit **must** follow [Conventional Commits](https://www.conventionalcommits.org/).
Releases and the changelog are generated automatically from commit titles, so the
prefix is not optional — it directly controls the version bump.

Format: `type(optional scope): summary`

Allowed types and their release impact:

| Type       | Use for                                                 | Version bump |
| ---------- | ------------------------------------------------------- | ------------ |
| `feat`     | a new user-facing feature                               | **minor**    |
| `fix`      | a bug fix                                               | **patch**    |
| `perf`     | a performance improvement                               | **patch**    |
| `docs`     | documentation only                                      | none         |
| `refactor` | code change that neither fixes a bug nor adds a feature | none         |
| `test`     | adding or fixing tests                                  | none         |
| `build`    | build system, deps, packaging                           | none         |
| `ci`       | CI configuration                                        | none         |
| `chore`    | anything else (tooling, housekeeping)                   | none         |

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

### Reusable utilities over per-file helpers

Prefer a **shared, named, unit-tested utility** over an inline or per-file helper.
The moment a helper (formatting, parsing, math, byte/size/time helpers, etc.) would
be useful in more than one place — or is even plausibly reusable — extract it to a
dedicated module rather than redefining a local `const fn = …` inside the file that
first needs it.

- Cross-process/UI-agnostic helpers go in **`src/shared/`** (e.g. `format-bytes.ts`);
  main-only helpers in **`src/main/`**. Each gets a colocated `*.test.ts`.
- One clear purpose per util, kebab-case filename, exported function in camelCase.
- Don't copy-paste a helper into a second file — import the shared one. If you find
  an existing inline helper while working nearby, lift it into a util.

### File naming

Component files (and their tests) use **kebab-case**: `download-view.tsx`,
`settings-panel.tsx`, `track-row.test.tsx`. The exported React component keeps
**PascalCase** (`export function DownloadView`). Non-component modules are already
kebab-case (`transform-list-utils.ts`) — keep them that way.
