// electron-builder afterPack hook.
//
// electron-builder renames the macOS Helper bundles (folder, CFBundleExecutable
// and CFBundleDisplayName) to match productName, but it leaves each helper's
// CFBundleName as the upstream "Electron Helper (...)". That stale value surfaces
// in places that read CFBundleName (e.g. some system prompts / Activity Monitor
// groupings), so we rewrite it here to match the display name.
//
// Wired via `afterPack` in electron-builder.yml. No-op on non-macOS targets.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const PLIST_BUDDY = '/usr/libexec/PlistBuddy'

function plistGet(plist, key) {
  try {
    return execFileSync(PLIST_BUDDY, ['-c', `Print :${key}`, plist], {
      encoding: 'utf8'
    }).trim()
  } catch {
    return undefined
  }
}

function plistSet(plist, key, value) {
  execFileSync(PLIST_BUDDY, ['-c', `Set :${key} ${value}`, plist])
}

/** @param {import('electron-builder').AfterPackContext} context */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const productName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${productName}.app`)
  const frameworks = join(appPath, 'Contents', 'Frameworks')

  let helpers
  try {
    helpers = readdirSync(frameworks).filter((name) => /Helper.*\.app$/.test(name))
  } catch {
    return
  }

  for (const helper of helpers) {
    const plist = join(frameworks, helper, 'Contents', 'Info.plist')
    // Prefer the already-correct display name; fall back to the bundle folder name.
    const target = plistGet(plist, 'CFBundleDisplayName') ?? helper.replace(/\.app$/, '')
    const current = plistGet(plist, 'CFBundleName')
    if (current === target) continue
    plistSet(plist, 'CFBundleName', target)
    console.log(`  • afterPack: CFBundleName "${current}" -> "${target}" (${helper})`)
  }
}
