# `src/main` reorganization + `@main` / `@shared` path aliases

Status: **PLAN — awaiting approval. No code touched yet.**

## Goal

`src/main/` has **49 non-test modules** (≈98 files with colocated tests) dumped
flat at the folder root, next to three already-organized subfolders
(`library/`, `transforms/`, `workers/`). Group the loose modules into a nested
`app/` domain tree, and introduce TypeScript path aliases so the new nesting
doesn't produce `../../../shared` import chains.

## Decisions locked in (from review)

1. **Everything nests under `app/`**; `library/`, `transforms/`, `workers/` stay
   at the `src/main` root, unchanged in location.
2. **Cross-cutting primitives split** (not one folder): `app/process/` = {spawn,
   sudo}; `pool` → `app/pipeline/`; `bench` → `app/logging/`.
3. **`tagger.ts` → `app/metadata/id3/`** (it writes ID3 metadata).
4. **Add path aliases** `@shared/*` and `@app/*` (main-scoped) and rewrite **all**
   imports — including every `../shared/*` — to use them.

## Why this is safe (verified)

- **`index.ts` stays at `src/main/index.ts`** — it's the build entry
  (`package.json` "main": `./out/main/index.js`, electron-vite default entry).
- **`src/main` is self-contained** — nothing in `preload`/`renderer`/`shared`
  imports a main module, so only intra-`src/main` imports (+ colocated tests)
  change.
