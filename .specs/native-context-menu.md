# Native SwiftUI Context Menu

## Goal

Replace Plucker's text-only macOS context menu with a **fully customizable SwiftUI
panel** (album-art thumbnails, custom colors/fonts, hover previews, inline controls),
rendered natively and anchored at the cursor. Behaviour must feel like a real context
menu: instant, anchored, dismiss-on-outside-click, no app-switch flicker.

## Background: what exists today

The current menu is **already a native macOS `NSMenu`**, not a webview menu:

- `src/renderer/src/ui/context-menu.ts` — serializes `MenuItem[]` (stripping `onClick`)
  into a `MenuDescriptor`, sends it over IPC `menu:popup`, runs the chosen handler.
- `src/main/context-menu.ts` — rebuilds it with Electron `Menu.buildFromTemplate().popup()`.
- `src/preload/*` — exposes `popupMenu(descriptor): Promise<string | null>`.

The seam is async and returns the clicked id (or `null` on dismiss). The native panel
slots in **behind this exact seam** — no consumer changes (`track-row-menu.ts` etc.).

### Key constraint that shaped the design

SwiftUI's `.contextMenu { }` compiles to an `NSMenu` on macOS — it is **not** more
customizable than the Electron menu. Full customization therefore is **not** a context
menu in the OS sense; it is a **borderless `NSPanel` hosting a SwiftUI view** at
pop-up-menu window level.

## Decisions

- **Scope:** full custom SwiftUI panel (not just icons on the native menu).
- **Mechanism:** in-process **`node-swift`** N-API addon (pure Swift, no Obj-C++ shim).
  In-process chosen over a helper exe for correct focus, cursor anchoring, and no
  app-switch flicker.
- **OS support:** macOS 13 (Ventura) → latest, **progressively enhanced**.

## macOS version matrix (progressive enhancement)

Deployment target = macOS 13.0. One SwiftUI view; chrome/animation tier resolved at
runtime via `if #available`. A `ContextMenuStyle` resolver picks the richest tier the
running OS supports.

| macOS | Background / chrome | Enhancements |
|---|---|---|
| 13 Ventura (floor) | `NSVisualEffectView` `.menu`/`.popover` material; manual rounded corners + shadow | static SF Symbols, standard controls |
| 14 Sonoma | same material | animated SF Symbols (`.symbolEffect`), `.scrollClipDisabled` |
| 15 Sequoia | same material | `@Entry`, refined hover/selection, mesh-gradient accents |
| 26 (Liquid Glass) | `.glassEffect(in:)` / `GlassEffectContainer` | `glassEffectID` morphing, full Liquid Glass styling |

> Liquid Glass symbol names (`glassEffect`, `GlassEffectContainer`, `glassEffectID`)
> are recent — confirm against the installed SDK at build time.

## Package layout

`native/` as a pnpm workspace package (add `native/*` to `pnpm-workspace.yaml`):

```
native/
  context-menu/
    package.json        # @plucker/native-context-menu, "main": index.js
    Package.swift       # node-swift target; platforms: [.macOS(.v13)]
    Sources/ContextMenu/
      Plugin.swift           # N-API exports
      ContextMenuPanel.swift # borderless NSPanel + NSHostingView
      ContextMenuView.swift  # SwiftUI content
      ContextMenuStyle.swift # if #available tier resolver
    index.js            # loads built .node, exposes popup(items, anchor)
    index.d.ts
```

## Native API contract

`popup(items: MenuItemDescriptor[], anchor: { x: number; y: number; screenId?: number })
: Promise<string | null>`

- Shows the panel on the main thread at the cursor anchor.
- Resolves with the clicked item id, or `null` on outside-click / Esc.
- Mirrors today's `menu:popup` so the Electron `Menu` path remains the fallback.

## Integration & fallback

**Status: wired (flag-gated, default off).** The seam now carries a cursor anchor and
prefers the native panel when enabled, falling back to the Electron menu otherwise.

Done:
- `src/shared/context-menu.ts` — added `MenuAnchor { x, y, screenId? }`.
- `src/renderer/src/ui/context-menu.ts` — capture-phase `contextmenu`/`pointerdown`
  listeners track the cursor in screen coords; `showContextMenu(items, anchor?)`
  forwards it (no per-call-site changes needed across the 8 sites).
- `src/preload/index.ts` — `popupMenu(descriptor, anchor?)`.
- `src/main/context-menu.ts` — `menu:popup` handler awaits `loadNativeMenu()` and, when
  available + anchor present, calls `native.popup()`; **any failure falls back** to
  `Menu.popup`. Gated behind `PLUCKER_NATIVE_MENU=1` + macOS. The addon import specifier
  is kept opaque to the bundler (`['@plucker','native-context-menu'].join('/')` +
  `/* @vite-ignore */`) so it stays an optional runtime dependency — the app build does
  not depend on the addon being present.

- `@plucker/native-context-menu` added to root `dependencies` (`workspace:*`); pnpm
  symlinks it into `node_modules/@plucker/`. Verified it resolves + loads via the main
  process's ESM dynamic import (with CJS-default interop in `loadNativeMenu`).

Remaining (packaging only — needs a real electron-builder run, can't verify headlessly):
- The addon emits `.build/Module.node`, but the rest of SwiftPM's `.build/` (checkouts,
  intermediates) is large and must NOT be packed. Either copy the `.node` to a clean
  dir (e.g. `prebuilds/`) and point `index.js` there, or scope electron-builder `files`
  to just the `.node` + `asarUnpack` it. Confirm builder traces the pnpm symlink.
- A packaged run to validate focus, anchoring, and outside-click dismiss inside
  Electron's run loop (dev validation is enough to iterate on the SwiftUI design).

## Distribution / build

- `asarUnpack` the built `.node`.
- Build for arm64 **and** x64 (existing `build:mac` already does both arches).
- `postinstall` runs `electron-builder install-app-deps` (covers local rebuild); confirm
  it rebuilds the workspace native package against Electron's ABI, else add a prebuild step.
- Currently ships unsigned DMGs — no notarization blocker, but verify the `.node` lands
  in both arch builds.

## Open questions

- Prebuilt binaries vs build-from-source on install (CI build matrix for arm64+x64).
- Exact SwiftUI content spec (which items get thumbnails / previews / inline controls).
- Keyboard nav + accessibility parity with the native menu.

## Suggested build order

1. Spike the SwiftUI panel look standalone (validate design + Liquid Glass tier).
2. Scaffold `native/context-menu` as a node-swift addon; minimal `popup()` returning ids.
3. Wire behind `menu:popup` with Electron fallback; thread cursor anchor through the seam.
4. Layer the progressive-enhancement style tiers.
5. CI: arm64 + x64 build/prebuild of the addon.
