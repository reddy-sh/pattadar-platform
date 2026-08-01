import Foundation

/// Land-area units. The canonical unit is the ACRE: a parcel's `extent` is
/// decimal acres and its `unit` is only a provenance label saying how the
/// number was written down.
///
/// This mirrors `packages/core/src/land/units.ts` exactly, and is held to it by
/// `UnitVectorTests` reading `vectors/units.json`. That is not ceremony: the
/// two implementations have already drifted once inside a single language —
/// one screen converted through `toAcres` and another wrote the raw number, so
/// a scanned "40 Guntas" would have been filed as forty ACRES. Across a
/// language boundary the same mistake is invisible until someone's holding is
/// overstated by a factor of forty.
public enum UnitKey: String, CaseIterable, Sendable {
    case acre, cent, gunta, sqyd, sqft, sqm, hectare, ankanam

    /// Square feet in one of this unit — the unambiguous base everything
    /// converts through.
    public var squareFeet: Double {
        switch self {
        case .sqft: 1
        case .sqyd: 9
        case .sqm: 10.7639104
        case .ankanam: 72          // the AP/Telangana value
        case .cent: 435.6          // 43560 / 100
        case .gunta: 1089          // 43560 / 40
        case .acre: 43560
        case .hectare: 107639.104
        }
    }

    public var label: String {
        switch self {
        case .acre: "Acres"
        case .cent: "Cents"
        case .gunta: "Guntas"
        case .sqyd: "Sq. yards"
        case .sqft: "Sq. feet"
        case .sqm: "Sq. metres"
        case .hectare: "Hectares"
        case .ankanam: "Ankanam"
        }
    }
}

private let squareFeetPerAcre = 43560.0

/// Resolve a free-text unit label — as a passbook, a deed or the AI extractor
/// wrote it — to a known unit.
///
/// Order matters and is load-bearing: the legacy label "Acres-Guntas" contains
/// both words, and it means DECIMAL ACRES, so acre must be tested first. Every
/// parcel currently in the database carries that label; reading it as guntas
/// would divide every holding by forty.
public func unitKey(_ label: String?) -> UnitKey {
    let s = (label ?? "").lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
    if let exact = UnitKey(rawValue: s) { return exact }
    if s.contains("acre") { return .acre }
    if s.contains("gunta") { return .gunta }
    if s.contains("cent") { return .cent }
    if s.contains("hect") { return .hectare }
    if s.contains("ankan") { return .ankanam }
    if s.contains("yard") || s.contains("sq.yd") || s.contains("sqyd") { return .sqyd }
    if s.contains("metre") || s.contains("meter") || s.contains("sq.m") || s.contains("sqm") { return .sqm }
    if s.contains("feet") || s.contains("sq.ft") || s.contains("sqft") { return .sqft }
    // An unrecognised label is treated as acres because that is what the
    // canonical column already holds; guessing a smaller unit would silently
    // shrink the holding.
    return .acre
}

public func toAcres(_ value: Double, _ unit: UnitKey) -> Double {
    value * unit.squareFeet / squareFeetPerAcre
}

public func fromAcres(_ acres: Double, _ unit: UnitKey) -> Double {
    acres * squareFeetPerAcre / unit.squareFeet
}

public func convert(_ value: Double, from: UnitKey, to: UnitKey) -> Double {
    fromAcres(toAcres(value, from), to)
}

// MARK: - The two entities do NOT store area the same way

/// A parcel's `extent` is canonical DECIMAL ACRES and its `unit` is only a
/// provenance label. A property's `landArea` is the number as WRITTEN, in
/// `landUnit` — 418.5 with unit "Sq.yd" means 418.5 square yards, not 418.5
/// acres.
///
/// Getting this backwards rendered a 418 sq.yd plot as "2,025,420 Sq.yd" on
/// the dashboard, and silently inflated every acre subtotal that mixed the two.
/// These two helpers exist so no screen has to remember which convention
/// applies to which table.

