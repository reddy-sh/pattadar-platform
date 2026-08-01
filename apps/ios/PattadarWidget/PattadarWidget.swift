import PattadarKit
import SwiftUI
import WidgetKit

/// Your land on the Home Screen.
///
/// Reads only the snapshot the app leaves in the App Group — a widget has a
/// tight time budget and no credentials of its own, so fetching here would give
/// a blank widget more often than a fresh one.
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), snapshot: LandSnapshot(acres: 27.65, parcels: 22, passbooks: 2,
                                                   unpinned: 22, updated: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), snapshot: SharedSnapshot.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        // The app reloads the timeline whenever it refreshes, so this cadence is
        // only the floor for an app that has not been opened in a while.
        let next = Calendar.current.date(byAdding: .hour, value: 6, to: Date()) ?? Date()
        completion(Timeline(entries: [Entry(date: Date(), snapshot: SharedSnapshot.read())],
                            policy: .after(next)))
    }
}

struct Entry: TimelineEntry {
    let date: Date
    let snapshot: LandSnapshot?
}

struct PattadarWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: Entry

    var body: some View {
        if let s = entry.snapshot {
            switch family {
            case .systemSmall: small(s)
            default: medium(s)
            }
        } else {
            VStack(spacing: 4) {
                Image(systemName: "leaf").foregroundStyle(.green)
                Text("Open Pattadar").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func small(_ s: LandSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label("Land", systemImage: "leaf.fill")
                .font(.caption2).foregroundStyle(.green)
            Spacer()
            Text(s.acres, format: .number.precision(.fractionLength(2)))
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
            Text("acres").font(.caption).foregroundStyle(.secondary)
            Text("\(s.parcels) parcels").font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func medium(_ s: LandSnapshot) -> some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Label("Your land", systemImage: "leaf.fill")
                    .font(.caption).foregroundStyle(.green)
                Text(s.acres, format: .number.precision(.fractionLength(2)))
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit().minimumScaleFactor(0.6).lineLimit(1)
                Text("acres").font(.caption).foregroundStyle(.secondary)
            }
            Divider()
            VStack(alignment: .leading, spacing: 6) {
                stat("\(s.parcels)", "parcels")
                stat("\(s.passbooks)", "passbooks")
                if s.unpinned > 0 {
                    // The one actionable thing small enough to fit.
                    Label("\(s.unpinned) unpinned", systemImage: "mappin.slash")
                        .font(.caption2).foregroundStyle(.orange)
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        HStack(spacing: 4) {
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

@main
struct PattadarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PattadarLand", provider: Provider()) { entry in
            PattadarWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Your land")
        .description("Total acres, parcels and passbooks at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
