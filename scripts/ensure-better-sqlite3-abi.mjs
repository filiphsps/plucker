// better-sqlite3 is a native (node-gyp) module, so its compiled binary is ABI-specific,
// and this repo serves two runtimes from one node_modules:
//   • the app runs under Electron, and
//   • Vitest runs the unit tests under plain Node (a different ABI).
//
// Two wrinkles make this trickier than a plain rebuild:
//   1. better-sqlite3 ships NO prebuilt for our Electron version, so the Electron binary has
//      to be compiled from source — which also bakes in our pnpm V8-compat source patch
//      (`patches/better-sqlite3.patch`). The Node side, by contrast, has a prebuilt.
//   2. Because the dep is pnpm-`patchedDependencies`-patched, the copy the app actually
//      loads is the `…_patch_hash=…` virtual-store dir. `electron-builder install-app-deps`
//      (@electron/rebuild) rebuilds the *unpatched* `better-sqlite3@x` store dir instead and
//      never touches the patched copy — so it silently leaves the loaded binary at the Node
//      ABI and the app crashes under Electron. This guard therefore drives node-gyp against
//      the *resolved* (patched) module directly.
//
// It keeps the binary matched to whatever is about to run it:
//   `pretest`             → `--target node`     (re-fetch the Node prebuild if needed)
//   `predev` / `prestart` → `--target electron` (compile for Electron if the binary is a Node build)
//
// The probe short-circuits when the binary already matches, so the watch/TDD and dev loops
// stay quick; the from-source Electron compile is paid only when switching test → app.
import { createRequire } from 'node:module'
import { execSync, execFileSync } from 'node:child_process'
import { globSync, realpathSync, rmSync } from 'node:fs'
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

/** Compile the *resolved* (pnpm-patched) better-sqlite3 from source against Electron's
 *  headers/ABI. No Electron prebuild exists for this version, so this is always a from-source
 *  build — which is what compiles in our V8-compat patch for the loaded copy.
 *
 *  We wipe `build/` before each attempt and retry once on failure. The prior `pretest`
 *  leaves a Node prebuild-install in `build/`, and `node-gyp rebuild` run over that residue
 *  can intermittently fail on the first compile — make's `do_cmd` mkdir's the per-object
 *  `.deps/` dir right before clang writes its `…o.d.raw` dep file, so a transient hiccup
 *  there surfaces as "error opening …o.d.raw: No such file or directory" and aborts the dev
 *  launch. A from-source build of a *clean* `build/` is reliable, so start clean every time
 *  and give a flaky compile one more shot before giving up. */
function rebuildForElectron() {
  const electronVersion = require('electron/package.json').version
  const moduleDir = realpathSync(dirname(require.resolve('better-sqlite3/package.json')))
  const buildDir = join(moduleDir, 'build')
  const args = [
    resolveNodeGyp(),
    'rebuild',
    '--release',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    '--dist-url=https://electronjs.org/headers'
  ]
  console.log(`[ensure-abi] compiling better-sqlite3 from source for Electron ${electronVersion}…`)
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
  // 'other' (an Electron build) → prebuild-install sees the ABI mismatch and re-fetches the
  // Node prebuild; an already-Node binary is a no-op. 'missing' likewise re-fetches.
  if (state !== 'node') {
    console.log('[ensure-abi] rebuilding better-sqlite3 for the Node test runtime…')
    execSync('pnpm rebuild better-sqlite3', { stdio: 'inherit' })
  }
} else if (target === 'electron') {
  // Only the Node-ABI (or missing) cases need work; an 'other' ABI is already an Electron
  // build. A fresh install or Electron upgrade is covered too — it lands here as state !== 'other'.
  if (state === 'node' || state === 'missing') {
    rebuildForElectron()
  }
} else {
  throw new Error(`ensure-abi: unknown --target "${target}" (expected node|electron)`)
}
