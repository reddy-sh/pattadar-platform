import PattadarKit
import SwiftUI

/// The head of a holding screen: what it is, what state it is in, and what is
/// waiting on you.
///
/// Replaces a title and a table. The four figures are the ones a person checks
/// before doing anything with land — how much paper is on file, how much of the
/// ground is recorded, whether it would survive scrutiny, and what it has cost —
/// and "Needs you" turns the readiness score from a number into a list of things
/// to do.
struct HoldingHero: View {
    let kicker: String
    let title: String
    let subtitle: String
    /// "Held by Pattadar Agri Ventures Pvt Ltd" — who is on the title, when
    /// that is not simply you.
    let heldBy: String
    /// "For sale" / "Disputed" / "Leased" — shown ONLY when the holding is not
    /// simply owned. "Owned" is the resting state of every record here and
    /// printing it was a row spent confirming the expected.
    var statusChip: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !kicker.isEmpty {
                Text(kicker.uppercased())
                    .font(.caption.weight(.medium))
                    .kerning(1.2)
                    .foregroundStyle(.white.opacity(0.6))
            }
            Text(title)
                .font(.system(.largeTitle, design: .serif).weight(.semibold))
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.75))
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                if !heldBy.isEmpty {
                    Text("Held by \(heldBy)")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color.white.opacity(0.16), in: Capsule())
                        .foregroundStyle(.white)
                }
                if !statusChip.isEmpty {
                    Text(statusChip)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color.orange.opacity(0.85), in: Capsule())
                        .foregroundStyle(.black)
                }
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 20)
        .background(Color(red: 0.24, green: 0.17, blue: 0.19))
        .listRowInsets(EdgeInsets())
    }
}

/// What is waiting on you, from the readiness checks — tightly.
///
/// This used to be six full-height rows, each blocking one carrying the same
/// sentence, below a tile that repeated the score they add up to. A person
/// standing in a queue needs the list scannable in one glance: the verdict in
/// the header, one line per gap, red before amber, and the blocking rule said
/// ONCE, in the footer.
struct NeedsYouSection: View {
    let readiness: Readiness

    var body: some View {
        if !readiness.failures.isEmpty {
            Section {
                ForEach(ordered) { check in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(check.blocking ? Color.red : Color.orange)
                            .frame(width: 7, height: 7)
                        Text(check.problem)
                            .font(.subheadline)
                        Spacer(minLength: 0)
                    }
                    .listRowInsets(EdgeInsets(top: 7, leading: 20, bottom: 7, trailing: 20))
                }
            } header: {
                HStack {
                    Label("Needs you", systemImage: "person.badge.clock")
                    Spacer()
                    Text("record-ready \(readiness.score)%")
                        .foregroundStyle(readiness.score >= 100 ? .green
                                         : readiness.score >= 70 ? .orange : .red)
                        .fontWeight(.semibold)
                }
            } footer: {
                if readiness.failures.contains(where: \.blocking) {
                    Text("Red items stop a sale or a loan until they are fixed.")
                }
            }
        }
    }

    private var ordered: [ReadinessCheck] {
        readiness.failures.sorted { $0.blocking && !$1.blocking }
    }
}

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
                    VStack(alignment: .leading, spacing: 2) {
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
                .padding(.vertical, 2)
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
