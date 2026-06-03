// Shared node-gyp build helpers for the pnpm-patched better-sqlite3, used by both
// `scripts/ensure-better-sqlite3-abi.mjs` (the dev/test ABI guard) and
// `scripts/build-better-sqlite3-universal.mjs` (the packaging fat-binary builder).
//
// Why from source (never the upstream prebuilt): our pnpm V8-compat source patch
// (`patches/better-sqlite3.patch`) is REQUIRED for any runtime with
// NODE_MODULE_VERSION ≥ 146 (Electron 42 = ABI 146, Node 26 = ABI 147) and is only baked
// in when the binary is compiled FROM SOURCE. The published prebuilts are unpatched: they
// open a `:memory:` DB fine yet corrupt memory on the patched code paths under real use.
//
// Why we drive node-gyp against the *resolved* module: the dep is
// pnpm-`patchedDependencies`-patched, so the copy the app loads is the `…_patch_hash=…`
// virtual-store dir. `electron-builder install-app-deps` (@electron/rebuild) rebuilds the
// *unpatched* store dir instead and never touches the patched copy. So we compile the
// resolved (patched) module directly.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { globSync, realpathSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/** Repo root (this file lives in `scripts/lib/`). */
export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Realpath of the *resolved* (pnpm-patched) better-sqlite3 module dir — the copy the app loads. */
export function resolveModuleDir() {
  return realpathSync(dirname(require.resolve('better-sqlite3/package.json')))
}

/** Probe the installed binary against the *current* (Node) ABI. */
export function probe() {
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

/** A from-source node-gyp build leaves `build/Release/sqlite3.a` (the compiled SQLite static lib);
 *  `prebuild-install` drops *only* `better_sqlite3.node`. That artifact distinguishes our patched
 *  from-source binary from an unpatched upstream prebuild — which loads & opens a `:memory:` DB
 *  fine (so `probe()` returns 'node') yet SIGSEGVs on the patched code paths under real use. */
export function isFromSourceBuild() {
  return existsSync(join(resolveModuleDir(), 'build', 'Release', 'sqlite3.a'))
}

/** node-gyp is a transitive dep, so under pnpm it isn't hoisted to the root node_modules —
 *  locate its CLI in the virtual store (any installed version builds the same). */
export function resolveNodeGyp() {
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
 *  headers/ABI and CPU `arch` (defaults to the host arch; pass 'x64'/'arm64' to cross-compile).
 *  Compiling from source bakes in our V8-compat patch.
 *
 *  We wipe `build/` before each attempt and retry once on failure: a switch between targets leaves
 *  the other runtime's build (or a prebuild-install) in `build/`, and `node-gyp rebuild` over that
 *  residue can intermittently fail on the first compile (make mkdir's the per-object `.deps/` dir
 *  right before clang writes its `…o.d.raw` dep file → transient "No such file or directory"). A
 *  from-source build of a *clean* `build/` is reliable, so start clean and give a flaky compile one
 *  more shot. */
export function rebuildFromSource({ runtime, arch = process.arch, logPrefix = '[ensure-abi]' }) {
  const moduleDir = resolveModuleDir()
  const buildDir = join(moduleDir, 'build')
  const args = [resolveNodeGyp(), 'rebuild', '--release', `--arch=${arch}`]
  let label
  if (runtime === 'electron') {
    const electronVersion = require('electron/package.json').version
    args.push(`--target=${electronVersion}`, '--dist-url=https://electronjs.org/headers')
    label = `Electron ${electronVersion} (${arch})`
  } else {
    // node-gyp defaults to the running Node's headers/ABI — exactly what Vitest will load under.
    label = `Node ${process.versions.node} (${arch})`
  }
  console.log(`${logPrefix} compiling better-sqlite3 from source for ${label}…`)
  const maxAttempts = 2
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    rmSync(buildDir, { recursive: true, force: true }) // clear prebuild/partial-build residue
    try {
      execFileSync(process.execPath, args, { cwd: moduleDir, stdio: 'inherit' })
      return
    } catch (err) {
      if (attempt === maxAttempts) throw err
      console.warn(`${logPrefix} build attempt ${attempt} failed; cleaning and retrying…`)
    }
  }
}
