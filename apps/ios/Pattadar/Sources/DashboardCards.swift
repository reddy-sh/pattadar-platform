import PattadarKit
import SwiftUI

// The M01 dashboard: what needs you, then what you own. Cards here are drawn
// by the app on `Palette.ground` — Home is the container rule's one
// ScrollView-of-cards screen. The pre-M-series set (KindCard, RecordReadyCard,
// HomeMapCard, FavouritesCard) was deleted with its call sites in the same
// change — design.md forbids a view component with no door to it.

/// The portfolio in three columns — Farmland · Plots · Built (M01, and the
/// Mine face of Properties, M22). Each column is a door to the list it counts.
struct StatTripleCard: View {
    let totals: [KindTotal]
    let onOpen: (HoldingFilter) -> Void

    private struct Column: Identifiable {
        let id: String
        let label: String
        let value: String
        let unit: String
        let filter: HoldingFilter
    }

    var body: some View {
        let columns = built()
        if !columns.isEmpty {
            HStack(spacing: 0) {
                ForEach(Array(columns.enumerated()), id: \.element.id) { index, column in
                    if index > 0 {
                        Rectangle().fill(Palette.rule).frame(width: 1)
                            .padding(.vertical, Space.hair)
                    }
                    Button { onOpen(column.filter) } label: {
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text(column.label.uppercased())
                                .font(.label).foregroundStyle(.secondary).kerning(1.1)
                            Text(column.value)
                                .font(.scaled(22, weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .lineLimit(1).minimumScaleFactor(0.6)
                            Text(column.unit)
                                .font(.note.monospacedDigit()).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, index == 0 ? 0 : Space.md)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(Space.lg)
            .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                .fill(Palette.card))
            .accessibilityElement(children: .contain)
        }
    }

    /// Farmland in acres+cents, plots in their unit, homes and commercial
    /// merged as "Built" — three figures, the way land is actually spoken of.
    private func built() -> [Column] {
        var columns: [Column] = []
        if let farm = totals.first(where: { $0.kind == .farmland }), farm.amount > 0 {
            let whole = Int(farm.amount)
            let cents = Int(((farm.amount - Double(whole)) * 100).rounded())
            columns.append(Column(id: "farm", label: "Farmland",
                                  value: "\(whole)",
                                  unit: cents > 0 ? "Ac \(cents) Ce" : "Acres",
                                  filter: .agricultural))
        }
        if let plot = totals.first(where: { $0.kind == .plot }), plot.amount > 0 {
            columns.append(Column(id: "plot", label: "Plots",
                                  value: wholeNumber(plot.amount),
                                  unit: plot.kind.unit.label,
                                  filter: .plots))
        }
        let builtKinds = totals.filter { $0.kind == .home || $0.kind == .commercial }
        let builtTotal = builtKinds.reduce(0.0) { $0 + $1.amount }
        if builtTotal > 0 {
            columns.append(Column(id: "built", label: "Built",
                                  value: wholeNumber(builtTotal),
                                  // Homes and shops measure the same way; the
                                  // first kind present names the unit.
                                  unit: builtKinds.first?.kind.unit.label ?? "sq.ft",
                                  filter: .all))
        }
        return columns
    }

    private func wholeNumber(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: value)) ?? "\(Int(value))"
    }
}

/// Worth today (M01) — what it is worth against what was paid, and what it
/// costs to keep. The old dashboard refused to print money next to measured
/// extents; the M-series overrules that, with the honesty moved into the
/// footnote: these are the values YOU recorded, not appraisals.
struct WorthTodayCard: View {
    let worth: Double
    let paid: Double
    let costsThisYear: Double
    let loans: Double
    /// What the portfolio is made of, for the chip row.
    let mix: [(kind: HoldingKind, count: Int, noun: String)]

