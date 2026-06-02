import AppKit
import SwiftUI

/// Collects each row's frame (in `.global`, i.e. the hosting view's top-left space) so
/// the controller can anchor a submenu flyout to the hovered row.
private struct RowFramesKey: PreferenceKey {
    static var defaultValue: [Int: CGRect] = [:]
    static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}

/// The menu content for one level. The translucent backing is the NSVisualEffectView in
/// ContextMenuController; this view stays transparent so the vibrancy shows through.
struct ContextMenuView: View {
    let items: [MenuItemDTO]
    let level: Int
    let onSelect: (String?) -> Void
    /// Fired when a row is hovered: (level, row frame in `.global`, the row's submenu).
    let onHoverRow: (Int, CGRect, [MenuItemDTO]?) -> Void

    @State private var hoveredIndex: Int?
    @State private var rowFrames: [Int: CGRect] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if item.type == "separator" {
                    Divider().padding(.vertical, 4)
                } else {
                    row(item, index: index)
                }
            }
        }
        .padding(5)
        .frame(minWidth: 220, alignment: .leading)
        .fixedSize()
        .onPreferenceChange(RowFramesKey.self) { rowFrames = $0 }
    }

    @ViewBuilder
    private func row(_ item: MenuItemDTO, index: Int) -> some View {
        let enabled = item.enabled ?? true
        let isHovered = enabled && hoveredIndex == index
        let hasSubmenu = !(item.submenu?.isEmpty ?? true)

        HStack(spacing: 8) {
            if let symbol = item.symbol {
                Image(systemName: symbol)
                    .frame(width: 16)
            }
            Text(item.label ?? "")
                .lineLimit(1)
            Spacer(minLength: 12)
            if hasSubmenu {
                Image(systemName: "chevron.right").font(.caption2).opacity(0.6)
            } else if let accel = item.accelerator {
                Text(accel)
                    .foregroundStyle(isHovered ? .white.opacity(0.8) : .secondary)
                    .font(.callout)
            }
        }
        .foregroundStyle(isHovered ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            GeometryReader { geo in
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isHovered
                        ? AnyShapeStyle(Color(nsColor: .selectedContentBackgroundColor))
                        : AnyShapeStyle(.clear))
                    .preference(key: RowFramesKey.self, value: [index: geo.frame(in: .global)])
            }
        )
        .contentShape(Rectangle())
        .opacity(enabled ? 1 : 0.4)
        .onHover { hovering in
            if hovering {
                hoveredIndex = index
                if enabled {
                    onHoverRow(level, rowFrames[index] ?? .zero, hasSubmenu ? item.submenu : nil)
                }
            } else if hoveredIndex == index {
                hoveredIndex = nil
            }
        }
        .onTapGesture {
            // Submenu parents open on hover; only leaf items act on click.
            if enabled && !hasSubmenu { onSelect(item.id) }
        }
    }
}
