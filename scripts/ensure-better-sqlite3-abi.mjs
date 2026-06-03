// better-sqlite3 is a native (node-gyp) module, so its compiled binary is ABI-specific,
// and this repo serves two runtimes from one node_modules:
//   • the app runs under Electron, and
//   • Vitest runs the unit tests under plain Node (a different ABI).
//
// Two wrinkles make this trickier than a plain rebuild:
//   1. Our pnpm V8-compat source patch (`patches/better-sqlite3.patch`) is REQUIRED for any
//      runtime with NODE_MODULE_VERSION ≥ 146 — that's both Electron 42 (ABI 146) AND our
//      pinned Node 26 (ABI 147) — and it is only baked in when the binary is compiled FROM
//      SOURCE. better-sqlite3's published prebuilts are unpatched: `prebuild-install` (the
//      package's own install step) yields a binary that *opens a trivial `:memory:` DB fine*
//      yet corrupts memory on the patched code paths under real use — it survives on macOS
//      arm64 but SIGSEGVs on CI's linux-x64. So we never trust the prebuilt for EITHER
//      runtime: `--target node` and `--target electron` both compile from source.
//   2. Because the dep is pnpm-`patchedDependencies`-patched, the copy the app actually
//      loads is the `…_patch_hash=…` virtual-store dir. `electron-builder install-app-deps`
//      (@electron/rebuild) rebuilds the *unpatched* `better-sqlite3@x` store dir instead and
//      never touches the patched copy — so it silently leaves the loaded binary wrong. This
//      guard therefore drives node-gyp against the *resolved* (patched) module directly.
//
// It keeps the binary matched to whatever is about to run it, always from the patched source:
//   `pretest`             → `--target node`     (compile against the current Node's ABI)
//   `predev` / `prestart` → `--target electron` (compile against Electron's headers/ABI)
//
// The probe short-circuits when the binary already matches, so the watch/TDD and dev loops
// stay quick; the from-source compile is paid only when switching test ↔ app.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { globSync, realpathSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : 'node'

/** Probe the installed binary against the *current* (Node) ABI. */
function probe() {
  try {
    const Database = require('better-sqlite3')
    new Database(':memory:').close()
    return 'node' // loads under Node → it's a Node-ABI build
  } catch (err) {
    const message = String(err?.message ?? err)
    if (/NODE_MODULE_VERSION/.test(message)) return 'other' // built for a different (Electron) ABI
    if (/Could not locate the bindings file|did not self-register/.test(message)) return 'missing'
    throw err
  }
}

/** A from-source node-gyp build leaves `build/Release/sqlite3.a` (the compiled SQLite static lib,
 *  plus an `obj.target/` tree) next to the addon; `prebuild-install` drops *only*
 *  `better_sqlite3.node`. That artifact therefore distinguishes our patched from-source binary
 *  from an unpatched upstream prebuild — which matters because the prebuild loads and opens a
 *  `:memory:` DB fine (so `probe()` returns 'node') yet SIGSEGVs on the patched code paths under
 *  real use. Without this check, a prebuild left by `pnpm install` would slip past unrebuilt. */
function isFromSourceBuild() {
  const moduleDir = realpathSync(dirname(require.resolve('better-sqlite3/package.json')))
  return existsSync(join(moduleDir, 'build', 'Release', 'sqlite3.a'))
}

/** node-gyp is a transitive dep, so under pnpm it isn't hoisted to the root node_modules —
 *  locate its CLI in the virtual store (any installed version builds the same). */
function resolveNodeGyp() {
  const matches = globSync('node_modules/.pnpm/node-gyp@*/node_modules/node-gyp/bin/node-gyp.js', {
    cwd: projectRoot
  })
  if (matches.length === 0) {
    throw new Error('ensure-abi: node-gyp not found under node_modules/.pnpm — run `pnpm install`')
  }
  matches.sort() // deterministic pick; trailing entry sorts highest
  return join(projectRoot, matches[matches.length - 1])
}

/** Compile the *resolved* (pnpm-patched) better-sqlite3 from source against the target runtime's
 *  headers/ABI — the running Node's own (node-gyp's default) or Electron's. Compiling from source
 *  is what bakes our V8-compat patch into the loaded copy; the upstream prebuilt is unpatched and
 *  unsafe under NODE_MODULE_VERSION ≥ 146 (see the header), so both runtimes build from source.
 *
 *  We wipe `build/` before each attempt and retry once on failure. A switch between targets leaves
 *  the other runtime's build (or a prebuild-install) in `build/`, and `node-gyp rebuild` run over
 *  that residue can intermittently fail on the first compile — make's `do_cmd` mkdir's the
 *  per-object `.deps/` dir right before clang writes its `…o.d.raw` dep file, so a transient hiccup
 *  there surfaces as "error opening …o.d.raw: No such file or directory" and aborts the launch. A
 *  from-source build of a *clean* `build/` is reliable, so start clean every time and give a flaky
 *  compile one more shot before giving up. */
function rebuildFromSource(runtime) {
  const moduleDir = realpathSync(dirname(require.resolve('better-sqlite3/package.json')))
  const buildDir = join(moduleDir, 'build')
  const args = [resolveNodeGyp(), 'rebuild', '--release', `--arch=${process.arch}`]
  let label
  if (runtime === 'electron') {
    const electronVersion = require('electron/package.json').version
    args.push(`--target=${electronVersion}`, '--dist-url=https://electronjs.org/headers')
    label = `Electron ${electronVersion}`
  } else {
    // node-gyp defaults to the running Node's headers/ABI — exactly what Vitest will load under.
    label = `Node ${process.versions.node}`
  }
  console.log(`[ensure-abi] compiling better-sqlite3 from source for ${label}…`)
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    rmSync(buildDir, { recursive: true, force: true }) // clear prebuild/partial-build residue
    try {
      execFileSync(process.execPath, args, { cwd: moduleDir, stdio: 'inherit' })
      return
    } catch (err) {
      if (attempt === maxAttempts) throw err
      console.warn(`[ensure-abi] build attempt ${attempt} failed; cleaning and retrying…`)
    }
  }
}

const state = probe()

if (target === 'node') {
  // 'other' (an Electron build) or 'missing' both need a from-source Node build; so does a binary
  // that loads as 'node' but isn't our from-source build — that's the unpatched prebuilt, which
  // passes the trivial probe yet SIGSEGVs under real use (see the header). We compile rather than
  // `prebuild-install` for exactly that reason. An already-patched from-source binary is a no-op.
  if (state !== 'node' || !isFromSourceBuild()) {
    rebuildFromSource('node')
  }
} else if (target === 'electron') {
  // Only the Node-ABI (or missing) cases need work; an 'other' ABI is already an Electron
  // build. A fresh install or Electron upgrade is covered too — it lands here as state !== 'other'.
  if (state === 'node' || state === 'missing') {
    rebuildFromSource('electron')
  }
} else {
  throw new Error(`ensure-abi: unknown --target "${target}" (expected node|electron)`)
}
