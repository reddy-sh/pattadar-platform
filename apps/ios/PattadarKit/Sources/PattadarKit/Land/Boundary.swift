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

/// The reader's `boundary_points` — the FMB point table as extracted — into
/// the wire format. Tolerant about key names and number-vs-string values,
/// because it crosses a JSON boundary; strict about everything else: bad
/// rows are dropped, and fewer than 3 good corners is no boundary.
public func boundaryPointsText(_ raw: Any?) -> String {
    guard let list = raw as? [[String: Any]] else { return "" }
    let corners = list.compactMap { point -> LatLng? in
        func number(_ keys: [String]) -> Double? {
            for key in keys {
                if let v = point[key] as? Double { return v }
                if let v = point[key] as? Int { return Double(v) }
                if let s = point[key] as? String,
                   let v = Double(s.trimmingCharacters(in: .whitespaces)) { return v }
            }
            return nil
        }
        guard let lat = number(["lat", "latitude"]),
              let lng = number(["lng", "lon", "long", "longitude"]),
              abs(lat) <= 90, abs(lng) <= 180, lat != 0 || lng != 0
        else { return nil }
        return LatLng(latitude: lat, longitude: lng)
    }
    return corners.count >= 3 ? boundaryText(corners) : ""
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

// MARK: - Portable boundary files (packages/core/land/boundaryFile.ts)

public struct ParsedBoundary: Sendable, Equatable {
    public let ring: [LatLng]
    public let format: String
    public let name: String
}

public struct BoundaryFileError: LocalizedError, Sendable {
    public let message: String
    public var errorDescription: String? { message }
    public init(_ message: String) { self.message = message }
}

/// Spherical area uses the same radius and expression as core.ringAreaSqM.
public func ringAreaSqM(_ ring: [LatLng]) -> Double {
    guard ring.count >= 3 else { return 0 }
    let rad = Double.pi / 180
    var sum = 0.0
    for i in ring.indices {
        let a = ring[i], b = ring[(i + 1) % ring.count]
        sum += (b.longitude * rad - a.longitude * rad)
            * (2 + sin(a.latitude * rad) + sin(b.latitude * rad))
    }
    return abs(sum * 6_378_137 * 6_378_137 / 2)
}

public func parseBoundaryFile(_ text: String, fileName: String = "") throws -> ParsedBoundary {
    func capture(_ pattern: String, in source: String, group: Int = 1) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let hit = regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
              let range = Range(hit.range(at: group), in: source) else { return nil }
        return String(source[range])
    }
    func point(_ lon: Double, _ lat: Double) -> LatLng? {
        guard lat.isFinite, lon.isFinite, abs(lat) <= 90, abs(lon) <= 180 else { return nil }
        return LatLng(latitude: lat, longitude: lon)
    }
    func finish(_ corners: [LatLng], format: String, name: String) throws -> ParsedBoundary {
        var ring = corners
        if ring.count > 1, ring.first == ring.last { ring.removeLast() }
        ring = ring.enumerated().compactMap { i, p in i == 0 || ring[i - 1] != p ? p : nil }
        guard ring.count >= 3 else {
            throw BoundaryFileError("That file has fewer than three corners, so it does not enclose any land.")
        }
        return ParsedBoundary(ring: ring, format: format, name: name)
    }
    let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else { throw BoundaryFileError("That file is empty.") }
    if body.hasPrefix("<") || fileName.lowercased().hasSuffix(".kml") {
        let scope = capture("<Polygon\\b[\\s\\S]*?</Polygon>", in: body, group: 0) ?? body
        guard let block = capture("<coordinates>([\\s\\S]*?)</coordinates>", in: scope) else {
            throw BoundaryFileError("That KML has no <coordinates> in it.")
        }
        let corners = block.split(whereSeparator: { $0.isWhitespace }).compactMap { token -> LatLng? in
            let pair = token.split(separator: ",", omittingEmptySubsequences: false)
            guard pair.count >= 2, let lon = Double(pair[0]), let lat = Double(pair[1]) else { return nil }
            return point(lon, lat)
        }
        return try finish(corners, format: "kml", name:
            (capture("<name>([\\s\\S]*?)</name>", in: body) ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    }
    guard let root = try? JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any] else {
        throw BoundaryFileError("That file is not readable as KML or GeoJSON.")
    }
    func geoRing(_ node: Any?) -> [[Double]]? {
        guard let o = node as? [String: Any], let type = o["type"] as? String else { return nil }
        switch type {
        case "FeatureCollection":
            for f in o["features"] as? [Any] ?? [] { if let ring = geoRing(f) { return ring } }
            return nil
        case "Feature": return geoRing(o["geometry"])
        case "Polygon": return (o["coordinates"] as? [[[Double]]])?.first
        case "MultiPolygon":
            let rings = (o["coordinates"] as? [[[[Double]]]] ?? []).compactMap(\.first)
            // A well-house with more vertices must not replace the parcel.
            return rings.max { a, b in
                func area(_ ring: [[Double]]) -> Double {
                    let points = ring.compactMap { $0.count >= 2 ? point($0[0], $0[1]) : nil }
                    return points.count == ring.count ? ringAreaSqM(points) : -1
                }
                return area(a) < area(b)
            }
        case "LineString": return o["coordinates"] as? [[Double]]
        default: return nil
        }
    }
    guard let coordinates = geoRing(root) else { throw BoundaryFileError("That GeoJSON has no polygon in it.") }
    let corners = coordinates.compactMap { $0.count >= 2 ? point($0[0], $0[1]) : nil }
    let properties = root["properties"] as? [String: Any] ?? [:]
    let name = String(describing: properties["name"] ?? properties["village"] ?? "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    return try finish(corners, format: "geojson", name: name)
}

public struct BoundaryExportMeta: Sendable {
    public var title = ""
    public var village = ""
    public var khataNo = ""
    public var ownerName = ""
    public var areaAcres: Double?
    public var perimeterM: Double?
    public init() {}
}

public func toBoundaryGeoJson(_ ring: [LatLng], meta: BoundaryExportMeta = .init()) throws -> String {
    let corners = ring.filter { $0.latitude.isFinite && $0.longitude.isFinite }
    guard corners.count >= 3 else { throw BoundaryFileError("A boundary needs three corners before it can be exported.") }
    var pairs = corners.map { [$0.longitude, $0.latitude] }
    pairs.append(pairs[0])
    var properties: [String: Any] = ["corners": corners.count]
    for (key, value) in [("survey_no", meta.title), ("village", meta.village),
                         ("khata_no", meta.khataNo), ("owner_name", meta.ownerName)] where !value.isEmpty {
        properties[key] = value
    }
    if let area = meta.areaAcres { properties["area_ac"] = floor(area * 100 + 0.5) / 100 }
    if let perimeter = meta.perimeterM { properties["perimeter_m"] = floor(perimeter * 10 + 0.5) / 10 }
    let data = try JSONSerialization.data(withJSONObject: [
        "type": "Feature", "geometry": ["type": "Polygon", "coordinates": [pairs]],
        "properties": properties,
    ], options: [.prettyPrinted, .sortedKeys])
    return String(decoding: data, as: UTF8.self)
}

public func boundaryFileName(title: String = "", village: String = "") -> String {
    let stem = [title, village].filter { !$0.isEmpty }.joined(separator: " ")
        .replacingOccurrences(of: "[/\\\\:*?\"<>|]", with: "-", options: .regularExpression)
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
    return stem.isEmpty ? "boundary.geojson" : "\(stem) boundary.geojson"
}

// MARK: - Fence planning (packages/core/land/landcalc.ts)

public struct FenceOptions: Codable, Sendable {
    public var spacing: Double
    public var strands: Double
    public var closed: Bool?
    public var costPerPost: Double?
    public var costPerMetre: Double?
    public init(spacing: Double, strands: Double, closed: Bool = true,
                costPerPost: Double = 0, costPerMetre: Double = 0) {
        self.spacing = spacing; self.strands = strands; self.closed = closed
        self.costPerPost = costPerPost; self.costPerMetre = costPerMetre
    }
}

public struct FenceSide: Codable, Sendable, Equatable {
    public let metres: Double
    public let posts: Int
    public let spacing: Double
}

public struct FencePlan: Codable, Sendable {
    public let perimeter: Double
    public let sides: Int
    public let corners: Int
    public let cornerPosts: Int
    public let linePosts: Int
    public let posts: Int
    public let wire: Double
    public let postCost: Double
    public let wireCost: Double
    public let cost: Double
    public let bySide: [FenceSide]
}

public func fencePlan(_ sideMetres: [Double], options: FenceOptions) -> FencePlan {
    let lengths = sideMetres.filter { $0 > 0 && $0.isFinite }
    let perimeter = lengths.reduce(0, +)
    let corners = lengths.isEmpty ? 0 : (options.closed != false ? lengths.count : lengths.count + 1)
    let bySide = lengths.map { metres -> FenceSide in
        let intervals = options.spacing > 0 ? max(1, ceil(metres / options.spacing)) : 1
        return FenceSide(metres: metres, posts: Int(intervals) - 1, spacing: metres / intervals)
    }
    let linePosts = bySide.reduce(0) { $0 + $1.posts }
    let posts = corners + linePosts
    let wire = perimeter * max(0, options.strands)
    let postCost = Double(posts) * (options.costPerPost ?? 0)
    let wireCost = wire * (options.costPerMetre ?? 0)
    return FencePlan(perimeter: perimeter, sides: lengths.count, corners: corners,
                     cornerPosts: corners, linePosts: linePosts, posts: posts,
                     wire: wire, postCost: postCost, wireCost: wireCost,
                     cost: postCost + wireCost, bySide: bySide)
}
