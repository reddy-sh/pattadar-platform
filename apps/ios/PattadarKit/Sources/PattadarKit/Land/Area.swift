import Foundation

/// Read an extent out of a deed, as a human wrote it.
///
/// Ported from `packages/core/src/land/area.ts` and pinned to it by
/// `AreaVectorTests` reading `vectors/areas.json`.
///
/// The rule that matters is the LAST one: take the first number, never a
/// concatenation of every digit present. Stripping non-digits from a real
/// Guntur deed reading "418-1/2 sq. yards" produced **41812** square yards —
/// a hundred-fold overstatement that both the app and the API shipped.
public func parseAreaSqYd(_ raw: String?) -> Double {
    let s = (raw ?? "")
        .lowercased()
        .replacingOccurrences(of: ",", with: "")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    guard !s.isEmpty else { return 0 }

    // "418-1/2" or "418 1/2" — a whole number followed by a vulgar fraction.
    // Checked first because the bare-fraction and first-number rules below
    // would both read it wrongly.
    if let m = firstMatch(#"(\d+)\s*[-\s]\s*(\d+)\s*/\s*(\d+)"#, in: s), m.count == 4 {
        let whole = Double(m[1]) ?? 0
        let num = Double(m[2]) ?? 0
        let den = Double(m[3]) ?? 0
        return den == 0 ? whole : whole + num / den
    }

    // A bare fraction: "1/2".
    if let m = firstMatch(#"^(\d+)\s*/\s*(\d+)"#, in: s), m.count == 3 {
        let den = Double(m[2]) ?? 0
        return den == 0 ? 0 : (Double(m[1]) ?? 0) / den
    }

    // Otherwise the first number in the string.
    if let m = firstMatch(#"\d+(?:\.\d+)?"#, in: s), let v = Double(m[0]) {
        return v
    }
    return 0
}

/// Groups of the first match, or nil. Index 0 is the whole match.
/// Shared within the package: the date parser needs the same helper.
func firstMatch(_ pattern: String, in s: String) -> [String]? {
    guard let re = try? NSRegularExpression(pattern: pattern),
          let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s))
    else { return nil }
    return (0..<m.numberOfRanges).map { i in
        guard let r = Range(m.range(at: i), in: s) else { return "" }
        return String(s[r])
    }
}

/// Read an extent AND the unit it was written in.
///
/// `parseAreaSqYd` only ever returns a number, and every caller then assumed
/// square yards — because deeds for house-sites are written that way. A ROR
/// saying "30.00 acres" was therefore filed as 30 SQUARE YARDS: the holding
/// understated by a factor of 4,840, silently, on the automated path.
///
/// The unit has to come from the same string as the number, or it is a guess.
public func parseExtent(_ raw: String?, default fallback: UnitKey = .sqyd) -> (value: Double, unit: UnitKey) {
    let full = (raw ?? "").lowercased()

    // AP deeds write acres-and-cents with a hyphen: "Ac 25-30" is 25 acres
    // and 30 cents — 25.30 acres, since 100 cents make an acre. It is not a
    // fraction and not 25.30 cents; a reading that got this wrong shrank a
    // holding a hundredfold, from 25 acres to a quarter of one.
    if let m = firstMatch(#"(?:\bac\b|\bacs\b|acres?)[\s.]*([0-9]+)\s*-\s*([0-9]{1,2})\b"#, in: full),
       let acres = Double(m[1]), let cents = Double(m[2]) {
        return (acres + cents / 100, .acre)
    }

    let value = parseAreaSqYd(raw)

    // The unit belongs to the FIRST number, not to whatever unit word appears
    // anywhere in the string. "C.G.191 sq.yds (159.70 sq.mtrs)" is 191 square
    // YARDS; the metric figure in brackets is a conversion of it, and reading
    // the string as a whole picked up the wrong one.
    let text: String = {
        guard let m = firstMatch(#"\d+(?:\.\d+)?"#, in: full), let n = m.first,
              let r = full.range(of: n) else { return full }
        let after = String(full[r.upperBound...])
        // Stop at an opening bracket: what follows is a restatement.
        let head = after.split(separator: "(", maxSplits: 1, omittingEmptySubsequences: false)[0]
        return head.isEmpty ? full : String(head)
    }()

    let unit: UnitKey
    if text.contains("hect") {
        unit = .hectare
    } else if text.contains("gunta") && !text.contains("acre") {
        unit = .gunta
    } else if text.contains("acre") || text.contains("ac.") || text.contains("ekar") {
        unit = .acre
    } else if text.contains("cent") {
        unit = .cent
    } else if text.contains("ankan") {
        unit = .ankanam
    } else if text.contains("sq.m") || text.contains("sq m") || text.contains("mtr")
                || text.contains("metre") || text.contains("meter") {
        unit = .sqm
    } else if text.contains("sq.ft") || text.contains("sq ft") || text.contains("feet") {
        unit = .sqft
    } else if text.contains("yard") || text.contains("sq.yd") || text.contains("sqyd")
                || text.contains("gaz") || text.contains("cha.g") || text.contains("ch.g")
                || text.contains("c.g") {
        unit = .sqyd
    } else if full.contains("acre") || full.contains("gunta") {
        // The number had no unit beside it, but the string names one — a
        // heading like "Extent (acres): 30".
        unit = full.contains("acre") ? .acre : .gunta
    } else {
        // No unit written at all. The caller says what its documents usually
        // mean rather than this function guessing for everyone.
        unit = fallback
    }
    return (value, unit)
}
