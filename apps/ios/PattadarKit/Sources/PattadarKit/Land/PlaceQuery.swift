import Foundation

/// The address string handed to the geocoder when aiming the map at a holding.
///
/// This is the difference between the map opening on your field and opening on
/// another state. Three failures have already been paid for here:
///
/// 1. **A missing mandal.** Village names repeat constantly within a district —
///    "Katragunta" is not unique in Prakasam — and the mandal is what separates
///    them. Parcels were geocoded on village + district alone.
/// 2. **A repeated name.** A village that shares its name with its mandal
///    produced "Markapuram, Markapuram, Prakasam", which geocodes worse than
///    naming the place once.
/// 3. **Nothing at all.** When the passbook had not loaded, the string
///    collapsed to "India" — and a query that names no place leaves the map
///    wherever it happened to be, which on a fresh install is California.
///
/// Order is deliberate: smallest first. A geocoder resolves "village, mandal,
/// district, state" to the village; the reverse resolves to the state.
public func placeQuery(_ parts: [String?], country: String = "India") -> String {
    var seen = Set<String>()
    var out: [String] = []
    for part in parts.compactMap({ $0 }) {
        let t = part.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { continue }
        // A village named after its mandal must not be said twice.
        guard seen.insert(t.lowercased()).inserted else { continue }
        out.append(t)
    }
    // A country on its own is not a place to aim at; say so by returning
    // nothing, so callers can tell "no location known" from "somewhere in India".
    guard !out.isEmpty else { return "" }
    if !country.isEmpty, !seen.contains(country.lowercased()) { out.append(country) }
    return out.joined(separator: ", ")
}

/// Whether a place string names anywhere specific enough to aim a map at.
public func canAimAt(_ place: String) -> Bool { !place.isEmpty }

/// The states this app files in.
public let defaultState = "Andhra Pradesh"

/// Place names to try on a geocoder, most specific first, for a record whose
/// address reads "Konakanamitla, Prakasam".
///
/// Ported from `placeCandidates` in `packages/core/src/land/geo.ts`, pinned by
/// the `places` vectors. `placeQuery` above builds ONE string to aim at;
/// this builds the ladder to climb when that string finds nothing.
///
/// The obvious ladder — drop the front of the chain one part at a time — is
/// not enough, and fails on exactly the records that need it. OpenStreetMap
/// files Konakanamitla under Markapuram, so "Konakanamitla, Prakasam, Andhra
/// Pradesh" matches NOTHING and the next rung is the whole district: a 20 km
/// frame for a village that would have resolved on its own. So each part is
/// also tried alone against the state, most specific first, and only then do
/// we widen.
public func placeCandidates(_ placeLine: String, state: String = defaultState) -> [String] {
    let parts = placeLine
        .split(separator: ",", omittingEmptySubsequences: false)
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }

    var tries: [String] = []
    if parts.count > 1 { tries.append((parts + [state]).joined(separator: ", ")) }
    tries.append(contentsOf: parts.map { "\($0), \(state)" })
    tries.append(state)

    // The TypeScript ends in `new Set(tries)`, which keeps FIRST-seen order.
    // A plain Set here would climb the ladder in whatever order hashing chose.
    var seen = Set<String>()
    return tries.filter { seen.insert($0).inserted }
}
