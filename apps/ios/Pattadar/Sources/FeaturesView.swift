import PattadarKit
import SwiftUI

/// What is on the land — grouped the way somebody would describe it.
///
/// Water, power, corners, access. A borewell's depth, the electricity service
/// number, which stone marks corner A. None of this appears on any deed, all of
/// it costs money to rediscover, and it usually lives in one person's memory:
/// the moment they are not around, a 320 ft borewell becomes "about 300, ask the
/// man who drilled it".
struct FeaturesView: View {
    @Environment(AppModel.self) private var app

    let entityType: String
    let entityId: String

    @State private var features: [LandFeature] = []
    @State private var loaded = false
    @State private var adding = false
    @State private var confirmDelete: LandFeature?

    /// Grouped by the heading as WRITTEN, so a kind somebody invented keeps its
    /// own name instead of being swept into "Other".
    private var grouped: [(title: String, icon: String, items: [LandFeature])] {
        let byCategory = Dictionary(grouping: features) { $0.category.lowercased() }
        let known = Set(FeatureCategory.allCases.map(\.rawValue))

        var out: [(String, String, [LandFeature])] = []
        for c in FeatureCategory.allCases where c != .other {
            if let items = byCategory[c.rawValue], !items.isEmpty {
                out.append((c.title, c.icon, items))
            }
        }
        // Then whatever this person called things, alphabetically.
        for key in byCategory.keys.sorted() where !known.contains(key) {
            let items = byCategory[key] ?? []
            if !items.isEmpty {
                out.append((key.prefix(1).uppercased() + key.dropFirst(),
                            FeatureCategory.other.icon, items))
            }
        }
        if let items = byCategory[FeatureCategory.other.rawValue], !items.isEmpty {
            out.append((FeatureCategory.other.title, FeatureCategory.other.icon, items))
        }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if loaded && features.isEmpty {
                emptyState
            } else {
                ForEach(grouped, id: \.title) { group in
                    card(group.title, group.icon, group.items)
                }
            }

            Button { adding = true } label: {
                Label("Add a feature", systemImage: "plus.circle.fill")
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(.horizontal, 16)
        .task { await load() }
        .sheet(isPresented: $adding) {
            AddFeatureSheet(entityType: entityType, entityId: entityId) {
                Task { await load() }
            }
        }
        .confirmationDialog("Remove this?", isPresented: Binding(
            get: { confirmDelete != nil },
            set: { if !$0 { confirmDelete = nil } }), titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let f = confirmDelete { Task { await remove(f) } }
            }
            Button("Keep it", role: .cancel) { confirmDelete = nil }
        } message: {
            Text(confirmDelete.map { "\($0.label) \($0.amount)" } ?? "")
        }
    }

    private func card(_ title: String, _ icon: String, _ items: [LandFeature]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .frame(width: 30, height: 30)
                    .background(Color.accentColor.opacity(0.14),
                                in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(.headline, design: .serif))
                    Text(summary(items)).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }

            // Chips, because each of these is a short fact and a table of
            // label/value rows would be four times the height for the same
            // words.
            FlowChips(items: items) { f in
                Button { confirmDelete = f } label: {
                    Text(f.amount.isEmpty ? f.label : "\(f.label) \(f.amount)")
                        .font(.footnote)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                        .foregroundStyle(.primary)
                }
                .buttonStyle(.plain)
            }

            ForEach(items.filter { !$0.note.isEmpty || !$0.vendor.isEmpty || !$0.condition.isEmpty }) { f in
                Text("\(f.label) — " + [f.condition, f.vendor, f.note]
                    .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// "Borewell · channel · tank side" — what is here, in the words used.
    private func summary(_ items: [LandFeature]) -> String {
        items.map(\.label).filter { !$0.isEmpty }.prefix(4).joined(separator: " · ")
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "questionmark.circle")
                .font(.system(size: 22)).foregroundStyle(.secondary)
            Text("Nothing recorded on this land yet")
                .font(.subheadline.weight(.semibold))
            Text("How deep the borewell is, the electricity service number, which stone marks the corner. None of it is on the deed, and it is the first thing forgotten.")
                .font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func load() async {
        let r = await app.load(Queries.landFeatures,
                               variables: ["entityType": entityType, "entityId": entityId],
                               as: LandFeaturesResponse.self)
        features = r?.landFeatures ?? []
        loaded = true
    }

    private func remove(_ f: LandFeature) async {
        struct Ack: Decodable { let deleteLandFeature: Bool }
        _ = await app.load(Mutations.deleteLandFeature, variables: ["id": f.id], as: Ack.self)
        confirmDelete = nil
        await load()
    }
}

/// Chips that wrap. `LazyVGrid` cannot do this — every column would be the width
/// of the longest chip, so "Gate" would take the same room as "Borewell 320 ft".
struct FlowChips<Item: Identifiable, Content: View>: View {
    let items: [Item]
    @ViewBuilder let content: (Item) -> Content

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items) { content($0) }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0
        for v in subviews {
            let size = v.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                x = 0; y += lineHeight + spacing; lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: proposal.width ?? x, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize,
                       subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for v in subviews {
            let size = v.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX; y += lineHeight + spacing; lineHeight = 0
            }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
