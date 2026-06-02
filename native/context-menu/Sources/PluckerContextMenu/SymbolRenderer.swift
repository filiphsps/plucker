import AppKit

/// Renders an SF Symbol into PNG bytes (monochrome glyph on a transparent background)
/// so the Electron main process can wrap it in a `NativeImage` and use it as an
/// application-menu icon. macOS-only; must be called on the main thread (which, in the
/// Electron main process, is also the AppKit main thread — the sync JS boundary keeps us
/// there). Returns nil for unknown symbol names so the JS side can fall back to no icon.
enum SymbolRenderer {
    /// PNG data for `name` at `pointSize`, rendered @2x for retina crispness. The glyph
    /// is forced opaque black; the JS layer marks the resulting NativeImage as a template
    /// image so macOS recolors it for light/dark menus automatically.
    static func png(name: String, pointSize: Double) -> Data? {
        let config = NSImage.SymbolConfiguration(pointSize: CGFloat(pointSize), weight: .regular)
        guard
            let symbol = NSImage(systemSymbolName: name, accessibilityDescription: nil),
            let configured = symbol.withSymbolConfiguration(config)
        else { return nil }

        let size = configured.size
        guard size.width > 0, size.height > 0 else { return nil }

        let scale = 2.0
        guard
            let rep = NSBitmapImageRep(
                bitmapDataPlanes: nil,
                pixelsWide: Int((size.width * scale).rounded()),
                pixelsHigh: Int((size.height * scale).rounded()),
                bitsPerSample: 8,
                samplesPerPixel: 4,
                hasAlpha: true,
                isPlanar: false,
                colorSpaceName: .deviceRGB,
                bytesPerRow: 0,
                bitsPerPixel: 0
            )
        else { return nil }
        rep.size = size

        guard let ctx = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = ctx
        let rect = NSRect(origin: .zero, size: size)
        configured.draw(in: rect)
        // Tint the drawn glyph solid black while preserving its alpha, so the PNG is a
        // clean template mask regardless of the symbol's intrinsic color.
        NSColor.black.set()
        rect.fill(using: .sourceAtop)
        NSGraphicsContext.restoreGraphicsState()

        return rep.representation(using: .png, properties: [:])
    }
}
