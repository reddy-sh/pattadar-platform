import AppIntents
import PattadarKit
import SwiftUI
import WidgetKit

/// One holding you chose, on the Home Screen.
///
/// The configurable one: hold the widget, pick a survey number, and that field
/// is on your Home Screen with its extent and its verdict. Somebody with
/// twenty parcels has two or three they are actually dealing with this month,
/// and a total cannot say anything about those.
struct HoldingWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "PattadarHolding", intent: PickHolding.self,
                               provider: HoldingProvider()) { entry in
            HoldingWidgetView(entry: entry)
                .widgetCanvas(entry.line.map { Palette.tint(for: $0.kind) } ?? Palette.accent)
        }
        .configurationDisplayName("A holding")
        .description("Pin one survey number or property, with what it still needs.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// MARK: - Choosing one

/// A holding as the widget's editing sheet lists it.
struct HoldingEntity: AppEntity {
    let id: String
    let name: String
    let place: String

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Holding"
    static let defaultQuery = HoldingQuery()

    var displayRepresentation: DisplayRepresentation {
        let where_: LocalizedStringResource? = place.isEmpty ? nil : "\(place)"
        return DisplayRepresentation(title: "\(name)", subtitle: where_)
    }
}

/// The list offered when somebody edits the widget.
///
/// Read from the App Group like everything else here — the extension has no
/// credentials, so a holding that has never been seen by the app cannot be
/// offered. Before the app has run once the sample is offered instead, which
/// keeps the editing sheet from being an empty list with no explanation.
struct HoldingQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [HoldingEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [HoldingEntity] { all() }

    private func all() -> [HoldingEntity] {
        (SharedSnapshot.read() ?? .sample).holdings.map {
            HoldingEntity(id: $0.id, name: $0.name, place: $0.place)
        }
    }
}

struct PickHolding: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Choose a holding"
    static let description = IntentDescription("Pick which property this widget shows.")

    @Parameter(title: "Holding")
    var holding: HoldingEntity?

    init() {}
}

// MARK: - The timeline

struct HoldingEntry: TimelineEntry {
    let date: Date
    let line: HoldingLine?
    /// Set when a holding WAS chosen and is no longer on file — said out loud
    /// rather than silently swapping in a different one, which would put the
    /// wrong field's acreage under a name somebody trusts.
    let missing: String?
}

struct HoldingProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> HoldingEntry {
        HoldingEntry(date: .now, line: LandSnapshot.sample.holdings.first, missing: nil)
    }

    func snapshot(for configuration: PickHolding, in context: Context) async -> HoldingEntry {
        context.isPreview
            ? placeholder(in: context)
            : resolve(configuration)
    }

    func timeline(for configuration: PickHolding, in context: Context) async -> Timeline<HoldingEntry> {
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: .now) ?? .now
        return Timeline(entries: [resolve(configuration)], policy: .after(next))
    }

    private func resolve(_ configuration: PickHolding) -> HoldingEntry {
        guard let snapshot = SharedSnapshot.read(), !snapshot.holdings.isEmpty else {
            return HoldingEntry(date: .now, line: nil, missing: nil)
        }
        guard let chosen = configuration.holding else {
            // Nothing picked yet: the snapshot's first line is the starred one,
            // or else the one in the most trouble — the likeliest choice.
            return HoldingEntry(date: .now, line: snapshot.holdings.first, missing: nil)
        }
        guard let line = snapshot.holdings.first(where: { $0.id == chosen.id }) else {
            return HoldingEntry(date: .now, line: nil, missing: chosen.name)
        }
        return HoldingEntry(date: .now, line: line, missing: nil)
    }
}

// MARK: - Drawing it

