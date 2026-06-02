import AppKit

extension Array {
    /// Bounds-checked subscript — returns nil instead of trapping.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

/// Observable state for one menu level (one panel). Selection is shared between mouse
/// hover and keyboard navigation so both drive the same highlight. Row frames (captured
/// by the view) let the controller anchor a submenu flyout to the selected row.
@MainActor
final class LevelModel: ObservableObject {
    let level: Int
    let items: [MenuItemDTO]
    @Published var selected: Int?
    /// Row frame in `.global` (hosting-view top-left space), keyed by item index.
    var rowFrames: [Int: CGRect] = [:]

    init(level: Int, items: [MenuItemDTO]) {
        self.level = level
        self.items = items
    }

    func isSelectable(_ i: Int) -> Bool {
        guard let it = items[safe: i] else { return false }
        return it.type != "separator" && (it.enabled ?? true)
    }

    var firstSelectable: Int? { items.indices.first(where: isSelectable) }

    /// Next selectable index in `delta` direction, wrapping and skipping separators /
    /// disabled rows. From no selection, Down lands on the first row, Up on the last.
    func step(from current: Int?, by delta: Int) -> Int? {
        let n = items.count
        guard n > 0 else { return nil }
        var i = current ?? (delta > 0 ? -1 : n)
        for _ in 0..<n {
            i += delta
            if i < 0 { i = n - 1 } else if i >= n { i = 0 }
            if isSelectable(i) { return i }
        }
        return current
    }
}
