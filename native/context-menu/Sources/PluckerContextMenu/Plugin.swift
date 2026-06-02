import AppKit
import Foundation
import NodeAPI

// The JS boundary is intentionally simple: two JSON strings in, an optional id out.
// This mirrors the existing `menu:popup` IPC contract (resolve with the clicked item
// id, or null on dismiss) so the native panel drops in behind the same seam, with the
// Electron `Menu` left as the fallback on the JS side.

/// One serialized menu entry. Matches `MenuItemDescriptor` on the JS side.
struct MenuItemDTO: Decodable {
    var id: String?
    var label: String?
    var type: String?       // "normal" | "separator"
    var role: String?       // copy/cut/paste/... (handled JS-side for now)
    var enabled: Bool?
    var accelerator: String?
    /// SF Symbol name to render as the leading icon (optional, native-only).
    var symbol: String?
    /// Nested submenu; opens as a flyout panel on hover.
    var submenu: [MenuItemDTO]?
}

/// Where to anchor the panel, in screen coordinates (top-left origin from the JS side).
struct Anchor: Decodable {
    var x: Double
    var y: Double
    var screenId: Int?
}

#NodeModule(exports: [
    // Lets the JS layer feature-detect without throwing.
    "isAvailable": true,

    // popup(itemsJSON, anchorJSON) -> Promise<string | null>
    "popup": try NodeFunction { (itemsJSON: String, anchorJSON: String) async throws -> String? in
        let items = try JSONDecoder().decode([MenuItemDTO].self, from: Data(itemsJSON.utf8))
        let anchor = try JSONDecoder().decode(Anchor.self, from: Data(anchorJSON.utf8))
        return await ContextMenuController.shared.present(items: items, anchor: anchor)
    },

    // symbolPNG(name, pointSize) -> string | null  (base64-encoded PNG, or null if the
    // symbol name is unknown). Synchronous: it runs on the Electron main thread, which is
    // also the AppKit main thread, so the application menu can render icons inline at
    // build time without an async hop.
    "symbolPNG": try NodeFunction { (name: String, pointSize: Double) throws -> String? in
        SymbolRenderer.png(name: name, pointSize: pointSize)?.base64EncodedString()
    }
])