struct HoldingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: HoldingEntry

    var body: some View {
        if let line = entry.line {
            switch family {
            case .accessoryRectangular: rectangular(line)
            case .systemMedium: medium(line)
            default: small(line)
            }
        } else if let missing = entry.missing {
            Gone(name: missing)
        } else {
            WidgetNothingYet()
        }
    }

    private func small(_ line: HoldingLine) -> some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            WidgetHeading(text: line.place.isEmpty ? line.kind.noun : line.place,
                          icon: line.kind.icon,
                          tint: Palette.tint(for: line.kind))
            Spacer(minLength: 0)
            // Serif, like a holding's own screen: this is the name of a thing
            // you own, not a label on a control.
            Text(line.name)
                .font(.recordTitle)
                .foregroundStyle(Palette.ink)
                .minimumScaleFactor(0.6)
                .lineLimit(2)
            Text(line.extent)
                .font(.bodyCopy)
                .monospacedDigit()
                .foregroundStyle(Palette.inkSoft)
                .lineLimit(1)
            VerdictChip(line: line)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(WidgetLink.holding(line.id).url)
    }

    private func medium(_ line: HoldingLine) -> some View {
        HStack(alignment: .top, spacing: Space.lg) {
            VStack(alignment: .leading, spacing: Space.xs) {
                WidgetHeading(text: line.place.isEmpty ? line.kind.noun : line.place,
                              icon: line.kind.icon,
                              tint: Palette.tint(for: line.kind))
                Spacer(minLength: 0)
                Text(line.name)
                    .font(.recordTitle)
                    .foregroundStyle(Palette.ink)
                    .minimumScaleFactor(0.6)
                    .lineLimit(2)
                Text(line.extent)
                    .font(.bodyCopy)
                    .monospacedDigit()
                    .foregroundStyle(Palette.inkSoft)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: Space.sm) {
                VerdictChip(line: line)
                Text(line.isReady
                     ? "Nothing outstanding on this one."
                     : line.worst)
                    .font(.note)
                    .foregroundStyle(line.isReady ? Palette.inkSoft : Palette.ink)
                    .lineLimit(3)
                Spacer(minLength: 0)
                Text("\(line.passed) of \(line.checks) checks pass")
                    .font(.note)
                    .foregroundStyle(Palette.inkFaint)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .widgetURL(WidgetLink.holding(line.id).url)
    }

    private func rectangular(_ line: HoldingLine) -> some View {
        VStack(alignment: .leading, spacing: Space.hair) {
            Text(line.name).font(.headline).lineLimit(1).widgetAccentable()
            Text(line.extent).font(.caption).lineLimit(1)
            Text(line.isReady ? "In order" : line.worst).font(.caption2).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(WidgetLink.holding(line.id).url)
    }

    /// The holding this widget was pointed at is not in the records any more.
    private struct Gone: View {
        let name: String

        var body: some View {
            VStack(alignment: .leading, spacing: Space.xs) {
                WidgetHeading(text: "Not on file", icon: "questionmark.folder",
                              tint: Palette.inkFaint)
                Spacer(minLength: 0)
                Text(name)
                    .font(.recordTitle)
                    .foregroundStyle(Palette.ink)
                    .lineLimit(2)
                Text("This is no longer in your records. Hold the widget to pick another.")
                    .font(.note)
                    .foregroundStyle(Palette.inkSoft)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .widgetURL(WidgetLink.holdings(.all).url)
        }
    }
}

/// Ready, untidy or blocked — in a word and a shape, not only a colour.
struct VerdictChip: View {
    let line: HoldingLine

    private var wording: (String, String) {
        switch line.verdict {
        case .ready: ("In order", "checkmark.seal.fill")
        case .untidy: ("\(line.checks - line.passed) to tidy", "circle.dashed")
        case .blocked: ("Can’t be sold", "exclamationmark.octagon.fill")
        }
    }

    var body: some View {
        let (text, icon) = wording
        HStack(spacing: Space.xs) {
            Image(systemName: icon).font(.caption2)
            Text(text).font(.label)
        }
        .foregroundStyle(Palette.tint(for: line.verdict))
        .padding(.horizontal, Space.sm)
        .padding(.vertical, Space.xs)
        .background(
            Capsule().fill(Palette.tint(for: line.verdict).opacity(0.14))
        )
    }
}
