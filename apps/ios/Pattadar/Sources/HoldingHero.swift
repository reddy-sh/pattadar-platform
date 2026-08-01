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
            if !heldBy.isEmpty {
                Text("Held by \(heldBy)")
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Color.white.opacity(0.16), in: Capsule())
                    .foregroundStyle(.white)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 20)
        .background(Color(red: 0.24, green: 0.17, blue: 0.19))
        .listRowInsets(EdgeInsets())
    }
}

/// The four figures, two by two.
struct HoldingStats: View {
    let documents: Int
    let places: Int
    let readiness: Int
    let spent: Double

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            tile("\(documents)", "documents", .primary)
            tile("\(places)", "places marked", .primary)
            // Coloured, because this is the one that is a verdict rather than a
            // count.
            tile("\(readiness)%", "record-ready",
                 readiness >= 100 ? .green : readiness >= 70 ? .orange : .red)
            tile(spent > 0 ? compactRupees(spent) : "—", "spent", .primary)
        }
        .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 4, trailing: 16))
        .listRowBackground(Color.clear)
    }

    private func tile(_ value: String, _ label: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(.title2, design: .serif).weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tint)
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

/// What is waiting on you, from the readiness checks.
///
/// The score alone is a number people stop reading. Each failed check becomes a
/// row, blocking ones first, because "mutation still pending" is a thing to do
/// and "71%" is not.
struct NeedsYouSection: View {
    let readiness: Readiness

    var body: some View {
        if !readiness.failures.isEmpty {
            Section {
                ForEach(ordered) { check in
                    HStack(spacing: 12) {
                        Image(systemName: check.blocking
                              ? "exclamationmark.triangle.fill" : "circle.badge.exclamationmark")
                            .foregroundStyle(check.blocking ? .red : .orange)
                            .frame(width: 26)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(check.problem).font(.subheadline.weight(.medium))
                            if check.blocking {
                                Text("Stops a sale or a loan until it is fixed")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            } header: {
                Label("Needs you", systemImage: "person.badge.clock")
            }
        }
    }

    private var ordered: [ReadinessCheck] {
        readiness.failures.sorted { $0.blocking && !$1.blocking }
    }
}

/// A compact read of what is physically on the land, for the holding screen.
/// The full list, with adding and removing, lives under Places → Features.
struct OnTheLandSection: View {
    let features: [LandFeature]

    var body: some View {
        if !features.isEmpty {
            Section {
                ForEach(features.prefix(6)) { f in
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
                }
            } header: {
                Label("On the land", systemImage: "leaf.fill")
            } footer: {
                if features.count > 6 {
                    Text("\(features.count - 6) more under Places → Features.")
                }
            }
        }
    }
}
