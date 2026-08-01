import Foundation

/// Deciding whether two spellings are the same village.
///
/// Ported from `packages/core/src/land/villages.ts`, which exists because one
/// person's records say "Katragunta" and the revenue paper says "Katraguntla",
/// and a chart that treats those as two villages presents a typo as a fact.
///
/// The map needs the same judgement for a different reason: when the geocoder
/// answers a search for "Katragunta" with somewhere called something else, the
/// app must know that it MISSED rather than quietly aiming there.
///
/// The threshold is scaled by length, and short names never merge. That is not
/// a tuning choice — "Guntur" and "Guntakal" are four edits apart and are
/// different districts, while "Mahrajapuram" and "Markapuram" are three apart
/// and are one place.
func levenshtein(_ a: String, _ b: String) -> Int {
    if a == b { return 0 }
    let x = Array(a), y = Array(b)
    if x.isEmpty || y.isEmpty { return max(x.count, y.count) }
    var prev = Array(0...y.count)
    for i in 1...x.count {
        var cur = [i] + Array(repeating: 0, count: y.count)
        for j in 1...y.count {
            cur[j] = min(prev[j] + 1,
                         cur[j - 1] + 1,
                         prev[j - 1] + (x[i - 1] == y[j - 1] ? 0 : 1))
        }
        prev = cur
    }
    return prev[y.count]
}

private func normalizeName(_ s: String) -> String {
    s.trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
        .components(separatedBy: .whitespaces)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
}

/// How far apart two spellings of the same name may be.
public func nameMergeThreshold(_ length: Int) -> Int {
    if length <= 4 { return 0 }
    if length <= 9 { return 2 }
    return 3
}

/// Whether two written names plausibly name the same settlement.
public func villageNamesMatch(_ a: String, _ b: String) -> Bool {
    let x = normalizeName(a), y = normalizeName(b)
    guard !x.isEmpty, !y.isEmpty else { return false }
    if x == y { return true }
    // "Mangala Kunta" and "Mangalakunta" are one village written two ways;
    // spacing is not a spelling difference.
    let tight = { (s: String) in s.replacingOccurrences(of: " ", with: "") }
    if tight(x) == tight(y) { return true }
    let a = tight(x), b = tight(y)

    // The FIRST letter must agree, and this is a deliberate divergence from the
    // TypeScript rule, which merges on edit distance alone.
    //
    // "Tarlapadu" and "Nallapadu" are exactly two edits apart — inside the
    // threshold — and are two different villages 60 km apart in Prakasam. The
    // shared rule silently treats them as one. It survives in a chart, where the
    // worst case is a mislabelled bar; it does not survive here, where it would
    // let the map report that it had found your village while aiming at
    // somebody else's.
    //
    // The initial consonant is the most stable part of a transliterated Indian
    // place name — variation lives in internal vowels and in the suffix
    // ("-gunta"/"-guntla", "-puram"/"-apuram"), not at the start.
    guard a.first == b.first else { return false }

    let limit = min(nameMergeThreshold(a.count), nameMergeThreshold(b.count))
    return levenshtein(a, b) <= limit
}

/// Whether any of the names a geocoder returned is the village that was asked
/// for. A result may carry the village in `name`, `subLocality` or `locality`
/// depending on how the place is classified, so all of them are candidates.
public func matchesRequestedVillage(_ requested: String, candidates: [String?]) -> Bool {
    guard !normalizeName(requested).isEmpty else { return false }
    return candidates.compactMap { $0 }.contains { villageNamesMatch(requested, $0) }
}
