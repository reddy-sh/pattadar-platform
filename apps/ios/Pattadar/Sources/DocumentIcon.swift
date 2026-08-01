import PattadarKit
import SwiftUI

/// The tile that stands in front of a document.
///
/// A list of land papers where every row wears the same grey page forces the
/// reader to parse text to find anything — and the KIND of paper is the first
/// thing that matters, because it decides what the document proves. A sale deed
/// and a power of attorney are not interchangeable, and they should not look it.
struct DocumentIcon: View {
    let docType: String
    /// A row that only holds what was READ from a document, with no file
    /// behind it, cannot be opened. That was invisible until you tapped it.
    var hasFile: Bool = true
    var size: CGFloat = 38

    private var kind: DocumentKind { documentKind(docType) }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(color.opacity(hasFile ? 0.16 : 0.09))
            Image(systemName: kind.icon)
                .font(.system(size: size * 0.45, weight: .semibold))
                .foregroundStyle(hasFile ? color : color.opacity(0.55))
        }
        .frame(width: size, height: size)
        .overlay(alignment: .bottomTrailing) {
            if !hasFile {
                // Stated as well as drawn: colour alone is not a message, and
                // the difference between "openable" and "not" is worth a glyph.
                Image(systemName: "eye.slash.fill")
                    .font(.system(size: size * 0.26, weight: .bold))
                    .foregroundStyle(.secondary)
                    .padding(size * 0.09)
                    .background(.background, in: Circle())
                    .offset(x: size * 0.12, y: size * 0.12)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(hasFile ? kind.label : "\(kind.label), no file stored")
    }

    /// The kit names the tint so it stays free of SwiftUI; the mapping lives
    /// here, where colours belong.
    private var color: Color {
        switch kind.tint {
        case "blue": .blue
        case "pink": .pink
        case "orange": .orange
        case "brown": .brown
        case "purple": .purple
        case "green": .green
        case "teal": .teal
        case "indigo": .indigo
        case "mint": .mint
        case "gray": .gray
        default: .secondary
        }
    }
}