/// Acres for a property, for totalling and sorting alongside parcels.
public func propertyAcres(landArea: Double, landUnit: String) -> Double {
    toAcres(landArea, unitKey(landUnit))
}

/// A property's area as it should be READ — in the unit it was filed in.
/// Converting a 200 sq.yd site to "0.04 ac" is correct and useless.
public func propertyAreaText(landArea: Double, landUnit: String) -> String {
    guard landArea > 0 else { return "" }
    let u = unitKey(landUnit)
    return String(format: "%g %@", landArea, u.label)
}

// MARK: - Each kind of holding has its own unit

/// What a holding is measured in, in India.
///
/// Farmland is acres. An open plot or site is square yards. A house, flat or
/// shop is square FEET of built-up area — "2,020 sq ft at Rajapushpa" is how
/// that is said, and nobody quotes a flat in acres.
///
/// Adding them into a single total is not a summary, it is a category error:
/// 27 acres of farmland and 400 sq yd of sites are not one number.
public enum HoldingKind: String, CaseIterable, Sendable {
    case farmland, plot, home, commercial

    public static func of(propertyType: String) -> HoldingKind {
        switch propertyType {
        case "open_plot": .plot
        case "commercial": .commercial
        case "flat", "independent_house", "villa": .home
        default: .plot
        }
    }

    public var label: String {
        switch self {
        case .farmland: "Agricultural land"
        case .plot: "Open plots & sites"
        case .home: "Houses & flats"
        case .commercial: "Commercial"
        }
    }

    /// What ONE of these is called. `label` names the category on a dashboard;
    /// this names the thing on its own screen.
    public var noun: String {
        switch self {
        case .farmland: "farmland"
        case .plot: "plot"
        case .home: "house"
        case .commercial: "commercial property"
        }
    }

    public var icon: String {
        switch self {
        case .farmland: "leaf.fill"
        case .plot: "square.dashed"
        case .home: "house.fill"
        case .commercial: "storefront.fill"
        }
    }

    /// The unit this kind is quoted in.
    public var unit: UnitKey {
        switch self {
        case .farmland: .acre
        case .plot: .sqyd
        case .home, .commercial: .sqft
        }
    }
}

/// The number that means something for a property, and what it is measured in.
///
/// For a building it is the BUILT-UP area — a flat's land share is meaningless
/// and usually zero. For a site it is the land. Falls back to whichever is
/// present, so a house with no built-up figure still shows its plot rather
/// than a blank.
public func headlineArea(propertyType: String,
                         landArea: Double, landUnit: String,
                         builtupArea: Double, builtupUnit: String) -> (value: Double, unit: UnitKey)? {
    let kind = HoldingKind.of(propertyType: propertyType)
    switch kind {
    case .home, .commercial:
        if builtupArea > 0 { return (builtupArea, unitKey(builtupUnit)) }
        if landArea > 0 { return (landArea, unitKey(landUnit)) }
        return nil
    default:
        if landArea > 0 { return (landArea, unitKey(landUnit)) }
        if builtupArea > 0 { return (builtupArea, unitKey(builtupUnit)) }
        return nil
    }
}

/// An extent written for a person: "418.5 Sq. yards", "30.00 Acres".
///
/// Acres carry two decimals because a tenth of an acre is 484 square yards and
/// people quote them that way; the smaller units are whole numbers, since half a
/// square foot is noise.
public func areaText(_ amount: Double, _ unit: UnitKey) -> String {
    // Trailing zeros are dropped, but a real fraction is NEVER rounded away:
    // a 418.5 sq. yd plot printed as "419" on the dashboard while its own
    // screen said 418.5 is the app disagreeing with itself about the size of
    // somebody's land.
    let digits: Int = {
        switch unit {
        case .acre, .hectare: return 2
        case .gunta, .cent: return 2
        default: return 1
        }
    }()
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_IN")
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = digits
    let n = f.string(from: NSNumber(value: amount)) ?? String(amount)
    return "\(n) \(unit.label)"
}
