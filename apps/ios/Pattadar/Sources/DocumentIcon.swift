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
    private var color: Color { documentTintColor(docType) }
}

/// The vault tile: family colour, kind letters, year — what a clerk scribbles
/// on the corner of a file. "SD 2024" on deed blue answers which paper this
/// is before the row is read; the icon-only tile made every deed identical.
struct VaultTile: View {
    let docType: String
    let family: String
    var year: String = ""
    var hasFile: Bool = true

    var body: some View {
        VStack(spacing: 2) {
            Text(documentMono(docType))
                .font(.system(size: 12, weight: .heavy))
                .kerning(0.3)
                .lineLimit(1).minimumScaleFactor(0.7)
            if !year.isEmpty {
                Text(year)
                    .font(.system(size: 8.5, weight: .semibold)).monospacedDigit()
                    .opacity(0.62)
            }
        }
        .foregroundStyle(hasFile ? color : color.opacity(0.55))
        .frame(width: 38, height: 44)
        .background(color.opacity(hasFile ? 0.15 : 0.08),
                    in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(alignment: .bottomTrailing) {
            if !hasFile {
                Image(systemName: "eye.slash.fill")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
                    .padding(3)
                    .background(.background, in: Circle())
                    .offset(x: 4, y: 4)
            }
        }
        .accessibilityElement()
        .accessibilityLabel([familyLabel(family), year, hasFile ? "" : "no file stored"]
            .filter { !$0.isEmpty }.joined(separator: ", "))
    }

    private var color: Color { familyTintColor(family) }
}

/// The family's colour — one palette for vault tiles, filter chips, the page
/// map and dossier rows, so the same paper never wears two colours on
/// adjacent screens. The kit names it (`familyTint`); the `Color` lives here.
func familyTintColor(_ family: String) -> Color {
    switch familyTint(family) {
    case "blue": .blue
    case "green": .green
    case "cyan": .cyan
    case "purple": .purple
    case "orange": .orange
    case "brown": .brown
    default: .gray
    }
}

/// The kind's colour, for anything that dresses a document — the icon tile,
/// the viewer's kind chip.
func documentTintColor(_ docType: String) -> Color {
    switch documentKind(docType).tint {
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
