import PattadarKit
import SwiftUI
import WidgetKit

/// "Your land" — the totals, at a glance.
///
/// The one number this app exists to tell you, sized so it can be read from
/// arm's length: how much land is yours. Everything else on the widget is
/// there to say what that number is made of.
struct LandWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PattadarLand", provider: LandProvider()) { entry in
            LandWidgetView(entry: entry)
                .widgetCanvas(Palette.Category.farmland)
        }
        .configurationDisplayName("Your land")
        .description("Total acres, plots and passbooks, with what still needs doing.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge,
                            .accessoryInline, .accessoryRectangular])
    }
}

struct LandWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LandEntry

    var body: some View {
        if let s = entry.snapshot, !s.isEmpty {
            switch family {
            case .systemSmall: small(s)
            case .systemLarge: large(s)
            case .accessoryInline: Text(inline(s))
            case .accessoryRectangular: rectangular(s)
            default: medium(s)
            }
        } else {
            WidgetNothingYet()
        }
    }

    // MARK: - Home Screen

    /// The total, and what it is made of. One tap opens the app.
    private func small(_ s: LandSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            WidgetHeading(text: "Your land", icon: "leaf.fill",
                          tint: Palette.Category.farmland)
            Spacer(minLength: 0)
            WidgetFigure(value: figure(s.acres, .acre), unit: "acres")
            Text(makeup(s))
                .font(.note)
                .foregroundStyle(Palette.inkSoft)
                .lineLimit(1)
            if let nudge = nudge(s) {
                Text(nudge)
                    .font(.note)
                    .foregroundStyle(Palette.accent)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(WidgetLink.home.url)
    }

    /// The total on the left, the kinds on the right — each kind in its own
    /// unit, and each a door to that part of the list.
    private func medium(_ s: LandSnapshot) -> some View {
        HStack(alignment: .top, spacing: Space.lg) {
            Link(destination: WidgetLink.home.url) {
                VStack(alignment: .leading, spacing: Space.xs) {
                    WidgetHeading(text: "Your land", icon: "leaf.fill",
                                  tint: Palette.Category.farmland)
                    Spacer(minLength: 0)
                    WidgetFigure(value: figure(s.acres, .acre), unit: "acres")
                    Text(makeup(s))
                        .font(.note)
                        .foregroundStyle(Palette.inkSoft)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
            VStack(alignment: .leading, spacing: Space.sm) {
                ForEach(s.kinds.prefix(3)) { KindRow(total: $0) }
                if let nudge = nudge(s) {
                    Link(destination: WidgetLink.holdings(.attention).url) {
                        Text(nudge)
                            .font(.note)
                            .foregroundStyle(Palette.accent)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Every kind, then the file itself — how many papers are in the vault and
    /// what is waiting on you.
    private func large(_ s: LandSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Space.md) {
            Link(destination: WidgetLink.home.url) {
                HStack(alignment: .firstTextBaseline) {
                    WidgetHeading(text: "Your land", icon: "leaf.fill",
                                  tint: Palette.Category.farmland)
                    Spacer()
                    // "2 hours ago" — `.relative` as a *style* counts without
                    // ever saying "ago", which on a stale widget reads as a
                    // countdown to something.
                    Text(s.updated, format: .relative(presentation: .named))
                        .font(.label)
                        .foregroundStyle(Palette.inkFaint)
                        .lineLimit(1)
                }
            }
            VStack(spacing: Space.sm) {
                ForEach(s.kinds) { total in
                    Link(destination: WidgetLink.holdings(total.kind.filter).url) {
                        KindRow(total: total, showsCount: true)
                    }
                }
            }
            Spacer(minLength: 0)
            Divider().overlay(Palette.rule)
            Link(destination: WidgetLink.holdings(.attention).url) {
                HStack(spacing: Space.sm) {
                    Image(systemName: s.verdict == .ready ? "checkmark.seal.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(Palette.tint(for: s.verdict))
                    Text(s.worst.isEmpty
                         ? "Every holding would stand up to scrutiny today."
                         : s.worst)
                        .font(.bodyCopy)
                        .foregroundStyle(Palette.ink)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                }
            }
            Link(destination: WidgetLink.vault.url) {
                Text(vaultLine(s))
                    .font(.note)
                    .foregroundStyle(Palette.inkSoft)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // MARK: - Lock Screen

    private func inline(_ s: LandSnapshot) -> String {
        "\(figure(s.acres, .acre)) acres · \(s.parcels) parcels"
    }

    private func rectangular(_ s: LandSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Space.hair) {
            Text("Your land").font(.caption).widgetAccentable()
            Text("\(figure(s.acres, .acre)) acres").font(.headline)
            Text(nudge(s) ?? makeup(s)).font(.caption2).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetLink.home.url)
    }

    // MARK: - Wording

    /// The acreage without its unit word — the unit is set beside it, larger.
    private func figure(_ amount: Double, _ unit: UnitKey) -> String {
        areaText(amount, unit).replacingOccurrences(of: " " + unit.label, with: "")
    }

    /// "22 parcels · 4 passbooks" — what the headline figure is made of.
    private func makeup(_ s: LandSnapshot) -> String {
        var parts = ["\(s.parcels) parcel\(s.parcels == 1 ? "" : "s")"]
        if s.passbooks > 0 {
            parts.append("\(s.passbooks) passbook\(s.passbooks == 1 ? "" : "s")")
        }
        return parts.joined(separator: " · ")
    }

    /// The ONE thing worth interrupting a glance for, in priority order: a
    /// reading waiting on a decision, then a holding that cannot be sold, then
    /// land nobody has pinned. Nil when there is nothing to say — a widget that
    /// always nags is one that is never read.
    private func nudge(_ s: LandSnapshot) -> String? {
        if s.waiting > 0 {
            return "\(s.waiting) reading\(s.waiting == 1 ? "" : "s") waiting"
        }
        if s.blocking > 0 {
            return "\(s.blocking) can’t be sold yet"
        }
        if s.unpinned > 0 {
            return "\(s.unpinned) not on the map"
        }
        return nil
    }

    private func vaultLine(_ s: LandSnapshot) -> String {
        let papers = "\(s.documents) paper\(s.documents == 1 ? "" : "s") in the vault"
        return s.waiting > 0 ? papers + " · \(s.waiting) waiting on you" : papers
    }
}

/// One kind of holding, in its own unit and its own colour.
struct KindRow: View {
    let total: KindTotal
    var showsCount: Bool = false

    var body: some View {
        HStack(spacing: Space.sm) {
            Image(systemName: total.kind.icon)
                .font(.caption)
                .foregroundStyle(Palette.tint(for: total.kind))
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 0) {
                Text(areaText(total.amount, total.kind.unit)
                    .replacingOccurrences(of: total.kind.unit.label, with: total.kind.shortUnit))
                    .font(.bodyCopy.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if showsCount {
                    Text(total.kind.label)
                        .font(.note)
                        .foregroundStyle(Palette.inkSoft)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if showsCount {
                Text("\(total.count)")
                    .font(.bodyCopy)
                    .monospacedDigit()
                    .foregroundStyle(Palette.inkSoft)
            }
        }
    }
}

extension HoldingKind {
    /// Which slice of the Properties list this kind opens.
    var filter: WidgetLink.Filter {
        switch self {
        case .farmland: .agricultural
        case .plot: .plots
        // Houses and shops have no filter of their own on the list yet, so the
        // honest destination is the whole list rather than a filter that would
        // quietly show the wrong slice.
        case .home, .commercial: .all
        }
    }
}
