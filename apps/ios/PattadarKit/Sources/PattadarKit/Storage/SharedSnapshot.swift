import Foundation
import WidgetKit

/// One kind of holding, totalled in the unit that kind is spoken in.
///
/// Never summed across kinds: 27 acres of farmland and 400 square yards of
/// sites are two facts, not one number (see `HoldingKind.unit`).
public struct KindTotal: Codable, Sendable, Identifiable, Equatable {
    public let kind: HoldingKind
    /// Already converted into `kind.unit`.
    public let amount: Double
    public let count: Int
    /// Passbooks these are filed under. Nought where the kind has none — a
    /// flat bought on a deed carries no khata.
    public let passbooks: Int

    public var id: String { kind.rawValue }

    public init(kind: HoldingKind, amount: Double, count: Int, passbooks: Int) {
        self.kind = kind
        self.amount = amount
        self.count = count
        self.passbooks = passbooks
    }
}

/// One holding, flattened to the few strings a widget can draw.
///
/// The widget has no network and no credentials, so everything it will ever
/// show has to be decided here, in the app, and written down. That includes
/// the readiness arithmetic: `checks`/`passed` rather than a score, so a
/// summary over several holdings is the share of ALL checks and never an
/// average of averages.
public struct HoldingLine: Codable, Sendable, Identifiable, Equatable {
    /// "parcel:<uuid>" or "property:<uuid>" — the same shape the favourites
    /// table keys on, and what a deep link from the widget carries back.
    public let id: String
    /// "Sy 121/2", or a property's label.
    public let name: String
    /// Village, or the city a property sits in. Empty when unknown.
    public let place: String
    public let kind: HoldingKind
    /// "27.65 ac" — already in the unit this kind is quoted in.
    public let extent: String
    public let checks: Int
    public let passed: Int
    /// Failures that stop a sale rather than merely untidy the file.
    public let blocking: Int
    /// The worst thing wrong with it, in words. Empty when nothing is.
    public let worst: String
    public let starred: Bool

    public var score: Int {
        guard checks > 0 else { return 0 }
        return Int((Double(passed) / Double(checks)) * 100)
    }

    public var isReady: Bool { passed == checks }

    /// The same three-way rule `Readiness.verdict` applies, so a widget colours
    /// a holding exactly as its own screen does — no second set of cutoffs.
    public var verdict: ReadinessVerdict {
        if blocking > 0 { return .blocked }
        return isReady ? .ready : .untidy
    }

    public init(id: String, name: String, place: String, kind: HoldingKind,
                extent: String, checks: Int, passed: Int, blocking: Int,
                worst: String, starred: Bool) {
        self.id = id
        self.name = name
        self.place = place
        self.kind = kind
        self.extent = extent
        self.checks = checks
        self.passed = passed
        self.blocking = blocking
        self.worst = worst
        self.starred = starred
    }
}

/// Everything the Home Screen, Lock Screen and Control Centre are allowed to
/// know, written by the app.
///
/// A widget extension is a SEPARATE process with its own sandbox: it cannot
/// read the app's Documents directory and it must not make the app's network
/// calls (no credentials, tight time budget). The App Group is the only shared
/// ground, so the app writes this whenever it loads and the widget only reads.
public struct LandSnapshot: Codable, Sendable {
    public let acres: Double
    public let parcels: Int
    public let passbooks: Int
    /// Parcels with no pin on the map — the one gap a person can close in a
    /// minute, standing in the field.
    public let unpinned: Int
    public let documents: Int
    /// Readings that finished while nobody was looking and still want a
    /// yes or no. The only number here that is asking for something.
    public let waiting: Int
    /// 0–100: the share of ALL readiness checks across ALL holdings.
    public let readiness: Int
    /// Holdings failing at least one check.
    public let attention: Int
    /// Holdings failing a check that stops a sale.
    public let blocking: Int
    /// One sentence naming the worst of them — "Kondapur — mutation still
    /// pending". Empty when every holding would stand up today.
    public let worst: String
    public let kinds: [KindTotal]
    /// Capped (see `LandSnapshot.build`); the configurable widget picks from
    /// these, so the cap is the ceiling on what can be pinned.
    public let holdings: [HoldingLine]
    public let updated: Date

