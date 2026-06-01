// Renders screenshots of the real built Electron app and writes them to
// .github/img/. Used to keep the README / store images in sync with the UI.
//
// Pipeline:
//   1. Require a prior `pnpm build` (out/main/index.js must exist).
//   2. Build a throwaway HOME dir and seed deterministic fixtures into it:
//        - $HOME/.plucker/config.json            (settings + history)
//        - $HOME/Library/Application Support/Plucker/metadata-cache/*  (cache view)
//      Cover-art JPEGs are generated on the fly with Playwright Chromium so no
//      binary blobs live in the repo.
//   3. Launch the built app with env.HOME pointed at that dir (Playwright's
//      Electron driver), then screenshot each view via Chrome DevTools — works
//      headless on CI, no OS screen-grab needed.
//
// Run locally:  pnpm build:screenshots   (after `pnpm build`)
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import NodeID3 from 'node-id3'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAIN = join(ROOT, 'out', 'main', 'index.js')
const OUT_DIR = join(ROOT, '.github', 'img')
// Window is created at 900x670 (see src/main/index.ts). Match it so screenshots
// frame the whole UI with no scrollbars.
const VIEWPORT = { width: 900, height: 670 }

if (!existsSync(MAIN)) {
  console.error(`screenshots: ${relative(ROOT, MAIN)} missing — run \`pnpm build\` first.`)
  process.exit(1)
}

// A throwaway HOME so the app reads our fixtures, never the developer's real config.
//   - $HOME/.plucker/config.json  → settings + history (resolved via os.homedir()/$HOME)
//   - USERDATA/metadata-cache     → cache view. Electron derives userData from the
//     *native* home dir on macOS (not $HOME), so $HOME alone doesn't redirect it —
//     we pin it explicitly with the --user-data-dir switch instead.
//   - $HOME/Music/Plucker         → real (empty) files so downloaded tracks don't
//     render as "File missing".
const HOME = join(ROOT, 'node_modules', '.screenshots-home')
const USERDATA = join(HOME, 'userdata')
const MUSIC_DIR = join(HOME, 'Music', 'Plucker')

// --- Fixtures ---------------------------------------------------------------

// Stable hashes shared between the history entries and the seeded metadata cache,
// so the cache view shows cover art for the same tracks.
const TRACKS = [
  {
    hash: 'a1b2c3d4e5f6a1b2',
    title: 'Anti-Hero',
    artist: 'Taylor Swift',
    album: 'Midnights',
    year: '2022',
    cover: ['#ff9ff3', '#2d3a7d']
  },
  {
    hash: 'b2c3d4e5f6a1b2c3',
    title: 'City of Stars',
    artist: 'Ella Langely',
    album: 'Neon Nights',
    year: '2023',
    cover: ['#ffb347', '#1a1a2e']
  },
  {
    hash: 'c3d4e5f6a1b2c3d4',
    title: 'Heart Like a Truck',
    artist: 'Lainey Wilson',
    album: 'Bell Bottom Country',
    year: '2022',
    cover: ['#f4a261', '#264653']
  },
  {
    hash: 'd4e5f6a1b2c3d4e5',
    title: 'Jag kommer',
    artist: 'Veronica Maggio',
    album: 'Satan i gatan',
    year: '2011',
    cover: ['#6d597a', '#355070']
  },
  {
    hash: 'e5f6a1b2c3d4e5f6',
    title: 'Hole in the Bottle',
    artist: 'Kelsea Ballerini',
    album: 'Ballerini',
    year: '2020',
    cover: ['#8ecae6', '#023047']
  }
]

// Display path for settings (downloads.baseFolder); the real seeded files live in MUSIC_DIR.
const MUSIC_DISPLAY = '~/Music/Plucker'

/** Absolute on-disk path for a track's mp3 within a job folder. */
function trackFile(folder, t) {
  return join(folder, `${t.artist} - ${t.title}.mp3`)
}

