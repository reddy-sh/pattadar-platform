import Foundation

/// Geographic sanity checks for land records.
///
/// Ported from `packages/core/src/land/geo.ts`, pinned by `GeoVectorTests`.
///
/// The rule exists because a parcel in Mangala Kunta was saved with a pin in
/// Sunnyvale, California — 13,000 km away — because "Use my location" captures
/// the *device's* position and the app accepted it silently. That is the normal
/// case, not an edge case: people file land records at home, at an office, or
/// abroad. They are almost never standing on the land. A captured coordinate is
/// therefore a claim to be checked against what the record already says about
/// itself, never ground truth.
public struct LatLng: Codable, Equatable, Sendable {
    public var latitude: Double
    public var longitude: Double
    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

private let earthRadiusKm = 6371.0
private func toRad(_ deg: Double) -> Double { deg * .pi / 180 }

/// Great-circle distance in kilometres.
public func haversineKm(_ a: LatLng, _ b: LatLng) -> Double {
    let dLat = toRad(b.latitude - a.latitude)
    let dLon = toRad(b.longitude - a.longitude)
    let lat1 = toRad(a.latitude)
    let lat2 = toRad(b.latitude)
    let h = pow(sin(dLat / 2), 2) + pow(sin(dLon / 2), 2) * cos(lat1) * cos(lat2)
    return 2 * earthRadiusKm * asin(min(1, sqrt(h)))
}

/// How far a pin may sit from its village centre before we object.
///
/// A village geocode resolves to the settlement, while farmland belongs to the
/// revenue village and can lie several kilometres out. 50 km never nags about
/// legitimately outlying fields, and always trips on another district — let
/// alone another continent.
public let plausibleRadiusKm = 50.0

public struct LocationSanity: Sendable {
    /// True when the pin is implausibly far from where the record says it is.
    public let suspect: Bool
    public let distanceKm: Double
    /// Ready-to-render sentence; empty when nothing is wrong.
    public let message: String
}

/// Human distance: "1,200 km", "12 km", "800 m".
public func formatDistance(_ km: Double) -> String {
    if km < 1 { return "\(Int(km * 1000).rounded0) m" }
    if km < 10 { return String(format: "%.1f km", km) }
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_IN")   // 1,20,000 not 120,000
    f.maximumFractionDigits = 0
    return "\(f.string(from: NSNumber(value: km)) ?? "\(Int(km))") km"
}

/// Check a coordinate against the record's own locality.
///
/// `centroid` is the geocoded village/mandal. When it is unknown the answer is
/// "not suspect" — an UNVERIFIABLE pin must never be reported as a wrong one.
public func checkLocation(
    pin: LatLng?,
    centroid: LatLng?,
    placeName: String = "",
    radiusKm: Double = plausibleRadiusKm
) -> LocationSanity {
    guard let pin, let centroid else {
        return LocationSanity(suspect: false, distanceKm: 0, message: "")
    }
    let distanceKm = haversineKm(pin, centroid)
    guard distanceKm > radiusKm else {
        return LocationSanity(suspect: false, distanceKm: distanceKm, message: "")
    }
    let where_ = placeName.isEmpty ? " from this record’s village" : " from \(placeName)"
    return LocationSanity(
        suspect: true,
        distanceKm: distanceKm,
        message: "This location is \(formatDistance(distanceKm))\(where_). "
            + "Phones report where you are standing, not where the land is."
    )
}

private extension Int {
    var rounded0: Int { self }
}

/// The area-weighted centroid of a boundary ring — where the pin goes when a
/// record has a surveyed shape rather than a single point.
///
/// Ported from `ringCentroid` in `packages/core/src/land/geo.ts`, pinned by the
/// `rings` vectors. Averaging the corners instead would drag the pin towards
/// whichever edge the surveyor happened to mark most often; on an L-shaped
/// field the plain average can land outside the land altogether. The ring may
/// be open or closed. File imports select their parcel by spherical area
/// before computing this centroid; vertex count does not identify the parcel.
public func ringCentroid(_ ring: [LatLng]) -> LatLng? {
    let pts = ring.filter { $0.latitude.isFinite && $0.longitude.isFinite }
    if pts.isEmpty { return nil }
    if pts.count < 3 { return pts[0] }

    let first = pts[0]
    let last = pts[pts.count - 1]
    let open = (first.latitude == last.latitude && first.longitude == last.longitude)
        ? Array(pts.dropLast())
        : pts
    if open.count < 3 { return open[0] }

    var twiceArea = 0.0
    var lat = 0.0
    var lon = 0.0
    for i in open.indices {
        let a = open[i]
        let b = open[(i + 1) % open.count]
        let cross = a.longitude * b.latitude - b.longitude * a.latitude
        twiceArea += cross
        lat += (a.latitude + b.latitude) * cross
        lon += (a.longitude + b.longitude) * cross
    }
    // A degenerate ring (all corners collinear, or duplicated) has no area to
    // weight by; the plain average is then the only honest answer.
    if twiceArea == 0 {
        return LatLng(
            latitude: open.reduce(0) { $0 + $1.latitude } / Double(open.count),
            longitude: open.reduce(0) { $0 + $1.longitude } / Double(open.count)
        )
    }
    return LatLng(latitude: lat / (3 * twiceArea), longitude: lon / (3 * twiceArea))
}

/// The same four-part public village-map address as `mapKey` in core.
/// A missing segment cannot identify a map, even when the village is known.
public func mapKey(state: String, district: String, mandal: String, village: String) -> String {
    func fold(_ name: String) -> String {
        name.lowercased()
            .replacingOccurrences(of: "[^a-z]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "([tdbgkp])h", with: "$1", options: .regularExpression)
            .replacingOccurrences(of: "(.)\\1+", with: "$1", options: .regularExpression)
    }
    let parts = [state, district, mandal, village].map(fold)
    return parts.allSatisfy { !$0.isEmpty } ? parts.joined(separator: "/") : ""
}

/// Even-odd containment check, matching `pointInRing` in core.
public func pointInRing(_ point: LatLng, _ ring: [LatLng]) -> Bool {
    let corners = ring.filter { $0.latitude.isFinite && $0.longitude.isFinite }
    guard corners.count >= 3 else { return false }
    var inside = false
    for i in corners.indices {
        let j = i == 0 ? corners.count - 1 : i - 1
        let a = corners[i], b = corners[j]
        if (a.latitude > point.latitude) != (b.latitude > point.latitude),
           point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude)
             / (b.latitude - a.latitude) + a.longitude {
            inside.toggle()
        }
    }
    return inside
}

public let photoOnSiteRadiusM = 150.0

public enum PhotoGeoStatus: String, Sendable { case unknown, inside, near, outside, far }

public struct PhotoGeoCheck: Sendable {
    public let status: PhotoGeoStatus
    public let distanceM: Int
    public let suspect: Bool
    public let message: String
}

/// A photo without coordinates is unknown. A surveyed ring takes precedence
/// over the record pin; neither a nearby road nor a bad GPS fix is proof of fraud.
public func checkPhotoOnRecord(
    photo: LatLng?, recordPoint: LatLng?, ring: [LatLng] = [],
    radiusM: Double = photoOnSiteRadiusM
) -> PhotoGeoCheck {
    func valid(_ point: LatLng?) -> Bool {
        guard let point else { return false }
        return point.latitude.isFinite && point.longitude.isFinite
            && (point.latitude != 0 || point.longitude != 0)
    }
    guard valid(photo), let photo, valid(recordPoint) || ring.count >= 3 else {
        return PhotoGeoCheck(status: .unknown, distanceM: 0, suspect: false, message: "")
    }
    let reference = valid(recordPoint) ? recordPoint : ringCentroid(ring)
    let distanceM = reference.map { haversineKm(photo, $0) * 1000 } ?? 0
    let rounded = Int(distanceM.rounded())
    if ring.count >= 3 && pointInRing(photo, ring) {
        return PhotoGeoCheck(status: .inside, distanceM: rounded, suspect: false, message: "")
    }
    if distanceM <= radiusM {
        if ring.count >= 3 {
            return PhotoGeoCheck(status: .near, distanceM: rounded, suspect: false,
                message: "This photo was taken \(formatDistance(distanceM / 1000)) outside the boundary — likely from the edge of the land.")
        }
        return PhotoGeoCheck(status: .inside, distanceM: rounded, suspect: false, message: "")
    }
    let far = distanceM > radiusM * 10
    let location = ring.count >= 3 ? "from the property" : "from where this record is pinned"
    return PhotoGeoCheck(status: far ? .far : .outside, distanceM: rounded, suspect: true,
        message: "This photo's location is \(formatDistance(distanceM / 1000)) \(location). The phone's location may be wrong, or this may not be a photo of this land.")
}
