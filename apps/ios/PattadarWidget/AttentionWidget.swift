import PattadarKit
import SwiftUI
import WidgetKit

/// "Needs attention" — the papers, not the land.
///
/// The other widget answers "how much do I have". This one answers the
/// question that actually costs money: would any of it survive a bank's
/// scrutiny today? It names the holding and the problem, because "3 holdings
/// need attention" sends somebody hunting and "Sy 121/2 — mutation still
/// pending" is a thing to do.
struct AttentionWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PattadarAttention", provider: LandProvider()) { entry in
            AttentionWidgetView(entry: entry)
                .widgetCanvas(Palette.accent)
        }
        .configurationDisplayName("Needs attention")
        .description("What is missing from your records, worst first.")
        .supportedFamilies([.systemSmall, .systemMedium,
                            .accessoryCircular, .accessoryRectangular])
    }
}

struct AttentionWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LandEntry

    var body: some View {
        if let s = entry.snapshot, !s.isEmpty {
            switch family {
            case .systemSmall: small(s)
            case .accessoryCircular: circular(s)
            case .accessoryRectangular: rectangular(s)
            default: medium(s)
            }
        } else {
            WidgetNothingYet()
        }
    }

    /// Failing holdings first and worst first. The snapshot orders starred
    /// ones to the front, which is right for pinning and wrong here.
    private func worstFirst(_ s: LandSnapshot) -> [HoldingLine] {
        s.holdings.filter { !$0.isReady }.sorted { a, b in
            if a.blocking != b.blocking { return a.blocking > b.blocking }
            return a.score < b.score
        }
    }

    // MARK: - Home Screen

    private func small(_ s: LandSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            WidgetHeading(text: "Record-ready", icon: "checkmark.seal.fill",
                          tint: Palette.tint(for: s.verdict))
            Spacer(minLength: 0)
            WidgetFigure(value: "\(s.readiness)", unit: "%")
            if s.attention == 0 {
                Text("Everything on file would stand up today.")
                    .font(.note).foregroundStyle(Palette.inkSoft).lineLimit(3)
            } else {
                Text(headline(s))
                    .font(.note).foregroundStyle(Palette.inkSoft).lineLimit(1)
                Text(s.worst)
                    .font(.note).foregroundStyle(Palette.accent).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(WidgetLink.holdings(.attention).url)
    }

    private func medium(_ s: LandSnapshot) -> some View {
        HStack(alignment: .top, spacing: Space.lg) {
            Link(destination: WidgetLink.holdings(.attention).url) {
                VStack(alignment: .leading, spacing: Space.xs) {
                    WidgetHeading(text: "Record-ready", icon: "checkmark.seal.fill",
                                  tint: Palette.tint(for: s.verdict))
                    Spacer(minLength: 0)
                    WidgetFigure(value: "\(s.readiness)", unit: "%")
                    Text(headline(s))
                        .font(.note).foregroundStyle(Palette.inkSoft).lineLimit(2)
                }
                .frame(width: 96, alignment: .leading)
            }
            let rows = worstFirst(s)
            if rows.isEmpty {
                VStack(alignment: .leading, spacing: Space.xs) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(Palette.success)
                    Text("Every holding on file would stand up to scrutiny today.")
                        .font(.bodyCopy).foregroundStyle(Palette.ink)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: Space.sm) {
                    ForEach(rows.prefix(3)) { line in
                        Link(destination: WidgetLink.holding(line.id).url) {
                            ProblemRow(line: line)
                        }
                    }
                    if rows.count > 3 {
                        Text("and \(rows.count - 3) more")
                            .font(.note).foregroundStyle(Palette.inkFaint)
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: - Lock Screen

    /// A percentage IS a gauge, so it is drawn as one rather than as a number
    /// in a circle.
    private func circular(_ s: LandSnapshot) -> some View {
        Gauge(value: Double(s.readiness), in: 0...100) {
            Image(systemName: "checkmark.seal")
        } currentValueLabel: {
            Text("\(s.readiness)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetURL(WidgetLink.holdings(.attention).url)
    }

    private func rectangular(_ s: LandSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Space.hair) {
            Text("Record-ready \(s.readiness)%").font(.caption).widgetAccentable()
            if s.worst.isEmpty {
                Text("All holdings in order").font(.headline)
            } else {
                Text(s.worst).font(.caption2).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetLink.holdings(.attention).url)
    }

    /// "5 need attention · 2 blocked" — the count, and how much of it is
    /// serious.
    private func headline(_ s: LandSnapshot) -> String {
        guard s.attention > 0 else { return "Nothing outstanding" }
        var text = "\(s.attention) need\(s.attention == 1 ? "s" : "") attention"
        if s.blocking > 0 { text += " · \(s.blocking) blocked" }
        return text
    }
}

/// One holding and the worst thing wrong with it.
struct ProblemRow: View {
    let line: HoldingLine

    var body: some View {
        HStack(alignment: .top, spacing: Space.sm) {
            // Shape as well as colour: a red dot alone is invisible to a large
            // minority of people.
            Image(systemName: line.blocking > 0 ? "exclamationmark.octagon.fill" : "circle.dashed")
                .font(.caption2)
                .foregroundStyle(Palette.tint(for: line.verdict))
                .frame(width: 14)
            VStack(alignment: .leading, spacing: 0) {
                Text(line.name)
                    .font(.bodyCopy.weight(.medium))
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                Text(line.worst)
                    .font(.note)
                    .foregroundStyle(Palette.inkSoft)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}