function historyTrack(folder, t, status = 'done') {
  return {
    title: `${t.artist} – ${t.title}`,
    status,
    file: status === 'done' ? trackFile(folder, t) : undefined,
    artist: t.artist,
    album: t.album,
    year: t.year,
    hash: t.hash,
    ...(status === 'failed' ? { reason: 'Video unavailable', errorCode: '1' } : {})
  }
}

const FOLDERS = {
  electronica: join(MUSIC_DIR, 'Late Night Electronica'),
  ambient: join(MUSIC_DIR, 'Ambient Focus'),
  single: MUSIC_DIR
}

const config = {
  version: 2,
  language: 'en',
  history: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      url: 'https://www.youtube.com/playlist?list=PLelectronica',
      title: 'Late Night Electronica',
      folder: FOLDERS.electronica,
      kind: 'playlist',
      completedAt: '2026-05-30T22:14:05.000Z',
      outcome: 'completed',
      tracks: TRACKS.map((t) => historyTrack(FOLDERS.electronica, t))
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      url: 'https://www.youtube.com/playlist?list=PLambient',
      title: 'Ambient Focus',
      folder: FOLDERS.ambient,
      kind: 'playlist',
      completedAt: '2026-05-28T09:41:00.000Z',
      outcome: 'partial',
      tracks: [
        historyTrack(FOLDERS.ambient, TRACKS[2]),
        historyTrack(FOLDERS.ambient, TRACKS[4]),
        historyTrack(FOLDERS.ambient, TRACKS[1], 'failed')
      ]
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'Single track',
      folder: FOLDERS.single,
      kind: 'video',
      completedAt: '2026-05-27T18:03:00.000Z',
      outcome: 'completed',
      tracks: [historyTrack(FOLDERS.single, TRACKS[0])]
    }
  ],
  downloads: { baseFolder: MUSIC_DISPLAY, perPlaylistSubfolder: true },
  audio: { format: 'mp3', preferredBitrate: 320, minBitrate: null, sampleRate: null },
  cookies: { source: 'auto' },
  transforms: [
    {
      instanceId: 'auto-tag-default',
      type: 'auto-tag',
      enabled: true,
      config: {
        primarySource: 'youtube',
        enrichWithMusicBrainz: true,
        fetchCoverArt: true,
        fetchGenre: true,
        fetchTrackNumber: true,
        minMatchScore: 80
      }
    },
    {
      instanceId: 'rename-default',
      type: 'rename',
      enabled: true,
      config: { template: '{artist} - {track}. {title} - {album} ({year})' }
    }
  ],
  performance: { parallel: 4, compressionLevel: 7, concurrentFragments: 4, priority: 'normal' },
  updates: { checkOnLaunch: true },
  developer: { console: false }
}

// --- Active-download fixture (download view) --------------------------------
// A deterministic in-flight job. Rather than running a real download (network +
// yt-dlp + ffmpeg, non-deterministic), we inject a synthetic `job:progress` IPC
// event — a "fake download" — so the download screenshot is byte-identical every
// run. The job's completed tracks get real files with embedded cover art (so they
// render thumbnails); the downloading/queued ones have no file yet, as in real life.
const DL_FOLDER = join(MUSIC_DIR, 'Discover Weekly')
const DL_URL =
  'https://youtube.com/playlist?list=PLMd3i1Rgjn9n22i-FkGc9V_WSbd2QZA7c&si=8itVtn1fORyDLIdr'

// The three completed tracks (with cover art) live in DL_FOLDER.
const DL_DONE = TRACKS.slice(0, 3)
// Queued tracks that haven't started — no file/cover yet.
const DL_QUEUED_EXTRA = [
  'Aphex Twin – Avril 14th',
  'Brian Eno – An Ending (Ascent)',
  'Sigur Rós – Svefn-g-englar',
  'Bonobo – Kerala'
]