    private var gainPercent: Int? {
        guard paid > 0, worth > 0 else { return nil }
        return Int(((worth - paid) / paid * 100).rounded())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text("WORTH TODAY")
                    .font(.label).foregroundStyle(.secondary).kerning(1.1)
                Spacer()
                if let gain = gainPercent {
                    Text(gain >= 0 ? "+\(gain)%" : "\(gain)%")
                        .font(.footnote.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(gain >= 0 ? Palette.success : Palette.danger)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: Space.sm) {
                Text(compactRupees(worth))
                    .font(.figure)
                    .lineLimit(1).minimumScaleFactor(0.6)
                if paid > 0 {
                    Text("from \(compactRupees(paid)) paid")
                        .font(.bodyCopy).foregroundStyle(.secondary)
                }
            }

            if let fraction = paidFraction {
                GeometryReader { geo in
                    HStack(spacing: 0) {
                        Capsule().fill(Palette.ruleStrong)
                            .frame(width: geo.size.width * fraction)
                        Rectangle().fill(Palette.accent)
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 7)
                .padding(.top, Space.hair)
                HStack {
                    Text("Grey is what you paid")
                    Spacer()
                    if costsThisYear > 0 {
                        Text("Costs this year \(compactRupees(costsThisYear))")
                    }
                }
                .font(.note).foregroundStyle(.secondary)
            }

            if loans > 0 {
                Divider().padding(.vertical, Space.hair)
                HStack {
                    Text("Loans outstanding")
                        .font(.bodyCopy).foregroundStyle(.secondary)
                    Spacer()
                    Text(rupees(loans))
                        .font(.callout.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(Palette.danger)
                }
            }

            Text("Owned holdings only — the values recorded on your own papers, not appraisals.")
                .font(.note).foregroundStyle(.secondary)
                .padding(.top, Space.hair)

            if !mix.isEmpty {
                Divider().padding(.vertical, Space.hair)
                // What the figure is made of. Wraps rather than scrolls: four
                // chips at most, and a clipped count is a wrong count.
                FlowLayout(spacing: Space.sm) {
                    ForEach(Array(mix.enumerated()), id: \.offset) { _, part in
                        HStack(spacing: Space.xs) {
                            Image(systemName: part.kind.icon)
                                .font(.scaled(12))
                                .foregroundStyle(Palette.tint(for: part.kind))
                            Text("\(part.count)").font(.note.weight(.semibold))
                            Text(part.noun).font(.note).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .padding(Space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .fill(Palette.card))
        .accessibilityElement(children: .combine)
    }

    private var paidFraction: Double? {
        guard worth > 0, paid > 0 else { return nil }
        return min(max(paid / worth, 0), 1)
    }
}

/// A dated obligation with a door to the holding it sits on (M01 "Upcoming").
struct UpcomingRow: Identifiable {
    let id: String
    let icon: String
    let title: String
    let subtitle: String
    let holding: Holding
}

/// Upcoming (M01) — the failures with a date on them: tax behind, EC stale.
/// Rows are the Readiness checks' own sentences; nothing here invents a
/// threshold (design.md: one verdict, decided in PattadarKit).
struct UpcomingCard: View {
    let rows: [UpcomingRow]

    var body: some View {
        HomeListCard(title: "Upcoming") {
            ForEach(rows) { row in
                NavigationLink { HoldingDestination(holding: row.holding) } label: {
                    HStack(alignment: .top, spacing: Space.md) {
                        Image(systemName: row.icon)
                            .font(.scaled(16))
                            .foregroundStyle(Palette.caution)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text(row.title).font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                            Text(row.subtitle).font(.note).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if row.id != rows.last?.id { Divider() }
            }
        }
    }
}

/// Needs attention (M01) — the blocking failures: disputes, missing title,
/// mutation not recorded. Danger rather than caution, because these stop a
/// sale rather than untidy one.
struct NeedsAttentionCard: View {
    let rows: [UpcomingRow]

    var body: some View {
        HomeListCard(title: "Needs attention") {
            ForEach(rows) { row in
                NavigationLink { HoldingDestination(holding: row.holding) } label: {
                    HStack(alignment: .center, spacing: Space.md) {
                        Image(systemName: row.icon)
                            .font(.scaled(16))
                            .foregroundStyle(Palette.danger)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text(row.title).font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(row.subtitle).font(.note).foregroundStyle(Palette.danger)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if row.id != rows.last?.id { Divider() }
            }
        }
    }
}

/// Recently opened (M01) — the doors most recently walked through, because
/// the record you looked at yesterday is the record you want today.
struct RecentlyOpenedCard: View {
    let items: [Holding]
    let onAll: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            HStack(alignment: .firstTextBaseline) {
                Text("Recently opened").font(.sectionHead)
                Spacer()
                Button("All properties", action: onAll)
                    .font(.subheadline)
            }
            ForEach(items) { h in
                NavigationLink { HoldingDestination(holding: h) } label: {
                    HStack(spacing: Space.md) {
                        Image(systemName: h.kind.icon)
                            .font(.scaled(16))
                            .foregroundStyle(Palette.tint(for: h.kind))
                            .frame(width: 40, height: 40)
                            .background(Palette.tint(for: h.kind).opacity(0.12),
                                        in: RoundedRectangle(cornerRadius: Radius.control,
                                                             style: .continuous))
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text(h.title).font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text([h.extentText, h.village].filter { !$0.isEmpty }
                                .joined(separator: " · "))
                                .font(.note).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.caption).foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if h.id != items.last?.id { Divider() }
            }
        }
        .padding(Space.lg)
        .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .fill(Palette.card))
    }
}

/// The outbox, said on Home (M40): what is waiting to go up, and a tap to
/// push it. Hidden when nothing waits — an empty promise is noise.
struct OutboxStrip: View {
    let filings: Int
    let photos: Int
    let onKick: () -> Void

    private var sentence: String {
        var parts: [String] = []
        if filings > 0 { parts.append("\(filings) filing\(filings == 1 ? "" : "s")") }
        if photos > 0 { parts.append("\(photos) photograph\(photos == 1 ? "" : "s")") }
        let joined = parts.joined(separator: " and ")
        let verb = (filings + photos) == 1 ? "is" : "are"
        return "\(joined) \(verb) waiting to go up."
    }

    var body: some View {
        if filings + photos > 0 {
            Button(action: onKick) {
                HStack(spacing: Space.sm) {
                    Image(systemName: "arrow.up.circle")
                        .foregroundStyle(Color.accentColor)
                    Text(sentence)
                        .font(.footnote).foregroundStyle(.primary)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Space.md)
                .padding(.vertical, Space.md)
                .background(RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                    .fill(Palette.accentWash))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(sentence)
            .accessibilityHint("Tries the upload now")
        }
    }
}

/// The one place a Home row becomes a screen — every card above deep-links
/// through this, so a holding opens the same way from every door.
struct HoldingDestination: View {
    let holding: Holding

    var body: some View {
        switch holding {
        case .parcel(let p, let pb): HoldingDetailScreen(parcel: p, passbook: pb)
        case .property(let p): PropertyDetailScreen(property: p)
        }
    }
}

/// A titled card of rows — Upcoming and Needs-attention share the shell.
struct HomeListCard<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            Text(title).font(.sectionHead)
            content
        }
        .padding(Space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .fill(Palette.card))
    }
}

/// Documents that have been read and are waiting for a person to accept them.
///
/// This is the counterpart to reads that survive the app being closed. Without
/// it a finished reading has nowhere to appear: the notification is gone once
/// dismissed, and the reading itself was never a record. Prominent on purpose —
/// an extraction nobody acts on is an API call and ninety seconds spent for
/// nothing.
struct ReviewCard: View {
    let entries: [ReviewQueue.Entry]
    let onOpen: (ReviewQueue.Entry) -> Void
    let onDiscard: (ReviewQueue.Entry) -> Void
    /// Throwing one away is deliberate: confirmed, never a stray tap.
    @State private var confirmDiscard: ReviewQueue.Entry?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            Label(entries.count == 1 ? "1 document read, waiting for you"
                                     : "\(entries.count) documents read, waiting for you",
                  systemImage: "tray.full.fill")
                .font(.headline)
            Text("Nothing has been saved yet — open one to check what was read and add it.")
                .font(.caption).foregroundStyle(.secondary)

            ForEach(entries) { e in
                HStack(spacing: Space.md) {
                    // Open and discard are SIBLING buttons, not nested — and
                    // not a swipe: `.swipeActions` only works inside a List,
                    // and this card lives in Home's scroll view, where the
                    // swipe rendered but answered nothing.
                    Button { onOpen(e) } label: {
                        HStack(spacing: Space.md) {
                            DocumentIcon(docType: (e.fields["doc_type"] as? String) ?? "", size: 34)
                            VStack(alignment: .leading, spacing: Space.hair) {
                                Text(headline(e)).font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary).lineLimit(2)
                                Text(relativeTime(ISO8601DateFormatter().string(from: e.readAt)))
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    Button { confirmDiscard = e } label: {
                        Image(systemName: "trash")
                            .font(.scaled(14, weight: .medium))
                            .foregroundStyle(Palette.danger)
                            .frame(width: 34, height: 34)
                            .background(Palette.danger.opacity(0.12), in: Circle())
                            // The circle stays 34 so the row's rhythm is
                            // unchanged; the TARGET is the platform's 44.
                            .minimumTouchTarget()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Discard this reading")
                }
            }
        }
        .padding(Space.lg)
        .background(RoundedRectangle(cornerRadius: Radius.card)
            .fill(Color.accentColor.opacity(0.12)))
        .confirmationDialog("Discard this reading?",
                            isPresented: Binding(get: { confirmDiscard != nil },
                                                 set: { if !$0 { confirmDiscard = nil } }),
                            titleVisibility: .visible) {
            Button("Discard", role: .destructive) {
                if let e = confirmDiscard { onDiscard(e) }
                confirmDiscard = nil
            }
            Button("Keep it", role: .cancel) { confirmDiscard = nil }
        } message: {
            Text(confirmDiscard.map { headline($0) } ?? "")
        }
    }

    private func headline(_ e: ReviewQueue.Entry) -> String {
        let h = (e.fields["headline"] as? String) ?? ""
        if !h.isEmpty { return h }
        let type = (e.fields["doc_type"] as? String) ?? ""
        return type.isEmpty ? e.originalName : type
    }
}
