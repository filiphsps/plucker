import AppKit
import SwiftUI

/// Owns the panel stack (root + submenu flyouts) and bridges the async JS call to a
/// SwiftUI selection. Single-flight: a second popup() dismisses the first.
@MainActor
final class ContextMenuController {
    static let shared = ContextMenuController()

    private var panels: [NSPanel] = []
    /// Screen rect each open submenu is attached to, keyed by its level — used to avoid
    /// reopening the same flyout on every hover tick.
    private var attachRects: [Int: CGRect] = [:]
    private var continuation: CheckedContinuation<String?, Never>?
    private var monitors: [Any] = []

    /// Show the panel at `anchor` and resolve with the chosen item id (or nil on dismiss).
    func present(items: [MenuItemDTO], anchor: Anchor) async -> String? {
        dismiss(selecting: nil)
        return await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            self.continuation = cont
            // Right-clicking a background window should bring our app forward, like a
            // normal macOS app — the non-activating panel alone won't do this.
            if NSApp.isActive == false {
                if #available(macOS 14.0, *) {
                    NSApp.activate()
                } else {
                    NSApp.activate(ignoringOtherApps: true)
                }
            }
            self.openMenu(items: items, level: 0, anchor: anchor, attach: nil)
            self.installDismissMonitors()
        }
    }

    // MARK: - Panel construction

    /// Open (or replace) the menu panel at `level`. Level 0 is positioned at `anchor`
    /// (the cursor); deeper levels at `attach` (the parent row's screen rect).
    private func openMenu(items: [MenuItemDTO], level: Int, anchor: Anchor?, attach: CGRect?) {
        // If this exact flyout is already open, leave it be (avoids hover flicker).
        if level < panels.count, attachRects[level] == attach, attach != nil { return }
        closePanels(fromLevel: level)

        let root = ContextMenuView(
            items: items,
            level: level,
            onSelect: { [weak self] id in self?.dismiss(selecting: id) },
            onHoverRow: { [weak self] lvl, frame, submenu in
                guard let self, lvl < self.panels.count else { return }
                if let submenu {
                    let rect = self.screenRect(topLeft: frame, panel: self.panels[lvl])
                    self.openMenu(items: submenu, level: lvl + 1, anchor: nil, attach: rect)
                } else {
                    self.closePanels(fromLevel: lvl + 1)
                }
            }
        )

        let hosting = NSHostingView(rootView: root)
        hosting.translatesAutoresizingMaskIntoConstraints = false
        let size = hosting.fittingSize

        let effect = NSVisualEffectView()
        effect.material = .menu
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.wantsLayer = true
        effect.layer?.cornerRadius = 10
        effect.layer?.cornerCurve = .continuous
        effect.layer?.masksToBounds = true
        effect.frame = NSRect(origin: .zero, size: size)
        effect.addSubview(hosting)
        NSLayoutConstraint.activate([
            hosting.leadingAnchor.constraint(equalTo: effect.leadingAnchor),
            hosting.trailingAnchor.constraint(equalTo: effect.trailingAnchor),
            hosting.topAnchor.constraint(equalTo: effect.topAnchor),
            hosting.bottomAnchor.constraint(equalTo: effect.bottomAnchor)
        ])

        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .popUpMenu
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.acceptsMouseMovedEvents = true
        panel.contentView = effect

        let frame = anchor != nil
            ? frameAtAnchor(anchor!, size: size)
            : frameForFlyout(attach ?? .zero, size: size)
        panel.setFrame(frame, display: true)

        panels.append(panel)
        attachRects[level] = attach
        panel.orderFrontRegardless()
    }

    private func closePanels(fromLevel level: Int) {
        while panels.count > level {
            panels.removeLast().orderOut(nil)
            attachRects[panels.count] = nil
        }
    }

    // MARK: - Positioning

    /// Cursor-anchored frame (level 0). Flips JS top-left Y to AppKit bottom-left and
    /// clamps to the target screen.
    private func frameAtAnchor(_ anchor: Anchor, size: NSSize) -> NSRect {
        let screen = screen(for: anchor) ?? NSScreen.main
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let flippedY = (screen?.frame.maxY ?? visible.maxY) - anchor.y
        var origin = NSPoint(x: anchor.x, y: flippedY - size.height)
        origin.x = min(max(origin.x, visible.minX), visible.maxX - size.width)
        origin.y = min(max(origin.y, visible.minY), visible.maxY - size.height)
        return NSRect(origin: origin, size: size)
    }

    /// Flyout frame (level > 0): to the right of the parent row, top-aligned, flipping
    /// to the left if it would overflow the screen.
    private func frameForFlyout(_ attach: CGRect, size: NSSize) -> NSRect {
        let visible = (NSScreen.screens.first { $0.frame.intersects(attach) } ?? NSScreen.main)?
            .visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let overlap: CGFloat = 4
        var x = attach.maxX - overlap
        if x + size.width > visible.maxX { x = attach.minX - size.width + overlap }
        x = min(max(x, visible.minX), visible.maxX - size.width)
        // Top of the flyout aligns with the top of the parent row.
        var y = attach.maxY - size.height
        y = min(max(y, visible.minY), visible.maxY - size.height)
        return NSRect(x: x, y: y, width: size.width, height: size.height)
    }

    private func screen(for anchor: Anchor) -> NSScreen? {
        if let id = anchor.screenId,
           let match = NSScreen.screens.first(where: { $0.deviceDescription[
               NSDeviceDescriptionKey("NSScreenNumber")] as? Int == id }) {
            return match
        }
        let point = NSPoint(x: anchor.x, y: anchor.y)
        return NSScreen.screens.first { $0.frame.contains(point) } ?? NSScreen.main
    }

    /// Convert a SwiftUI top-left rect (from `.global` within a panel's hosting view)
    /// into screen coordinates (AppKit bottom-left origin).
    private func screenRect(topLeft rect: CGRect, panel: NSPanel) -> CGRect {
        guard let content = panel.contentView else { return rect }
        let h = content.bounds.height
        let bottomLeft = CGRect(x: rect.minX, y: h - rect.maxY, width: rect.width, height: rect.height)
        let inWindow = content.convert(bottomLeft, to: nil)
        return panel.convertToScreen(inWindow)
    }

    // MARK: - Dismiss

    private func installDismissMonitors() {
        let mouse: NSEvent.EventTypeMask = [.leftMouseDown, .rightMouseDown, .otherMouseDown]

        let local = NSEvent.addLocalMonitorForEvents(matching: mouse) { [weak self] event in
            guard let self else { return event }
            if self.panels.contains(where: { $0 === event.window }) { return event }
            self.dismiss(selecting: nil)
            return nil
        }

        let key = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak self] event in
            guard let self else { return event }
            if event.keyCode == 53 { // Escape
                self.dismiss(selecting: nil)
                return nil
            }
            return event
        }

        let global = NSEvent.addGlobalMonitorForEvents(matching: mouse) { [weak self] _ in
            Task { @MainActor in self?.dismiss(selecting: nil) }
        }

        monitors = [local, key, global].compactMap { $0 }
    }

    private func dismiss(selecting id: String?) {
        for monitor in monitors { NSEvent.removeMonitor(monitor) }
        monitors.removeAll()
        closePanels(fromLevel: 0)
        attachRects.removeAll()
        if let cont = continuation {
            continuation = nil
            cont.resume(returning: id)
        }
    }
}
