import AppKit
import SwiftUI

/// Hosting view that accepts the first click into a non-key window. Our panel is a
/// non-activating, non-key panel, so without this AppKit treats the first click as a
/// window-activation click and swallows it — menu items would intermittently ignore taps.
private final class FirstMouseHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Owns the panel stack (root + submenu flyouts) and bridges the async JS call to a
/// SwiftUI selection. Single-flight: a second popup() dismisses the first.
@MainActor
final class ContextMenuController {
    static let shared = ContextMenuController()

    private var panels: [NSPanel] = []
    private var levels: [LevelModel] = []
    /// Screen rect each open submenu is attached to, keyed by level — avoids reopening
    /// the same flyout on every hover tick.
    private var attachRects: [Int: CGRect] = [:]
    /// Debounced close so moving the pointer toward a flyout (across sibling rows) does
    /// not snap it shut — the "safe triangle" approximation.
    private var pendingClose: Task<Void, Never>?
    private var continuation: CheckedContinuation<String?, Never>?
    private var monitors: [Any] = []

    func present(items: [MenuItemDTO], anchor: Anchor) async -> String? {
        dismiss(selecting: nil)
        return await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            self.continuation = cont
            if NSApp.isActive == false {
                if #available(macOS 14.0, *) { NSApp.activate() } else {
                    NSApp.activate(ignoringOtherApps: true)
                }
            }
            self.openMenu(items: items, level: 0, anchor: anchor, attach: nil)
            self.installMonitors()
        }
    }

    // MARK: - Panel construction

    private func openMenu(items: [MenuItemDTO], level: Int, anchor: Anchor?, attach: CGRect?) {
        if level < panels.count, attachRects[level] == attach, attach != nil { return }
        cancelPendingClose()
        closePanels(fromLevel: level)

        let model = LevelModel(level: level, items: items)

        // Cap height to the screen; if the natural content is taller, the view scrolls.
        let screen = (anchor.map(screenFor) ?? NSScreen.main)
        let maxH = (screen?.visibleFrame.height ?? 900) - 16
        let natural = measure(model: model, maxHeight: maxH)
        let scrolls = natural.height > maxH
        let size = NSSize(width: natural.width, height: min(natural.height, maxH))

        let view = ContextMenuView(
            model: model,
            maxHeight: maxH,
            scrolls: scrolls,
            onActivate: { [weak self] index in self?.activate(level: level, index: index) },
            onHover: { [weak self] index in self?.hover(level: level, index: index) },
            onFrames: { frames in model.rowFrames = frames }
        )

        let hosting = FirstMouseHostingView(rootView: view)
        hosting.translatesAutoresizingMaskIntoConstraints = false

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
        levels.append(model)
        attachRects[level] = attach
        panel.orderFrontRegardless()
    }

    /// Natural content size of a level (non-scroll), used to decide scrolling + width.
    private func measure(model: LevelModel, maxHeight: CGFloat) -> NSSize {
        let probe = NSHostingView(
            rootView: ContextMenuView(
                model: model, maxHeight: maxHeight, scrolls: false,
                onActivate: { _ in }, onHover: { _ in }, onFrames: { _ in }
            )
        )
        probe.layoutSubtreeIfNeeded()
        return probe.fittingSize
    }

    private func closePanels(fromLevel level: Int) {
        while panels.count > level {
            panels.removeLast().orderOut(nil)
            levels.removeLast()
            attachRects[panels.count] = nil
        }
    }

    // MARK: - Interaction

    private func activate(level: Int, index: Int) {
        guard let model = levels[safe: level], let item = model.items[safe: index] else { return }
        if let sub = item.submenu, !sub.isEmpty {
            openSubmenu(parentLevel: level, index: index, focusFirst: true)
        } else {
            dismiss(selecting: item.id)
        }
    }

    private func hover(level: Int, index: Int) {
        guard let model = levels[safe: level], let item = model.items[safe: index] else { return }
        cancelPendingClose()
        model.selected = index
        if let sub = item.submenu, !sub.isEmpty {
            openSubmenu(parentLevel: level, index: index, focusFirst: false)
        } else {
            scheduleClose(fromLevel: level + 1)
        }
    }

    private func openSubmenu(parentLevel: Int, index: Int, focusFirst: Bool) {
        guard
            let parentPanel = panels[safe: parentLevel],
            let parentModel = levels[safe: parentLevel],
            let sub = parentModel.items[safe: index]?.submenu, !sub.isEmpty
        else { return }
        let rect = screenRect(topLeft: parentModel.rowFrames[index] ?? .zero, panel: parentPanel)
        openMenu(items: sub, level: parentLevel + 1, anchor: nil, attach: rect)
        if focusFirst, let child = levels[safe: parentLevel + 1] {
            child.selected = child.firstSelectable
        }
    }

    // MARK: - Positioning

    private func frameAtAnchor(_ anchor: Anchor, size: NSSize) -> NSRect {
        let screen = screenFor(anchor)
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let flippedY = (screen?.frame.maxY ?? visible.maxY) - anchor.y
        var origin = NSPoint(x: anchor.x, y: flippedY - size.height)
        origin.x = min(max(origin.x, visible.minX), visible.maxX - size.width)
        origin.y = min(max(origin.y, visible.minY), visible.maxY - size.height)
        return NSRect(origin: origin, size: size)
    }

    private func frameForFlyout(_ attach: CGRect, size: NSSize) -> NSRect {
        let visible = (NSScreen.screens.first { $0.frame.intersects(attach) } ?? NSScreen.main)?
            .visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let overlap: CGFloat = 4
        var x = attach.maxX - overlap
        if x + size.width > visible.maxX { x = attach.minX - size.width + overlap }
        x = min(max(x, visible.minX), visible.maxX - size.width)
        var y = attach.maxY - size.height
        y = min(max(y, visible.minY), visible.maxY - size.height)
        return NSRect(x: x, y: y, width: size.width, height: size.height)
    }

    private func screenFor(_ anchor: Anchor) -> NSScreen? {
        if let id = anchor.screenId,
           let match = NSScreen.screens.first(where: { $0.deviceDescription[
               NSDeviceDescriptionKey("NSScreenNumber")] as? Int == id }) {
            return match
        }
        let point = NSPoint(x: anchor.x, y: anchor.y)
        return NSScreen.screens.first { $0.frame.contains(point) } ?? NSScreen.main
    }

    private func screenRect(topLeft rect: CGRect, panel: NSPanel) -> CGRect {
        guard let content = panel.contentView else { return rect }
        let h = content.bounds.height
        let bottomLeft = CGRect(x: rect.minX, y: h - rect.maxY, width: rect.width, height: rect.height)
        let inWindow = content.convert(bottomLeft, to: nil)
        return panel.convertToScreen(inWindow)
    }

    // MARK: - Safe-triangle close delay

    private func scheduleClose(fromLevel level: Int) {
        guard panels.count > level else { return }
        cancelPendingClose()
        pendingClose = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 180_000_000)
            if Task.isCancelled { return }
            self?.closePanels(fromLevel: level)
        }
    }

    private func cancelPendingClose() {
        pendingClose?.cancel()
        pendingClose = nil
    }

    // MARK: - Keyboard

    /// Handle a key for the deepest open level. Returns true if consumed.
    private func handleKey(_ keyCode: UInt16) -> Bool {
        guard let model = levels.last else { return false }
        switch keyCode {
        case 53: dismiss(selecting: nil) // esc
        case 125: model.selected = model.step(from: model.selected, by: 1) // down
        case 126: model.selected = model.step(from: model.selected, by: -1) // up
        case 124: // right → open submenu
            if let s = model.selected { openSubmenu(parentLevel: model.level, index: s, focusFirst: true) }
        case 123: // left → close submenu back to parent
            if model.level > 0 { cancelPendingClose(); closePanels(fromLevel: model.level) }
        case 36, 76: // return / enter
            if let s = model.selected { activate(level: model.level, index: s) }
        default: return false
        }
        return true
    }

    // MARK: - Monitors / dismiss

    private func installMonitors() {
        let mouse: NSEvent.EventTypeMask = [.leftMouseDown, .rightMouseDown, .otherMouseDown]

        let local = NSEvent.addLocalMonitorForEvents(matching: mouse) { [weak self] event in
            guard let self else { return event }
            if self.panels.contains(where: { $0 === event.window }) { return event }
            self.dismiss(selecting: nil)
            // Pass right-clicks through so a fresh context menu can open immediately;
            // consume left/other clicks like a standard menu.
            return event.type == .rightMouseDown ? event : nil
        }

        let key = NSEvent.addLocalMonitorForEvents(matching: [.keyDown]) { [weak self] event in
            (self?.handleKey(event.keyCode) ?? false) ? nil : event
        }

        let global = NSEvent.addGlobalMonitorForEvents(matching: mouse) { [weak self] _ in
            Task { @MainActor in self?.dismiss(selecting: nil) }
        }

        monitors = [local, key, global].compactMap { $0 }
    }

    private func dismiss(selecting id: String?) {
        cancelPendingClose()
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
