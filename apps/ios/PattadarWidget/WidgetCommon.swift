import PattadarKit
import SwiftUI
import WidgetKit

/// The pieces every Pattadar widget is built from.
///
/// A widget extension is its own process. It cannot see the app's screens, it
/// has no credentials and it gets a fraction of a second to draw, so it never
/// fetches: it reads the snapshot the app leaves in the App Group and nothing
/// else. Everything below is therefore about DRAWING a `LandSnapshot` — the
/// deciding all happened in `LandSnapshot.build`.
///
/// The look comes from `DesignSystem.swift`, compiled into this target as well
/// as the app's. Two palettes for one product is how a widget ends up being
/// recognisably a different app from the app it belongs to.

/// One reading of the snapshot, at one moment.
struct LandEntry: TimelineEntry {
    let date: Date
    let snapshot: LandSnapshot?
}

/// The provider behind every widget that shows the whole portfolio.
struct LandProvider: TimelineProvider {
    func placeholder(in context: Context) -> LandEntry {
        LandEntry(date: .now, snapshot: .sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (LandEntry) -> Void) {
        // The gallery — and the strip under the app icon — must never show a
        // stranger's blank widget, so a preview always draws the sample.
        completion(LandEntry(date: .now,
                             snapshot: context.isPreview ? .sample : SharedSnapshot.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LandEntry>) -> Void) {
        // The app reloads every timeline whenever it loads, so this cadence is
        // only the floor for an app nobody has opened in a while. Land does not
        // change by the minute; asking more often would spend the widget's
        // refresh budget saying the same thing.
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: .now) ?? .now
        completion(Timeline(entries: [LandEntry(date: .now, snapshot: SharedSnapshot.read())],
                            policy: .after(next)))
    }
}

// MARK: - Chrome

/// Every widget on iOS 17 and later must declare its own background, and the
/// accessory families must NOT draw one — a card behind a Lock Screen widget
/// is a smudge, not a card.
private struct WidgetCanvas: ViewModifier {
    @Environment(\.widgetFamily) private var family
    let tint: Color

    func body(content: Content) -> some View {
        switch family {
        case .accessoryCircular:
            content.containerBackground(for: .widget) { AccessoryWidgetBackground() }
        case .accessoryInline, .accessoryRectangular:
            content.containerBackground(for: .widget) { Color.clear }
        default:
            content.containerBackground(for: .widget) {
                ZStack {
                    Palette.card
                    // The same wash `KindCard` puts behind a dashboard tile, so
                    // a widget reads as a card lifted off Home rather than a
                    // new kind of surface.
                    LinearGradient(colors: [tint.opacity(0.20), tint.opacity(0.04)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
        }
    }
}

extension View {
    func widgetCanvas(_ tint: Color) -> some View { modifier(WidgetCanvas(tint: tint)) }
}

/// The small uppercase line that names what a widget is showing.
struct WidgetHeading: View {
    let text: String
    let icon: String
    var tint: Color = Palette.accent

    var body: some View {
        HStack(spacing: Space.xs) {
            Image(systemName: icon).imageScale(.small)
            Text(text.uppercased()).kerning(0.6).lineLimit(1)
        }
        .font(.label)
        .foregroundStyle(tint)
    }
}

/// A figure with its unit, set the way the dashboard sets one.
struct WidgetFigure: View {
    let value: String
    let unit: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Space.xs) {
            Text(value)
                .font(.figure)
                .foregroundStyle(Palette.ink)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Text(unit)
                .font(.bodyCopy)
                .foregroundStyle(Palette.inkSoft)
        }
    }
}

/// What a widget says when it has nothing to say.
///
/// One message, not two: from out here a signed-out account and an empty one
/// are indistinguishable — the App Group is simply empty — and guessing which
/// would put a wrong sentence on somebody's Home Screen. Never a wall of
/// zeroes either: nought acres is a claim about somebody's land.
struct WidgetNothingYet: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Text("Open Pattadar")
        case .accessoryCircular:
            Image(systemName: "leaf")
        case .accessoryRectangular:
            VStack(alignment: .leading) {
                Text("Pattadar").font(.headline)
                Text("Open to see your land").font(.caption)
            }
        default:
            VStack(alignment: .leading, spacing: Space.xs) {
                WidgetHeading(text: "Pattadar", icon: "leaf.fill")
                Spacer(minLength: 0)
                Text("Open Pattadar")
                    .font(.recordTitle)
                    .foregroundStyle(Palette.ink)
                    .minimumScaleFactor(0.7)
                Text("Your land appears here once the app has run.")
                    .font(.note)
                    .foregroundStyle(Palette.inkSoft)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

// MARK: - The sample

extension LandSnapshot {
    /// What the widget gallery draws, and what the strip under the app icon
    /// shows before anything is added.
    ///
    /// It has to look like a real record — this is the first thing most people
    /// ever see of Pattadar's widgets, and a preview full of zeroes reads as a
    /// broken app rather than an empty one.
    static let sample = LandSnapshot(
        acres: 27.65, parcels: 22, passbooks: 4, unpinned: 3,
        documents: 18, waiting: 1,
        readiness: 78, attention: 5, blocking: 2,
        worst: "Sy 121/2 — mutation still pending",
        kinds: [
            KindTotal(kind: .farmland, amount: 27.65, count: 22, passbooks: 4),
            KindTotal(kind: .plot, amount: 1210, count: 3, passbooks: 0),
            KindTotal(kind: .home, amount: 2020, count: 1, passbooks: 0),
        ],
        holdings: [
            HoldingLine(id: "parcel:sample-1", name: "Sy 121/2", place: "Katraguntla",
                        kind: .farmland, extent: "8.20 Acres", checks: 7, passed: 4,
                        blocking: 1, worst: "Mutation still pending", starred: true),
            HoldingLine(id: "parcel:sample-2", name: "Sy 84", place: "Nandikandi",
                        kind: .farmland, extent: "4.50 Acres", checks: 7, passed: 6,
                        blocking: 0, worst: "Not pinned on the map", starred: false),
            HoldingLine(id: "property:sample-3", name: "Kondapur plot", place: "Kondapur, Hyderabad",
                        kind: .plot, extent: "418.5 Sq. yards", checks: 7, passed: 7,
                        blocking: 0, worst: "", starred: false),
        ],
        updated: .now)
}
