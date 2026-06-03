// better-sqlite3 is a native (node-gyp) module, so its compiled binary is ABI-specific,
// and this repo serves two runtimes from one node_modules:
//   • the app runs under Electron, and
//   • Vitest runs the unit tests under plain Node (a different ABI).
//
// This guard keeps the installed binary matched to whatever is about to run it, always
// compiled from the pnpm-patched source (see scripts/lib/better-sqlite3-build.mjs for the
// from-source / patched-module rationale):
//   `pretest`             → `--target node`     (compile against the current Node's ABI)
//   `predev` / `prestart` → `--target electron` (compile against Electron's headers/ABI)
//
// The probe short-circuits when the binary already matches, so the watch/TDD and dev loops
// stay quick; the from-source compile is paid only when switching test ↔ app.
//
// (Packaging a *universal* fat binary for the macOS DMGs is a separate concern — see
// scripts/build-better-sqlite3-universal.mjs.)
import { probe, isFromSourceBuild, rebuildFromSource } from './lib/better-sqlite3-build.mjs'

const target = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : 'node'

const state = probe()

if (target === 'node') {
  // 'other' (an Electron build) or 'missing' both need a from-source Node build; so does a binary
  // that loads as 'node' but isn't our from-source build — that's the unpatched prebuilt, which
  // passes the trivial probe yet SIGSEGVs under real use. We compile rather than `prebuild-install`
  // for exactly that reason. An already-patched from-source binary is a no-op.
  if (state !== 'node' || !isFromSourceBuild()) {
    rebuildFromSource({ runtime: 'node' })
  }
} else if (target === 'electron') {
  // Only the Node-ABI (or missing) cases need work; an 'other' ABI is already an Electron
  // build. A fresh install or Electron upgrade is covered too — it lands here as state !== 'other'.
  if (state === 'node' || state === 'missing') {
    rebuildFromSource({ runtime: 'electron' })
  }
} else {
  throw new Error(`ensure-abi: unknown --target "${target}" (expected node|electron)`)
}
