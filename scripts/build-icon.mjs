// Renders the app icon from the React document in src/icon/ and writes the PNG(s)
// and macOS asset(s) that electron-builder (packaging) and the main process
// (runtime) consume.
//
// Pipeline:
//   1. Hash src/icon/** and compare to build/.icon-hash. If unchanged and every
//      output already exists, skip — this makes it cheap to run on every build.
//   2. Bundle src/icon/ with Vite (→ node_modules/.icon-dist).
//   3. Open each theme in headless Chromium (Playwright) and screenshot #root
//      twice: a full-bleed master and a pre-shaped squircle (?shape=mask).
//        - The squircle PNG (build/<theme.output>) becomes the legacy .icns that
//          macOS 13–25 use, where the OS does NOT mask icons itself.
//        - The full-bleed master feeds Icon Composer for macOS 26 (step 4).
//   4. macOS only: author build/Icon.icon from the default theme's full-bleed
//      master and compile it to build/Assets.car with `actool` (Xcode 26+).
//      macOS 26 renders this as a Liquid Glass icon and applies its own mask;
//      older macOS ignores it and falls back to the .icns. Skipped (with the
//      legacy .icns still shipped) when actool 26+ is unavailable — e.g. on CI
//      Linux or an older Xcode. electron-builder embeds the result via
//      mac.extraResources + CFBundleIconName (see electron-builder.yml).
//   5. Sync the default theme's squircle PNG to resources/icon.png (runtime
//      window icon on Windows/Linux; the macOS dock uses the bundle icon).
//   6. Write the new hash only after everything succeeds.
//
// Runs as the first step of `pnpm build` (see package.json). Re-run manually:
//   pnpm build:icon
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  statSync,
  rmSync,
  watch as watchFs
} from 'node:fs'
import { dirname, join, relative, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICON_DIR = join(ROOT, 'src', 'icon')
const DIST_DIR = join(ROOT, 'node_modules', '.icon-dist')
const BUILD_DIR = join(ROOT, 'build')
const HASH_FILE = join(BUILD_DIR, '.icon-hash')
// The running app loads its icon from resources/icon.png (see src/main/index.ts).
const RUNTIME_ICON = join(ROOT, 'resources', 'icon.png')
// Full-bleed (unmasked) renders kept aside as the Icon Composer source for macOS 26.
const MASTER_DIR = join(BUILD_DIR, '.icon-master')
// Icon Composer document + compiled asset catalog for macOS 26 Liquid Glass icons.
const ICON_DOC = join(BUILD_DIR, 'Icon.icon')
const ASSET_CAR = join(BUILD_DIR, 'Assets.car')
const SIZE = 1024

const themes = JSON.parse(readFileSync(join(ICON_DIR, 'src', 'themes.json'), 'utf8'))
const defaultTheme = themes[0]

/** Every file this build is expected to (re)produce. */
const outputs = [...themes.map((t) => join(BUILD_DIR, t.output)), RUNTIME_ICON]

/** Recursively collect file paths under `dir`, relative to `dir`, sorted. */
function listFiles(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = join(dir, entry.name)
      return entry.isDirectory() ? listFiles(full, base) : [relative(base, full)]
    })
    .sort()
}

/** Content hash over src/icon/** — deterministic, order-independent, mtime-agnostic. */
function hashSources() {
  const hash = createHash('sha256')
  for (const rel of listFiles(ICON_DIR)) {
    hash.update(rel)
    hash.update(readFileSync(join(ICON_DIR, rel)))
  }
  return hash.digest('hex')
}

function isUpToDate(sourceHash) {
  if (!existsSync(HASH_FILE)) return false
  if (readFileSync(HASH_FILE, 'utf8').trim() !== sourceHash) return false
  return outputs.every((f) => existsSync(f) && statSync(f).size > 0)
}

async function bundle() {
  const { build } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const { default: tailwindcss } = await import('@tailwindcss/vite')
  await build({
    root: ICON_DIR,
    base: './',
    logLevel: 'warn',
    // tailwindcss() processes the `@import 'tailwindcss'` in the app's index.css
    // (imported by src/icon/src/main.tsx) so the icon can use the same utilities
    // and design tokens as the renderer.
    plugins: [react(), tailwindcss()],
    build: { outDir: DIST_DIR, emptyOutDir: true }
  })
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml'
}

