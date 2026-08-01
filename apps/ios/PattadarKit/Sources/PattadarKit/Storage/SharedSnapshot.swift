import Foundation
import WidgetKit

/// The few numbers the Home Screen widget shows, written by the app.
///
/// A widget extension is a SEPARATE process with its own sandbox: it cannot
/// read the app's Documents directory and it must not make the app's network
/// calls (no credentials, tight time budget). The App Group is the only shared
/// ground, so the app writes a tiny snapshot whenever it loads and the widget
/// only ever reads.
public struct LandSnapshot: Codable, Sendable {
    public let acres: Double
    public let parcels: Int
    public let passbooks: Int
    public let unpinned: Int
    public let updated: Date

    public init(acres: Double, parcels: Int, passbooks: Int, unpinned: Int, updated: Date) {
        self.acres = acres
        self.parcels = parcels
        self.passbooks = passbooks
        self.unpinned = unpinned
        self.updated = updated
    }
}

public enum SharedSnapshot {
    public static let appGroup = "group.com.rfactory.pattadar"
    private static let key = "land-snapshot"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    public static func write(acres: Double, parcels: Int, passbooks: Int, unpinned: Int) {
        let snap = LandSnapshot(acres: acres, parcels: parcels, passbooks: passbooks,
                                unpinned: unpinned, updated: Date())
        guard let data = try? JSONEncoder().encode(snap) else { return }
        defaults?.set(data, forKey: key)
        // Tell the widget to redraw; without this it waits for its own timeline.
        WidgetCenter.shared.reloadAllTimelines()
    }

    public static func read() -> LandSnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(LandSnapshot.self, from: data)
    }
}
