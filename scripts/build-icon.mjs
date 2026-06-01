// Renders the app icon from the React document in src/icon/ and writes the PNG(s)
// that electron-builder (packaging) and the main process (runtime) consume.
//
// Pipeline:
//   1. Hash src/icon/** and compare to build/.icon-hash. If unchanged and every
//      output already exists, skip — this makes it cheap to run on every build.
//   2. Bundle src/icon/ with Vite (→ node_modules/.icon-dist).
//   3. Open each theme in headless Chromium (Playwright) and screenshot #root.
//   4. Sync the default theme's PNG to resources/icon.png (runtime app/dock icon).
//   5. Write the new hash only after everything succeeds.
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

async function capture() {
  const { chromium } = await import('playwright')
  const server = await serveDist()
  const { port } = server.address()
  const browser = await launchChromium(chromium)
  try {
    for (const theme of themes) {
      const page = await browser.newPage({
        viewport: { width: SIZE, height: SIZE },
        deviceScaleFactor: 1
      })
      await page.goto(`http://127.0.0.1:${port}/index.html?theme=${encodeURIComponent(theme.id)}`)
      await page.waitForFunction('window.__ICON_READY__ === true', { timeout: 15000 })
      const dest = join(BUILD_DIR, theme.output)
      mkdirSync(dirname(dest), { recursive: true })
      await page.locator('#root').screenshot({ path: dest })
      await page.close()
      console.log(`icon: wrote ${relative(ROOT, dest)} (${theme.id})`)
    }
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
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

  // Runtime/dock icon = the default theme's output.
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
