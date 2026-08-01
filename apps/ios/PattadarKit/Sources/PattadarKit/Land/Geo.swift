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
