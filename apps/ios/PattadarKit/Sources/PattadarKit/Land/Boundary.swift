import Foundation

/// The surveyed outline of a holding, from an FMB point table.
///
/// An FMB sheet ends in a table — Point Id, Easting, Northing, Latitude,
/// Longitude — and the side lengths printed on the sketch are nothing more
/// than the distances between consecutive points. Given those corners this
/// draws the same sketch: the polygon, each side's length, and the enclosed
/// extent, which can then be held up against what the passbook claims.
///
/// Stored on the wire as `"lat,lng;lat,lng;…"` in corner order — the same
/// family as `geo_point`'s single `"lat,lng"`, so nothing new to escape.
///
/// The maths is planar on an equirectangular projection: at survey scale
/// (sides of tens to hundreds of metres) the earth's curvature is far below
/// the surveyor's own rounding, and pinning to the sheet proves it — the
/// projected 1→2 distance on the Mangalakunta sheet reproduces the printed
/// 58.04 m to within centimetres.

/// Parse `"lat,lng;lat,lng;…"`. Blanks and malformed corners are dropped;
/// fewer than 3 good corners is no boundary at all.
public func parseBoundary(_ text: String) -> [LatLng] {
    let corners = text.split(separator: ";").compactMap { pair -> LatLng? in
        let parts = pair.split(separator: ",")
        guard parts.count == 2,
              let lat = Double(parts[0].trimmingCharacters(in: .whitespaces)),
              let lng = Double(parts[1].trimmingCharacters(in: .whitespaces)),
              abs(lat) <= 90, abs(lng) <= 180
        else { return nil }
        return LatLng(latitude: lat, longitude: lng)
    }
    return corners.count >= 3 ? corners : []
}

/// The other direction, for saving what was entered.
public func boundaryText(_ corners: [LatLng]) -> String {
    corners.map { String(format: "%.6f,%.6f", $0.latitude, $0.longitude) }
        .joined(separator: ";")
}

/// Corners projected to metres in a local frame — x east, y north, origin at
/// the centroid of the corners. This is what both the sketch and the area
/// are computed from, so they can never disagree.
public func projectToMetres(_ corners: [LatLng]) -> [(x: Double, y: Double)] {
    guard !corners.isEmpty else { return [] }
    let lat0 = corners.map(\.latitude).reduce(0, +) / Double(corners.count)
    let lng0 = corners.map(\.longitude).reduce(0, +) / Double(corners.count)
    let metresPerDegree = 6_371_000.0 * .pi / 180
    let cosLat = cos(lat0 * .pi / 180)
    return corners.map { c in
        (x: (c.longitude - lng0) * metresPerDegree * cosLat,
         y: (c.latitude - lat0) * metresPerDegree)
    }
}

/// Each side's length in metres, in corner order, closing back to the first —
/// the numbers written along the edges of an FMB sketch.
public func boundarySideMetres(_ corners: [LatLng]) -> [Double] {
    let pts = projectToMetres(corners)
    guard pts.count >= 2 else { return [] }
    return (0..<pts.count).map { i in
        let a = pts[i], b = pts[(i + 1) % pts.count]
        return ((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)).squareRoot()
    }
}

/// The enclosed extent in ACRES — shoelace over the projected corners.
/// Canonical acres, because that is what `parcel.extent` is stored in and
/// the whole point is comparing the two.
public func boundaryAcres(_ corners: [LatLng]) -> Double {
    let pts = projectToMetres(corners)
    guard pts.count >= 3 else { return 0 }
    var doubled = 0.0
    for i in 0..<pts.count {
        let a = pts[i], b = pts[(i + 1) % pts.count]
        doubled += a.x * b.y - b.x * a.y
    }
    let squareMetres = abs(doubled) / 2
    return squareMetres / 4046.8564224
}

/// "58 m" / "296 m" / "1.2 km" — a side length as a surveyor would say it.
public func sideLengthText(_ metres: Double) -> String {
    metres < 1000 ? "\(Int(metres.rounded())) m"
                  : String(format: "%.1f km", metres / 1000)
}

/// How the drawn extent compares with the recorded one; empty when they
/// agree within the tolerance or there is nothing to compare.
///
/// 7.5% — FMB corners hand-typed from a scanned table, against an extent
/// written in guntas seventy years ago, will disagree a little for honest
/// reasons. Beyond that the more likely explanations are a wrong corner or a
/// wrong record, and both deserve a sentence.
public func boundaryExtentMismatch(drawnAcres: Double, recordedAcres: Double) -> String {
    guard drawnAcres > 0, recordedAcres > 0 else { return "" }
    let ratio = drawnAcres / recordedAcres
    guard ratio < 0.925 || ratio > 1.075 else { return "" }
    return String(format: "The drawn boundary encloses %.2f acres; the record says %.2f. "
        + "One corner off by a digit is the usual reason.", drawnAcres, recordedAcres)
}