    public init(acres: Double, parcels: Int, passbooks: Int, unpinned: Int,
                documents: Int, waiting: Int, readiness: Int, attention: Int,
                blocking: Int, worst: String, kinds: [KindTotal],
                holdings: [HoldingLine], updated: Date) {
        self.acres = acres
        self.parcels = parcels
        self.passbooks = passbooks
        self.unpinned = unpinned
        self.documents = documents
        self.waiting = waiting
        self.readiness = readiness
        self.attention = attention
        self.blocking = blocking
        self.worst = worst
        self.kinds = kinds
        self.holdings = holdings
        self.updated = updated
    }

    /// True when there is nothing on file yet — the widget says "add your
    /// first record" rather than drawing a wall of zeroes.
    public var isEmpty: Bool { parcels == 0 && holdings.isEmpty && acres == 0 }

    /// The portfolio's verdict, by the same rule one holding's is reached.
    public var verdict: ReadinessVerdict {
        if blocking > 0 { return .blocked }
        return attention > 0 ? .untidy : .ready
    }
}

public enum SharedSnapshot {
    public static let appGroup = "group.com.rfactory.pattadar"

    /// Bumped whenever the shape changes.
    ///
    /// A payload written by an older build is then simply not found, and the
    /// widget says "Open Pattadar" until the app runs once. That is honest;
    /// decoding half of a stale payload and drawing the rest is not.
    private static let key = "land-snapshot-2"
    private static let filingKey = "widget-wants-filing"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroup)
    }

    public static func write(_ snapshot: LandSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults?.set(data, forKey: key)
        // Tell every widget to redraw; without this they wait for their own
        // timeline, which is hours away.
        WidgetCenter.shared.reloadAllTimelines()
    }

    public static func read() -> LandSnapshot? {
        guard let data = defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(LandSnapshot.self, from: data)
    }

    // MARK: - The Control Centre button

    /// Left by the Control Centre / Lock Screen control, which can launch the
    /// app but cannot tell it why. The app takes it on the way up.
    public static func requestFiling() {
        defaults?.set(true, forKey: filingKey)
    }

    /// Read once and cleared, so a filing sheet opens for the tap that asked
    /// for it and not for every launch afterwards.
    public static func takeFilingRequest() -> Bool {
        guard defaults?.bool(forKey: filingKey) == true else { return false }
        defaults?.removeObject(forKey: filingKey)
        return true
    }
}

/// Where a tap on a widget lands.
///
/// Shared rather than spelled out on both sides: the widget builds these and
/// the app parses them, and a typo in one half is a tap that does nothing.
public enum WidgetLink: Equatable, Sendable {
    case home
    case holdings(Filter)
    /// A `HoldingLine.id`.
    case holding(String)
    case vault
    /// File a paper — the app's one verb.
    case file

    /// Stable tokens rather than the filter's display name: the URL is a
    /// contract, and "Needs attention" is a label that can be reworded.
    public enum Filter: String, Sendable {
        case all, agricultural, plots, attention, favourites
    }

    public static let scheme = "pattadar"

    public var url: URL {
        switch self {
        case .home: Self.make("home")
        case .holdings(let f): Self.make("holdings", f.rawValue)
        case .holding(let id): Self.make("holding", id)
        case .vault: Self.make("vault")
        case .file: Self.make("file")
        }
    }

    private static func make(_ host: String, _ tail: String? = nil) -> URL {
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = host
        if let tail { parts.path = "/" + tail }
        // Every case above produces a valid URL; the force is a programmer
        // error, not a runtime condition.
        return parts.url!
    }

    public init?(_ url: URL) {
        guard url.scheme == Self.scheme else { return nil }
        let tail = url.path.hasPrefix("/") ? String(url.path.dropFirst()) : url.path
        switch url.host() {
        case "home": self = .home
        case "vault": self = .vault
        case "file": self = .file
        case "holdings": self = .holdings(Filter(rawValue: tail) ?? .all)
        case "holding":
            guard !tail.isEmpty else { return nil }
            self = .holding(tail)
        // Anything else — the Cognito callback above all — is not ours.
        default: return nil
        }
    }
}
