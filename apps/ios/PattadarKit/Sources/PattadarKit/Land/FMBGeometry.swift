import Foundation

/// The §13 stored shape, decoded from the reading — ring, corners, sides
/// with bearings and printed lengths, area, and the cross-checks. The server
/// derived everything; the client computes NOTHING except unit conversion,
/// which lives at the bottom of this file.
public struct FMBGeometry: Sendable {
    public struct Point: Sendable, Identifiable {
        public let id: Int
        /// Projected metres (easting/northing) — every distance runs on these.
        public let e: Double
        public let n: Double
        /// Geographic degrees — for copy, device GPS and "open in Maps",
        /// never for computing a length.
        public let lat: Double
        public let lon: Double
    }

    public struct Side: Sendable, Identifiable {
        public let from: Int
        public let to: Int
        /// Computed from the coordinates — the truth.
        public let m: Double
        /// What the sheet printed, riding alongside; nil when unlabelled.
        public let printedM: Double?
        /// Grid bearing, clockwise from north — not magnetic.
        public let bearing: Double
        /// Whose land lies beyond this side.
        public let beyond: String
        /// surveyed | measured_only | walked. A red measured line is not a
        /// walked boundary, and the difference is first-class.
        public let state: String
        public var id: String { "\(from)-\(to)" }
        public var isMeasuredOnly: Bool { state == "measured_only" }
    }

    public struct Check: Sendable {
        public let code: String
        public let ok: Bool
        public let deltaPct: Double?
        public let sheetAc: Double?
        public let fieldAc: Double?
    }

    /// drawing | lengths | inferred — "inferred" means the ring was an
    /// angular guess and the user must be asked to confirm.
    public let orderSource: String
    public let datumStated: Bool
    public let ring: [Int]
    public let points: [Point]
    public let sides: [Side]
    public let areaM2: Double
    public let areaAc: Double
    public let perimeterM: Double
    public let checks: [Check]

    /// Corners in ring order — what the polygon draws.
    public var ringPoints: [Point] {
        let byID = Dictionary(uniqueKeysWithValues: points.map { ($0.id, $0) })
        return ring.compactMap { byID[$0] }
    }

    public var areaCheck: Check? { checks.first { $0.code == "area_vs_sheet" } }
    public var portionExceedsField: Bool {
        checks.contains { $0.code == "portion_exceeds_field" && !$0.ok }
    }
}

/// Decode `reading["geometry"]` — tolerant of numbers-as-strings the way
/// every reading parser here is. Returns nil when the sheet never yielded a
/// corner table (the raster path shows the scan, not a map).
public func fmbGeometry(_ reading: [String: Any]) -> FMBGeometry? {
    guard let g = reading["geometry"] as? [String: Any] else { return nil }
    func num(_ value: Any?) -> Double? {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let s = value as? String { return Double(s) }
        return nil
    }
    guard let ringRaw = g["ring"] as? [Any],
          let pointsRaw = g["points"] as? [[String: Any]],
          let sidesRaw = g["sides"] as? [[String: Any]] else { return nil }
    let ring = ringRaw.compactMap { num($0).map(Int.init) }
    let points = pointsRaw.compactMap { p -> FMBGeometry.Point? in
        guard let id = num(p["id"]), let e = num(p["e"]), let n = num(p["n"])
        else { return nil }
        return FMBGeometry.Point(id: Int(id), e: e, n: n,
                                 lat: num(p["lat"]) ?? 0, lon: num(p["lon"]) ?? 0)
    }
    let sides = sidesRaw.compactMap { s -> FMBGeometry.Side? in
        guard let from = num(s["from"]), let to = num(s["to"]),
              let m = num(s["m"]), let bearing = num(s["bearing"])
        else { return nil }
        return FMBGeometry.Side(
            from: Int(from), to: Int(to), m: m,
            printedM: num(s["printed_m"]),
            bearing: bearing,
            beyond: (s["beyond"] as? String) ?? "",
            state: (s["state"] as? String) ?? "surveyed")
    }
    guard ring.count >= 3, points.count >= 3, sides.count == ring.count else { return nil }
    let crs = g["crs"] as? [String: Any] ?? [:]
    let checks = (g["checks"] as? [[String: Any]] ?? []).map { c in
        FMBGeometry.Check(code: (c["code"] as? String) ?? "",
                          ok: (c["ok"] as? Bool) ?? false,
                          deltaPct: num(c["delta_pct"]),
                          sheetAc: num(c["sheet_ac"]),
                          fieldAc: num(c["field_ac"]))
    }
    return FMBGeometry(
        orderSource: (g["order_source"] as? String) ?? "inferred",
        datumStated: (crs["datum_stated"] as? Bool) ?? false,
        ring: ring, points: points, sides: sides,
        areaM2: num(g["area_m2"]) ?? 0,
        areaAc: num(g["area_ac"]) ?? 0,
        perimeterM: num(g["perimeter_m"]) ?? 0,
        checks: checks)
}

// MARK: - Units (§5)

/// One toggle, metres ⇄ feet, governing every length on the screen at once.
/// Lengths convert; AREAS DO NOT — area stays in acres and cents because
/// that is what deeds, 1B and adangal all speak.
public enum LengthUnit: String, Sendable, CaseIterable {
    case metres, feet

    /// 1 m = 3.280839895 ft, exactly.
    public static let feetPerMetre = 3.280839895

    public var label: String { self == .metres ? "m" : "ft" }
}

/// Map labels: metres to 2 decimals, feet to whole numbers.
public func mapLengthText(_ metres: Double, unit: LengthUnit) -> String {
    switch unit {
    case .metres: String(format: "%.2f m", metres)
    case .feet: String(format: "%.0f ft", metres * LengthUnit.feetPerMetre)
    }
}

/// The tip panel: metres to 2 decimals, feet to 1 decimal.
public func panelLengthText(_ metres: Double, unit: LengthUnit) -> String {
    switch unit {
    case .metres: String(format: "%.2f m", metres)
    case .feet: String(format: "%.1f ft", metres * LengthUnit.feetPerMetre)
    }
}

/// Bearings are grid bearings, one decimal, with the degree sign.
public func bearingText(_ degrees: Double) -> String {
    String(format: "%.1f°", degrees)
}