/** Serve DIST_DIR over http — Chromium blocks ES-module/CSS loads over file://. */
function serveDist() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const rel = normalize(path === '/' ? 'index.html' : path.replace(/^\/+/, ''))
    const file = join(DIST_DIR, rel)
    // Contain requests to DIST_DIR.
    if (!file.startsWith(DIST_DIR) || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

/**
 * Launch Chromium, downloading the browser on first use if it isn't installed yet
 * (the icon is generated, not committed, so a fresh clone won't have it). On Linux
 * the OS libraries also need to be present — CI installs them with `--with-deps`.
 */
async function launchChromium(chromium) {
  try {
    return await chromium.launch()
  } catch (err) {
    if (!/Executable doesn't exist|playwright install/i.test(String(err))) throw err
    console.log('icon: Playwright Chromium missing — installing…')
    execFileSync('node', ['node_modules/playwright/cli.js', 'install', 'chromium'], {
      stdio: 'inherit'
    })
    return await chromium.launch()
  }
}

/** Screenshot one theme into `dest`. `masked` clips to the squircle (transparent corners). */
async function shoot(browser, port, themeId, masked, dest) {
  const page = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1
  })
  try {
    const query = new URLSearchParams({ theme: themeId })
    if (masked) query.set('shape', 'mask')
    await page.goto(`http://127.0.0.1:${port}/index.html?${query}`)
    await page.waitForFunction('window.__ICON_READY__ === true', { timeout: 15000 })
    mkdirSync(dirname(dest), { recursive: true })
    await page.locator('#root').screenshot({ path: dest, omitBackground: masked })
  } finally {
    await page.close()
  }
}

