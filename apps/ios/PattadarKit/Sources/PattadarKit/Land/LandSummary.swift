import Foundation

/// What a person holds, totalled the way they would say it.
///
/// These rules lived inside the Home screen, where the widget could not reach
/// them. A widget that re-derived "how many acres" from the same rows would
/// have drifted from the dashboard the first time either was touched — two
/// numbers for one holding, on the same phone, is the worst failure this app
/// can have. So the arithmetic moved here: Home and every widget read the same
/// function, and `swift test` can check it without a simulator.

/// Totalled per kind, each in its own unit, with the passbooks they sit on.
public func landTotals(parcels: [Parcel], properties: [Property],
                       passbooks: [Passbook]) -> [KindTotal] {
    var rows: [KindTotal] = []

    /// Distinct passbooks these parcels are filed under. A `passbookId`
    /// pointing at a passbook that is not there is a broken link, not a fifth
    /// khata, so it is not counted.
    let known = Set(passbooks.map(\.id))
    func passbookCount(_ parcels: [Parcel]) -> Int {
        Set(parcels.map(\.passbookId).filter { known.contains($0) }).count
    }

    // THE UNIT FOLLOWS THE LAND, NOT THE FILING.
    //
    // A 25-acre field bought on a deed arrives as a "property", and grouping
    // by filing converted it into 1,21,000 square yards on the plots card — a
    // number nobody in India says. People know their land as ACRES of fields
    // and SQUARE YARDS of sites, and the two are never combined.
    func isAcreMeasured(_ p: Property) -> Bool {
        switch unitKey(p.landUnit) {
        case .acre, .cent, .gunta, .hectare: p.landArea > 0
        default: false
        }
    }

    let agri = parcels.filter { !$0.classification.lowercased().contains("non") }
    let acreProperties = properties.filter(isAcreMeasured)
    if !agri.isEmpty || !acreProperties.isEmpty {
        let propertyAcres = acreProperties.reduce(0.0) {
            $0 + toAcres($1.landArea, unitKey($1.landUnit))
        }
        rows.append(.init(kind: .farmland,
                          amount: agri.reduce(0) { $0 + $1.extent } + propertyAcres,
                          count: agri.count + acreProperties.count,
                          passbooks: passbookCount(agri)))
    }
    // Non-agricultural parcels are sites held under a passbook — square yards,
    // like any other site.
    let nonAgri = parcels.filter { $0.classification.lowercased().contains("non") }

    // Properties, grouped by what they actually are — minus the acre-measured
    // ones, which are farmland whatever their filing says.
    var byKind: [HoldingKind: [Property]] = [:]
    for p in properties where !isAcreMeasured(p) {
        byKind[HoldingKind.of(propertyType: p.type), default: []].append(p)
    }
    for kind in [HoldingKind.plot, .home, .commercial] {
        let items = byKind[kind] ?? []
        let extraParcels = kind == .plot ? nonAgri : []
        guard !items.isEmpty || !extraParcels.isEmpty else { continue }

        var total = 0.0
        for p in items {
            if let a = headlineArea(propertyType: p.type,
                                    landArea: p.landArea, landUnit: p.landUnit,
                                    builtupArea: p.builtupArea, builtupUnit: p.builtupUnit) {
                total += convert(a.value, from: a.unit, to: kind.unit)
            }
        }
        // A parcel's extent is acres; convert into the kind's unit.
        for p in extraParcels { total += fromAcres(p.extent, kind.unit) }

        rows.append(.init(kind: kind, amount: total,
                          count: items.count + extraParcels.count,
                          // Only the parcels carry a khata. A flat bought on a
                          // registered deed has none, and "0 passbooks" under
                          // it reads as something missing rather than
                          // something inapplicable.
                          passbooks: passbookCount(extraParcels)))
    }
    // A FIXED order — land, plots, homes, commercial. Sorting by value made
    // the cards swap places whenever a figure was entered, and a dashboard
    // whose tiles move is one you have to read every time instead of glance at.
    let order: [HoldingKind] = [.farmland, .plot, .home, .commercial]
    return rows.sorted {
        (order.firstIndex(of: $0.kind) ?? 9) < (order.firstIndex(of: $1.kind) ?? 9)
    }
}

/// One holding with its verdict — the flattened line a widget can draw, beside
/// the full `Readiness` a screen can open up.
public struct AssessedHolding: Sendable {
    public let line: HoldingLine
    public let readiness: Readiness

    public init(line: HoldingLine, readiness: Readiness) {
        self.line = line
        self.readiness = readiness
    }
}

