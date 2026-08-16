import PattadarKit
import SwiftUI

/// What is physically on the land, managed on the holding screen itself.
///
/// This lived a segment deep under Places → Features, where nobody stumbles
/// on it. What is on the land — the borewell's depth, the service number,
/// which stone marks corner A — is a fact about the HOLDING, so it is
/// recorded and removed here, on the holding's own screen.
struct OnTheLandSection: View {
    @Environment(AppModel.self) private var app

    let entityType: String
    let entityId: String
    let features: [LandFeature]
    /// The parent owns the list; it reloads after an add or remove.
    let onChanged: () -> Void

    @State private var adding = false
    @State private var confirmDelete: LandFeature?

    var body: some View {
        Section {
            ForEach(features) { f in
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text(f.label).font(.subheadline.weight(.medium))
                        if !f.amount.isEmpty {
                            // Monospaced: these are figures somebody reads
                            // out over a phone.
                            Text(f.amount)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 12)
                    if !f.condition.isEmpty {
                        Text(f.condition)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.trailing)
                    }
                }
                .padding(.vertical, Space.hair)
                .swipeActions {
                    // Behind a confirmation: "borewell · 320 ft" is a fact
                    // that costs money to rediscover.
                    Button(role: .destructive) { confirmDelete = f } label: {
                        Label("Remove", systemImage: "trash")
                    }
                }
            }
            Button { adding = true } label: {
                Label("Add a feature", systemImage: "plus.circle.fill")
                    .font(.subheadline)
            }
        } header: {
            Label("On the land", systemImage: "leaf.fill")
        } footer: {
            if features.isEmpty {
                Text("How deep the borewell is, the electricity service number, which stone marks the corner. None of it is on the deed, and it is the first thing forgotten.")
            }
        }
        .sheet(isPresented: $adding) {
            AddFeatureSheet(entityType: entityType, entityId: entityId) {
                onChanged()
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

    private func remove(_ f: LandFeature) async {
        struct Gone: Decodable { let deleteLandFeature: Bool }
        _ = await app.load(Mutations.deleteLandFeature, variables: ["id": f.id], as: Gone.self)
        confirmDelete = nil
        onChanged()
    }
}