const downloadProgress = {
  jobTitle: 'Discover Weekly',
  url: DL_URL,
  folder: DL_FOLDER,
  total: DL_DONE.length + 1 + 1 + DL_QUEUED_EXTRA.length,
  overall: 0.41,
  tracks: [
    ...DL_DONE.map((t, i) => ({
      index: i + 1,
      title: `${t.artist} – ${t.title}`,
      status: 'done',
      percent: 100,
      file: trackFile(DL_FOLDER, t),
      artist: t.artist,
      album: t.album,
      year: t.year,
      hash: t.hash,
      elapsedMs: 38000 + i * 4200
    })),
    {
      index: 4,
      title: `${TRACKS[3].artist} – ${TRACKS[3].title}`,
      status: 'downloading',
      percent: 47,
      speedBytesPerSec: 3_400_000,
      stage: 'downloading',
      artist: TRACKS[3].artist,
      album: TRACKS[3].album,
      year: TRACKS[3].year
    },
    {
      index: 5,
      title: `${TRACKS[4].artist} – ${TRACKS[4].title}`,
      status: 'queued'
    },
    ...DL_QUEUED_EXTRA.map((title, i) => ({ index: 6 + i, title, status: 'queued' }))
  ]
}

/** Render a diagonal-gradient cover with the track title as a JPEG buffer. */
async function makeCover(browser, t) {
  const [c1, c2] = t.cover
  const page = await browser.newPage({
    viewport: { width: 600, height: 600 },
    deviceScaleFactor: 1
  })
  const html =
    `<!doctype html><html><body style="margin:0"><div style="width:600px;height:600px;` +
    `background:linear-gradient(135deg,${c1},${c2});display:flex;align-items:flex-end;` +
    `font-family:system-ui;color:#fff;padding:40px;box-sizing:border-box;font-size:40px;` +
    `font-weight:700;text-shadow:0 2px 12px rgba(0,0,0,.4)">${t.artist}<br>${t.title}</div></body></html>`
  await page.setContent(html)
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 })
  await page.close()
  return buf
}

async function seedFixtures(browser) {
  rmSync(HOME, { recursive: true, force: true })

  // Render each track's cover once; reused for the embedded ID3 art and the cache jpg.
  const covers = new Map()
  for (const t of TRACKS) covers.set(t.hash, await makeCover(browser, t))
  const byHash = new Map(TRACKS.map((t) => [t.hash, t]))

  const pluckerDir = join(HOME, '.plucker')
  mkdirSync(pluckerDir, { recursive: true })
  writeFileSync(join(pluckerDir, 'config.json'), JSON.stringify(config, null, 2))

  // Create real files for every downloaded track so they don't render as "File
  // missing" (the renderer probes existence via files:exist). Embedding ID3 art
  // with NodeID3 also gives them a real cover — track rows read the cover from the
  // file's APIC frame when the file exists, only falling back to the cache by hash.
  // Create an empty file and embed the track's cover art (APIC frame) so rows show it.
  const writeTrackFile = (file, t) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '')
    NodeID3.write(
      {
        title: t.title,
        artist: t.artist,
        album: t.album,
        year: t.year,
        image: {
          mime: 'image/jpeg',
          type: { id: 3 },
          description: 'Front Cover',
          imageBuffer: covers.get(t.hash)
        }
      },
      file
    )
  }

  for (const entry of config.history) {
    for (const tr of entry.tracks) {
      if (tr.file) writeTrackFile(tr.file, byHash.get(tr.hash))
    }
  }
  // The active-download fixture's completed tracks (download view).
  for (const t of DL_DONE) writeTrackFile(trackFile(DL_FOLDER, t), t)

  // metadata-cache lives under the pinned userData dir (see --user-data-dir below).
  const cacheDir = join(USERDATA, 'metadata-cache')
  mkdirSync(cacheDir, { recursive: true })
  for (const t of TRACKS) {
    const entry = {
      audio: { codec: 'mp3', bitrateKbps: 320, sampleRateHz: 44100, sizeBytes: 8_500_000 },
      mb: { artist: t.artist, title: t.title, album: t.album, year: t.year, genre: 'Electronic' },
      track: { title: `${t.artist} – ${t.title}`, file: trackFile(FOLDERS.electronica, t) },
      updatedAt: '2026-05-30T22:14:05.000Z'
    }
    writeFileSync(join(cacheDir, `${t.hash}.json`), JSON.stringify(entry))
    writeFileSync(join(cacheDir, `${t.hash}.cover.jpg`), covers.get(t.hash))
  }
}

