import PattadarKit
import SwiftUI

/// "What are you filing?" — the centre button's sheet.
///
/// Replaces a bare Add that dropped you into a form before asking what you had
/// in your hand. Naming the paper first is how people think about this: they are
/// holding a deed, a passbook, an EC or a receipt, and each goes somewhere
/// different.
///
/// Only the tiles that route somewhere real are shown. Two things from the
/// design are deliberately absent: the agent network (send someone for site
/// photos, book a surveyor, ask an advocate), because there is no marketplace,
/// no panel and no way to pay one; and the place/feature tiles, because nothing
/// in the records can hold a corner pin or a borewell. Each would be a button
/// that does nothing, or worse, one that quietly does something else.
struct FilingSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    /// Named when the sheet is opened from a holding, so the sheet can say
    /// where the paper is going.
    var destinationName: String?

    enum Route: String, Identifiable {
        case holding, passbook, document, request
        var id: String { rawValue }
    }
    @State private var route: Route?

    private struct Tile: Identifiable {
        let id: String
        let label: String
        let hint: String
        let icon: String
        let route: Route
    }

    private let tiles: [Tile] = [
        .init(id: "title", label: "Title deed", hint: "Sale, gift, partition",
              icon: "signature", route: .holding),
        .init(id: "revenue", label: "Passbook", hint: "PPB, pahani, 1-B",
              icon: "book.closed.fill", route: .passbook),
        .init(id: "search", label: "EC or search", hint: "Encumbrance report",
              icon: "doc.text.magnifyingglass", route: .document),
        .init(id: "tax", label: "Tax receipt", hint: "Land or property tax",
              icon: "indianrupeesign.circle.fill", route: .document),
    ]

    // "A place" (corner, borewell, road) and "On the land" (bore, wall, shed)
    // are in the design and are NOT here. Both need somewhere to keep a pin or
    // a feature against a parcel, and the records have neither — so the tiles
    // would open the add-a-holding form, which is not what either promises.
    // They belong here the day those tables exist.

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("What are you filing?")
                            .font(.system(.title, design: .serif).weight(.semibold))
                        Text(destinationName.map { "Going to \($0)." }
                             ?? "Name the paper and it goes to the right place.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    .padding(.top, 4)

                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(tiles) { t in
                            Button { route = t.route } label: { tile(t) }
                                .buttonStyle(.plain)
                        }
                    }

                    // Not a paper at all: work you want somebody to do. It
                    // belongs on this sheet because "what do I need to happen"
                    // is the same moment as "what am I filing".
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Or ask someone to do it")
                            .font(.system(.headline, design: .serif))
                        Text("A surveyor, an advocate, an errand at the office. Recorded and tracked — nobody is dispatched or paid from here.")
                            .font(.caption).foregroundStyle(.secondary)
                        Button { route = .request } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "hammer.fill")
                                    .foregroundStyle(Color.accentColor)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Ask for something")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    Text("Survey, title check, site photos, errand")
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption).foregroundStyle(.tertiary)
                            }
                            .padding(14)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color(.secondarySystemGroupedBackground)))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.top, 4)
                }
                .padding(20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { app.clearReadIfSettled(); dismiss() }
                }
            }
            .fullScreenCover(item: $route) { r in
                switch r {
                case .holding: AddHoldingScreen(passbooks: [], parcels: [])
                        .onDisappear { dismiss() }
                case .passbook: AddPassbookScreen().onDisappear { dismiss() }
                case .document: AddDocumentSheet { dismiss() }
                case .request: NavigationStack { GetItDoneScreen(showsClose: true) }
                }
            }
        }
    }

    private func tile(_ t: Tile) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: t.icon)
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(Color.accentColor)
            VStack(alignment: .leading, spacing: 2) {
                Text(t.label).font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(t.hint).font(.caption2).foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color(.secondarySystemGroupedBackground)))
        .contentShape(Rectangle())
    }
}