/// Every holding assessed against what a buyer's advocate would ask for.
///
/// `favourites` is the app's set of "type:id" keys, so a starred holding can
/// be offered first when a widget has room for only one.
public func assessHoldings(parcels: [Parcel], properties: [Property],
                           passbooks: [Passbook], documents: [RegisteredDocument],
                           favourites: Set<String> = [],
                           thisYear: Int) -> [AssessedHolding] {
    let documentedParcels = Set(documents.map(\.parcelId))
    let documentedProperties = Set(documents.map(\.propertyId))
    let village = Dictionary(passbooks.map { ($0.id, $0.village) },
                             uniquingKeysWith: { first, _ in first })

    func assembled(id: String, name: String, place: String, kind: HoldingKind,
                   extent: String, readiness: Readiness) -> AssessedHolding {
        let worst = readiness.blocking.first ?? readiness.failures.first
        return AssessedHolding(
            line: HoldingLine(id: id, name: name, place: place, kind: kind,
                              extent: extent,
                              checks: readiness.checks.count,
                              passed: readiness.checks.count - readiness.failures.count,
                              blocking: readiness.blocking.count,
                              worst: worst?.problem ?? "",
                              starred: favourites.contains(id)),
            readiness: readiness)
    }

    let assessedParcels = parcels.map { p -> AssessedHolding in
        let readiness = assessReadiness(ReadinessInput(
            hasTitleDocument: documentedParcels.contains(p.id),
            hasLocation: parseGeoPoint(p.geoPoint) != nil,
            hasRegistrationNumber: !p.regDocNo.isEmpty,
            mutationStatus: p.mutationStatus, ecStatus: p.ecStatus,
            taxPaidUpto: p.taxPaidUpto, litigation: p.litigation), thisYear: thisYear)
        // A non-agricultural parcel is a SITE held under a passbook, and a
        // site is spoken of in square yards. `extent` is canonical acres, so
        // rendering it raw put "0.05 Acres" under a 240 sq. yd plot — right,
        // and useless, which is the category error `landTotals` exists to
        // avoid on the card above it.
        let kind: HoldingKind = p.classification.lowercased().contains("non") ? .plot : .farmland
        return assembled(
            id: "parcel:\(p.id)",
            // Subdivision included, exactly as the holdings list titles it.
            // Without it a passbook with 45/1 and 45/2 offers the widget's
            // picker two entries both called "Sy 45".
            name: "Sy \(p.surveyNo)" + (p.subdivision.isEmpty ? "" : "/\(p.subdivision)"),
            place: village[p.passbookId] ?? "",
            kind: kind,
            extent: areaText(fromAcres(p.extent, kind.unit), kind.unit),
            readiness: readiness)
    }

    let assessedProperties = properties.map { p -> AssessedHolding in
        let readiness = assessReadiness(ReadinessInput(
            hasTitleDocument: documentedProperties.contains(p.id),
            hasLocation: parseGeoPoint(p.geoPoint) != nil,
            hasRegistrationNumber: !p.regDocNo.isEmpty,
            mutationStatus: p.mutationStatus, ecStatus: p.ecStatus,
            taxPaidUpto: p.taxPaidUpto, litigation: p.litigation), thisYear: thisYear)
        let area = headlineArea(propertyType: p.type, landArea: p.landArea,
                                landUnit: p.landUnit, builtupArea: p.builtupArea,
                                builtupUnit: p.builtupUnit)
        return assembled(
            id: "property:\(p.id)",
            name: p.label.isEmpty ? (p.city.isEmpty ? "Property" : p.city) : p.label,
            place: [p.locality, p.city].filter { !$0.isEmpty }.joined(separator: ", "),
            kind: HoldingKind.of(propertyType: p.type),
            extent: area.map { areaText($0.value, $0.unit) } ?? "",
            readiness: readiness)
    }

    return assessedParcels + assessedProperties
}

public extension LandSnapshot {
    /// How many holdings a snapshot will carry.
    ///
    /// The App Group is `UserDefaults`, not a database: it is read on every
    /// widget refresh and it belongs to the whole app, so it stays small. The
    /// configurable widget picks from this list, which makes the cap the
    /// ceiling on what can be pinned — worth stating rather than discovering.
    static let holdingCap = 60

    /// Everything the widgets will show, decided here, once.
    static func build(stats: DashboardStats, holdings: HoldingsResponse,
                      documents: [RegisteredDocument], favourites: Set<String> = [],
                      waiting: Int = 0, now: Date = Date(),
                      calendar: Calendar = .current) -> LandSnapshot {
        let assessed = assessHoldings(
            parcels: holdings.parcels, properties: holdings.properties,
            passbooks: holdings.passbooks, documents: documents,
            favourites: favourites, thisYear: calendar.component(.year, from: now))

        // The share of ALL checks across ALL holdings, not an average of
        // averages — one perfect parcel must not paper over four broken ones.
        let checks = assessed.reduce(0) { $0 + $1.line.checks }
        let passed = assessed.reduce(0) { $0 + $1.line.passed }
        let failing = assessed.filter { !$0.line.isReady }

        // Starred first, then the worst, then the largest: what survives the
        // cap is what a person would have pinned anyway.
        let ordered = assessed.map(\.line).sorted { a, b in
            if a.starred != b.starred { return a.starred }
            if a.score != b.score { return a.score < b.score }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }

        return LandSnapshot(
            acres: stats.totalExtent,
            parcels: stats.totalParcels,
            passbooks: stats.totalPassbooks,
            unpinned: holdings.parcels.filter { parseGeoPoint($0.geoPoint) == nil }.count,
            documents: stats.totalDocuments,
            waiting: waiting,
            readiness: checks == 0 ? 0 : Int((Double(passed) / Double(checks)) * 100),
            attention: failing.count,
            blocking: failing.filter { $0.line.blocking > 0 }.count,
            worst: worstSentence(failing),
            kinds: landTotals(parcels: holdings.parcels, properties: holdings.properties,
                              passbooks: holdings.passbooks),
            holdings: Array(ordered.prefix(holdingCap)),
            updated: now)
    }
}

/// "Sy 121/2 — mutation still pending". Names the holding rather than counting
/// them: "three parcels need attention" sends somebody hunting.
private func worstSentence(_ failing: [AssessedHolding]) -> String {
    guard let first = failing.min(by: { $0.line.score < $1.line.score }) else { return "" }
    let problem = first.line.worst
    guard !problem.isEmpty else { return "" }
    return "\(first.line.name) — \(problem.prefix(1).lowercased() + problem.dropFirst())"
}