// --- Capture ----------------------------------------------------------------

/** Launch Chromium/Electron, installing the Playwright browser on first use if missing. */
async function withPlaywright(fn) {
  let pw
  try {
    pw = await import('playwright')
  } catch (err) {
    throw err
  }
  try {
    return await fn(pw)
  } catch (err) {
    if (!/Executable doesn't exist|playwright install/i.test(String(err))) throw err
    console.log('screenshots: Playwright browser missing — installing…')
    execFileSync('node', ['node_modules/playwright/cli.js', 'install', 'chromium'], {
      stdio: 'inherit'
    })
    return await fn(pw)
  }
}

async function capture(pw) {
  const chromium = await pw.chromium.launch()
  await seedFixtures(chromium)
  await chromium.close()

  const app = await pw._electron.launch({
    // --user-data-dir pins Electron's userData (and thus the metadata cache) to our
    // fixture dir; $HOME alone wouldn't redirect it on macOS.
    args: [MAIN, `--user-data-dir=${USERDATA}`],
    // PLUCKER_SCREENSHOT makes the main process show the window without activating
    // it (showInactive), so generating images never steals focus / pops to front.
    env: { ...process.env, HOME, NODE_ENV: 'production', PLUCKER_SCREENSHOT: '1' }
  })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize(VIEWPORT)
    await page.waitForLoadState('domcontentloaded')
    // Wait for the header (and thus the app shell + i18n) to be ready.
    await page
      .getByRole('button', { name: 'History' })
      .waitFor({ state: 'visible', timeout: 20_000 })
    // Fonts + cover art + accent color settle.
    await page.waitForTimeout(800)

    // Park the pointer far outside the viewport so nothing is ever hovered — clicks
    // used for navigation otherwise leave a :hover state (and tooltips) on the
    // button under the cursor, which would leak into the shot.
    const clearHover = () => page.mouse.move(VIEWPORT.width + 200, VIEWPORT.height + 200)
    await clearHover()

    mkdirSync(OUT_DIR, { recursive: true })
    const shot = async (name) => {
      await clearHover()
      await page.waitForTimeout(150)
      const dest = join(OUT_DIR, `${name}.png`)
      await page.screenshot({ path: dest })
      console.log(`screenshots: wrote ${relative(ROOT, dest)}`)
    }

    // Capture the idle views first so the active-download transport deck (a global
    // bar, injected below) doesn't bleed into them.
    await page.getByRole('button', { name: 'History' }).click()
    await page.waitForTimeout(400)
    await shot('history')

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.waitForTimeout(400)
    await shot('settings')

    await page.getByRole('button', { name: 'Open cache' }).click()
    await page.waitForTimeout(600)
    await shot('cache')

    // Download view, captured last: seed a deterministic in-flight job by sending a
    // synthetic job:progress event from the main process (the "fake download"), and
    // fill the URL bar to match. The renderer reacts exactly as it would to a real
    // download — track list + transport deck — but it's identical every run.
    await page.getByRole('button', { name: 'Download' }).click()
    await page.waitForTimeout(300)
    await page.getByPlaceholder(/playlist/i).fill(DL_URL)
    await app.evaluate(({ BrowserWindow }, payload) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('job:progress', payload)
    }, downloadProgress)
    // Rows + cover art render synchronously off the injected state and local files.
    // (Can't wait on row text — inactive views stay mounted, so titles aren't unique.)
    await page.waitForTimeout(900)
    await shot('download')
  } finally {
    await app.close()
    rmSync(HOME, { recursive: true, force: true })
  }
}

withPlaywright(capture).catch((err) => {
  console.error('screenshots: failed —', err)
  rmSync(HOME, { recursive: true, force: true })
  process.exit(1)
})