async function capture() {
  const { chromium } = await import('playwright')
  const server = await serveDist()
  const { port } = server.address()
  const browser = await launchChromium(chromium)
  mkdirSync(MASTER_DIR, { recursive: true })
  try {
    for (const theme of themes) {
      // Full-bleed master — the Icon Composer / macOS 26 source.
      const master = join(MASTER_DIR, `${theme.id}.png`)
      await shoot(browser, port, theme.id, false, master)
      // Pre-shaped squircle — the legacy .icns source for macOS 13–25.
      const dest = join(BUILD_DIR, theme.output)
      await shoot(browser, port, theme.id, true, dest)
      console.log(`icon: wrote ${relative(ROOT, dest)} (${theme.id}, squircle + full-bleed master)`)
    }
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
}

/** "#0d0e11" → "extended-srgb:0.051,0.055,0.067,1.0" for the Icon Composer fill. */
function hexToExtendedSrgb(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  if (!m) return 'extended-srgb:0,0,0,1.0'
  const [r, g, b] = m.slice(1).map((c) => (parseInt(c, 16) / 255).toFixed(3))
  return `extended-srgb:${r},${g},${b},1.0`
}

/**
 * Author build/Icon.icon — an Icon Composer document wrapping the full-bleed
 * master as a single opaque layer. macOS 26 masks and adds Liquid Glass; the
 * solid fill behind the layer only shows if the art ever gains transparency.
 */
function writeIconDocument(masterPng) {
  const assets = join(ICON_DOC, 'Assets')
  rmSync(ICON_DOC, { recursive: true, force: true })
  mkdirSync(assets, { recursive: true })
  copyFileSync(masterPng, join(assets, 'icon.png'))
  const doc = {
    fill: { 'automatic-gradient': hexToExtendedSrgb(defaultTheme.bg) },
    groups: [{ layers: [{ 'image-name': 'icon.png' }] }],
    'supported-platforms': { circles: ['watchOS'], squares: ['iOS', 'macOS'] }
  }
  writeFileSync(join(ICON_DOC, 'icon.json'), JSON.stringify(doc, null, 2) + '\n')
}

/** actool's marketing version (e.g. 26) from its plist, or null if unavailable. */
function actoolMajorVersion() {
  try {
    const out = execFileSync('xcrun', ['actool', '--version'], { encoding: 'utf8' })
    const v = /<key>short-bundle-version<\/key>\s*<string>([\d.]+)<\/string>/.exec(out)
    return v ? parseInt(v[1], 10) : null
  } catch {
    return null
  }
}

/**
 * Compile build/Icon.icon → build/Assets.car for macOS 26 Liquid Glass icons.
 * No-op (returns false) off macOS or without Xcode 26's actool — the legacy
 * .icns still ships, so older macOS and pre-26 build hosts degrade cleanly.
 * The actool incantation mirrors electron/packager#1806.
 */
function buildAssetCatalog() {
  if (process.platform !== 'darwin') {
    console.log('icon: not macOS — skipping macOS 26 asset catalog (legacy .icns only)')
    return false
  }
  const major = actoolMajorVersion()
  if (!major || major < 26) {
    console.log(`icon: actool ${major ?? 'missing'} (<26) — skipping macOS 26 asset catalog`)
    rmSync(ASSET_CAR, { force: true })
    return false
  }
  const outDir = join(BUILD_DIR, '.icon-car')
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  execFileSync(
    'xcrun',
    [
      'actool',
      ICON_DOC,
      '--compile',
      outDir,
      '--output-format',
      'human-readable-text',
      '--notices',
      '--warnings',
      '--output-partial-info-plist',
      join(outDir, 'partial.plist'),
      '--app-icon',
      'Icon',
      '--include-all-app-icons',
      '--enable-on-demand-resources',
      'NO',
      '--development-region',
      'en',
      '--target-device',
      'mac',
      '--minimum-deployment-target',
      '26.0',
      '--platform',
      'macosx'
    ],
    { stdio: 'inherit' }
  )
  copyFileSync(join(outDir, 'Assets.car'), ASSET_CAR)
  rmSync(outDir, { recursive: true, force: true })
  console.log(`icon: wrote ${relative(ROOT, ASSET_CAR)} (macOS 26 Liquid Glass)`)
  return true
}

async function runBuild({ force = false } = {}) {
  const sourceHash = hashSources()
  if (!force && isUpToDate(sourceHash)) {
    console.log('icon: up to date, skipping render')
    return
  }
  console.log('icon: sources changed, rendering…')
  await bundle()
  await capture()

  // macOS 26 Liquid Glass icon from the default theme's full-bleed master.
  writeIconDocument(join(MASTER_DIR, `${defaultTheme.id}.png`))
  buildAssetCatalog()

  // Runtime window icon (Win/Linux) = the default theme's pre-shaped squircle.
  mkdirSync(dirname(RUNTIME_ICON), { recursive: true })
  copyFileSync(join(BUILD_DIR, defaultTheme.output), RUNTIME_ICON)
  console.log(`icon: synced ${relative(ROOT, RUNTIME_ICON)} from ${defaultTheme.id}`)

  mkdirSync(BUILD_DIR, { recursive: true })
  writeFileSync(HASH_FILE, sourceHash + '\n')
}

/**
 * Re-render whenever anything under src/icon/ changes. Debounced, and never
 * overlaps a render with the next one (a change mid-build queues one rebuild).
 * Build errors are logged but never kill the watcher.
 */
async function watch() {
  // Dev mode ignores the .icon-hash short-circuit: every save re-renders, even
  // if the hash happens to match what's on disk.
  await runBuild({ force: true }).catch((err) => console.error('icon: build failed —', err))
  console.log(
    `icon: watching ${relative(ROOT, ICON_DIR)} — edit and save to re-render (Ctrl+C to stop)`
  )

  let timer = null
  let building = false
  let queued = false
  const rebuild = () => {
    if (building) {
      queued = true
      return
    }
    building = true
    runBuild({ force: true })
      .catch((err) => console.error('icon: build failed —', err))
      .finally(() => {
        building = false
        if (queued) {
          queued = false
          rebuild()
        }
      })
  }

  watchFs(ICON_DIR, { recursive: true }, () => {
    clearTimeout(timer)
    timer = setTimeout(rebuild, 150)
  })
}

if (process.argv.includes('--watch')) {
  watch()
} else {
  runBuild().catch((err) => {
    console.error('icon: build failed —', err)
    process.exit(1)
  })
}
