import AppKit
import SwiftUI

/// Collects each row's frame (in `.global`, the hosting view's top-left space) so the
/// controller can anchor a submenu flyout to a row.
private struct RowFramesKey: PreferenceKey {
    static var defaultValue: [Int: CGRect] = [:]
    static func reduce(value: inout [Int: CGRect], nextValue: () -> [Int: CGRect]) {
        value.merge(nextValue()) { _, new in new }
    }
}

/// One menu level. Selection (mouse + keyboard) comes from the shared LevelModel; the
/// translucent backing is the NSVisualEffectView in the controller, so this view stays
/// transparent. Scrolls when the controller says the content exceeds the screen.
struct ContextMenuView: View {
    @ObservedObject var model: LevelModel
    let maxHeight: CGFloat
    let scrolls: Bool
    /// User chose a row (click or Return).
    let onActivate: (Int) -> Void
    /// Pointer entered a row.
    let onHover: (Int) -> Void
    /// Report captured row frames upward.
    let onFrames: ([Int: CGRect]) -> Void

    var body: some View {
        content
            .frame(minWidth: 220, maxWidth: 420, alignment: .leading)
            .onPreferenceChange(RowFramesKey.self) { onFrames($0) }
    }

    @ViewBuilder
    private var content: some View {
        if scrolls {
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: true) { rows }
                    .frame(maxHeight: maxHeight)
                    .onChange(of: model.selected, perform: { sel in
                        if let sel { proxy.scrollTo(sel, anchor: .center) }
                    })
            }
        } else {
            rows
        }
    }

    private var rows: some View {
        VStack(alignment: .leading, spacing: 1) {
            ForEach(Array(model.items.enumerated()), id: \.offset) { index, item in
                if item.type == "separator" {
                    Divider().padding(.horizontal, 8).padding(.vertical, 4)
                } else {
                    row(item, index: index).id(index)
                }
            }
        }
        .padding(5)
    }

    @ViewBuilder
    private func row(_ item: MenuItemDTO, index: Int) -> some View {
        let enabled = item.enabled ?? true
        let isSel = enabled && model.selected == index
        let hasSubmenu = !(item.submenu?.isEmpty ?? true)

        HStack(spacing: 8) {
            // Reserve the icon column always, so labels stay aligned whether or not a
            // given row has a symbol.
            Group {
                if let symbol = item.symbol {
                    Image(systemName: symbol)
                } else {
                    Color.clear
                }
            }
            .frame(width: 16, height: 16)

            Text(item.label ?? "").lineLimit(1).truncationMode(.tail)
            Spacer(minLength: 12)

            if hasSubmenu {
                Image(systemName: "chevron.right").font(.caption2).opacity(0.6)
            } else if let accel = item.accelerator {
                Text(accel)
                    .font(.callout)
                    .foregroundStyle(isSel ? .white.opacity(0.85) : .secondary)
            }
        }
        .foregroundStyle(isSel ? AnyShapeStyle(.white) : AnyShapeStyle(.primary))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            GeometryReader { geo in
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(isSel
                        ? AnyShapeStyle(Color(nsColor: .selectedContentBackgroundColor))
                        : AnyShapeStyle(.clear))
                    .preference(key: RowFramesKey.self, value: [index: geo.frame(in: .global)])
            }
        )
        .contentShape(Rectangle())
        .opacity(enabled ? 1 : 0.35)
        .onHover { hovering in if hovering && enabled { onHover(index) } }
        .onTapGesture { if enabled { onActivate(index) } }
    }
}