- **No path-string / dynamic refs to moved modules.** `?nodeWorker` imports are
  all inside `workers/` (not moved); `__dirname` in `index.ts` points at
  `../preload` / `../renderer` via `join()` strings (not imports, untouched);
  `import(specifier)` in `menus/menu.ts` + `menus/context-menu.ts` uses a runtime
  variable (no string literal → codemod won't match).
- **Tests are SSR** (`renderToStaticMarkup`) — no jsdom/environment wiring, so a
  new `vitest.config.ts` with only `resolve.alias` is non-invasive.
- **No `eslint-plugin-import`/resolver** — aliases won't trigger `no-unresolved`.

## Target structure

```
src/main/
  index.ts                                  # build entry, STAYS

  app/
    accent.ts
    settings/      settings.ts
    windows/       window-state.ts  window-recovery.ts  crash-loop.ts
    menus/         menu.ts  context-menu.ts
    logging/       log.ts  log-file.ts  log-serialize.ts  bench.ts
    process/       spawn.ts  sudo.ts
    download/      ytdlp.ts  cookies.ts  binaries.ts
    pipeline/      pipeline.ts  pool.ts  resume-merge.ts  retransform-source.ts
      jobs/        job-pool.ts  job-checkpoint.ts
    audio/         audio-hash.ts  audio-meta.ts  audio-pcm.ts  audio-trim.ts
                   waveform.ts  mp3-info.ts  essentia.ts  image-crop.ts
    metadata/      metadata.ts  metadata-cache.ts  metadata-fusion.ts
                   source-metadata.ts  channel-classifier.ts  title-parser.ts
                   rename.ts
      id3/         tagger.ts
      musicbrainz/ musicbrainz.ts  mb-select.ts  mb-verify.ts
    updater/       updater.ts  github-download.ts  mac-installer.ts
                   update-cache.ts  throttle.ts
      diff/        blockmap.ts  differential.ts

  library/  transforms/  workers/           # UNCHANGED location
```

Each module's colocated `*.test.ts` moves with it. Two extra test companions:
`title-parser.corpus.test.ts` → `app/metadata/`, `pipeline-checkpoint.test.ts`
(imports `./pipeline`) → `app/pipeline/`.

### Full move map (48 modules)

| New home | Modules |
| --- | --- |
| `app/` | accent |
| `app/settings/` | settings |
| `app/windows/` | window-state, window-recovery, crash-loop |
| `app/menus/` | menu, context-menu |
| `app/logging/` | log, log-file, log-serialize, **bench** |
| `app/process/` | spawn, sudo |
| `app/download/` | ytdlp, cookies, binaries |
| `app/pipeline/` | pipeline, **pool**, resume-merge, retransform-source |
| `app/pipeline/jobs/` | job-pool, job-checkpoint |
| `app/audio/` | audio-hash, audio-meta, audio-pcm, audio-trim, waveform, mp3-info, essentia, image-crop |
| `app/metadata/` | metadata, metadata-cache, metadata-fusion, source-metadata, channel-classifier, title-parser, rename |
| `app/metadata/id3/` | tagger |
| `app/metadata/musicbrainz/` | musicbrainz, mb-select, mb-verify |
| `app/updater/` | updater, github-download, mac-installer, update-cache, throttle |
| `app/updater/diff/` | blockmap, differential |

## Path aliases

Two aliases. Resolved via `baseUrl: "./src"` so the tsconfig `paths` **values
never contain `src`**:

- `@shared/*` → `shared/*`  (i.e. `src/shared/*`)
- `@app/*`    → `main/*`    (i.e. `src/main/*` — the whole main process scope)

`@app` is the single, main-scoped alias (it replaces the earlier `@main` idea).
Because the reorganized tree lives under `src/main/app/`, a module there is
reached as `@app/app/<domain>/<name>` (e.g. `@app/app/audio/audio-hash`); the
unmoved roots are `@app/library/…`, `@app/transforms/…`, `@app/workers/…`.

### Import rewrite rule (applied to every `.ts`/`.tsx` under `src/main`)

For each **relative** import that resolves to a real file `T`:

- `T` in `src/shared/…` → **`@shared/<path-from-src/shared>`** (always — no
  relative-shared exception)
- `T` in `src/main/…`:
  - same directory as the importer (post-move) → **`./<name>`** (kept relative)
  - different directory → **`@app/<path-from-src/main>`**
- anything else (node:, packages, the `../preload` string inside `join()`) →
  **unchanged**

Net effect: same-folder imports stay `./x`; every cross-folder hop and every
shared import becomes a stable alias — no `../../../` chains, and imports survive
future moves. `?nodeWorker` query suffixes are preserved.

Examples:
- `src/main/app/pipeline/pipeline.ts` importing `./pool` → stays `./pool`
- …importing `audio-hash` → `@app/app/audio/audio-hash`
- …importing `../shared/types` → `@shared/types`
- `src/main/app/pipeline/jobs/job-pool.ts` importing workers →
  `@app/workers/job-client`
- `src/main/library/service.ts` importing tagger →
  `@app/app/metadata/id3/tagger`; importing `../shared/types` → `@shared/types`

> Note: `library/`, `transforms/`, `workers/` don't move, but their imports of
> moved targets **and** their `../shared/*` imports are rewritten to the aliases
> too. Their files stay in place; only import lines change.

## Wiring changes (4 files)

1. **`tsconfig.node.json`** — add `baseUrl` + `paths` to `compilerOptions`
   (typecheck:node covers main/preload/shared). `baseUrl: "./src"` keeps `src`
   out of the path values:
   ```jsonc
   "baseUrl": "./src",
   "paths": {
     "@shared/*": ["shared/*"],
     "@app/*":    ["main/*"]
   }
   ```

2. **`electron.vite.config.ts`** — add `resolve.alias` to the **`main`** block
   (where the reorganized code is bundled); `resolve` from `path` is already
   imported. (The vite/vitest alias targets are real on-disk paths, so they do
   contain `src` — that constraint is only about the tsconfig `paths` values.)
   ```ts
   main: {
     resolve: { alias: { '@shared': resolve('src/shared'), '@app': resolve('src/main') } },
     plugins: [ensureBetterSqlite3ElectronAbi()]
   },
   ```
   (`preload` keeps relative `../shared` imports — untouched; renderer keeps
   `@renderer`.)

3. **`vitest.config.ts`** (NEW, repo root) — alias only, so all vitest defaults
   (include glob, node env, esbuild jsx) are preserved:
   ```ts
   import { resolve } from 'node:path'
   import { defineConfig } from 'vitest/config'
   export default defineConfig({
     resolve: { alias: {
       '@shared': resolve(__dirname, 'src/shared'),
       '@app': resolve(__dirname, 'src/main'),
       '@renderer': resolve(__dirname, 'src/renderer/src')
     } }
   })
   ```

4. **`tsconfig.web.json`** — no change (renderer/shared don't reference the new
   aliases).

## Execution steps (only after approval)

1. Write a throwaway codemod `reorg-main.mjs` that:
   - holds the move map above (+ auto-pairs `<name>.test.ts`, + the 2 specials);
   - resolves every relative specifier against the current tree, maps the target
     through the move map, and re-emits it per the alias rule;
   - `git mv`s each moved file (preserves history), then writes rewritten
     contents to all processed `src/main` files.
2. Add the 4 wiring changes above.
3. **Verify (evidence required before claiming done):**
   - `pnpm typecheck` → 0 errors (node + web).
   - `pnpm test` → full suite green (baseline 135 files / 770 tests).
   - `pnpm lint` → clean.
   - `pnpm build` → electron-vite bundles main from `index.ts` with aliases.
4. Delete `reorg-main.mjs`.
5. Commit: `refactor(main): nest modules under app/ + add @app/@shared aliases`
   (no version bump). Stay on `master` (no new branch).

Pure move + import rewrite + alias config. No behavior changes; fully reversible
via git.
