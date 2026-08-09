import Foundation

/// The spine: six slots every document resolves to, whatever its type.
///
/// From the founder's Vault Extraction Spec: the list row, the search index,
/// the grouping headers and the top of the detail screen read these and
/// nothing else. A document whose reader emitted no spine still gets one —
/// synthesised from its legacy fields — so a vault filed last month renders
/// exactly like one filed today.
public struct DocSpine: Sendable {
    /// title | revenue | map | identity | search | old_record — drives colour
    /// and the filter chips.
    public let family: String
    /// The number a person says out loud: "6337 / 2024", "Khata 397",
    /// "Fasli 1434".
    public let identityLabel: String
    /// Village · Sy 1 — normalised, the strongest grouping key.
    public let placeLine: String
    public let village: String
    /// Every survey number the paper names, display form ("128/1A").
    public let surveys: [String]
    /// "Ravi Rathamma → Sankara Reddy" for deeds; the holder for revenue
    /// records; the person for identity documents.
    public let partiesLine: String
    /// The primary person, for person-grouping: the buyer, the pattadar, the
    /// card holder.
    public let primaryPerson: String
    /// Extent, money or count — whichever the type measures, with its unit.
    public let quantumLine: String
    /// Everything the reader could not settle — one badge on the row,
    /// itemised on the detail screen.
    public let review: [ReviewItem]

    public struct ReviewItem: Sendable, Identifiable, Equatable {
        public let code: String
        /// high | medium | low
        public let severity: String
        public let text: String
        public let page: Int

        /// Derived, not random: a spine is recomputed freely (list refresh,
        /// filter change) and SwiftUI must not tear the rows down each time.
        public var id: String { "\(code)|\(page)|\(text)" }

        public init(code: String, severity: String, text: String, page: Int) {
            self.code = code
            self.severity = severity
            self.text = text
            self.page = page
        }
    }
}

public extension DocSpine {
    /// What the LIST is allowed to be loud about. Reader-emitted review items
    /// badge rows and feed the banner; caveats promoted from legacy prose
    /// itemise on the document page but stay quiet in the list — the same
    /// rule that once took chatty caveats off the master list. Amber earns
    /// attention by staying honest.
    var actionable: [ReviewItem] { review.filter { $0.code != "caveat" } }
}

/// Family from the doc type, for readings that predate the family key.
public func documentFamily(_ docType: String) -> String {
    let t = docType.lowercased()
    // Before "deed": a settlement REGISTER is an old record; a settlement deed
    // is title. Bare "old" is never matched — "household" is not an old record.
    if t.contains("sethwar") || t.contains("khasra") || t.contains("faisal")
        || t.contains("settlement register") || t.contains("resettlement")
        || t.contains("re-settlement") || t.contains("old record") { return "old_record" }
    if t.contains("deed") || t.contains("gpa") || t.contains("attorney")
        || t.contains("will") || t.contains("testament")
        || t.contains("agreement") || t.contains("mortgage") { return "title" }
    if t.contains("passbook") || t.contains("ror") || t.contains("adangal")
        || t.contains("pahani") || t.contains("1b") || t.contains("1-b")
        || t.contains("mutation") { return "revenue" }
    if t.contains("fmb") || t.contains("map") || t.contains("tippon")
        || t.contains("sketch") { return "map" }
    if t.contains("aadhaar") || t.contains("aadhar") || t == "pan"
        || t.contains("pan card") || t.contains("permanent account") { return "identity" }
    if t.contains("encumbrance") || t == "ec" || t.contains("tax")
        || t.contains("receipt") || t.contains("kist") || t.contains("challan") { return "search" }
    // Unknown papers say so. Defaulting to "title" would dress any unread
    // scrap in deed blue — posing is worse than admitting.
    return "unsorted"
}

/// The colour NAME for a family — SwiftUI-free like `DocumentKind.tint`; the
/// app maps names to `Color`. One palette dresses tiles, chips, the page map
/// and dossier rows, or adjacent screens disagree about the same paper.
public func familyTint(_ family: String) -> String {
    switch family {
    case "title": "blue"
    case "revenue": "green"
    case "map": "cyan"
    case "identity": "purple"
    case "search": "orange"
    case "old_record": "brown"
    default: "gray"
    }
}

/// What the filter chip calls the family.
public func familyLabel(_ family: String) -> String {
    switch family {
    case "title": "Title"
    case "revenue": "Revenue record"
    case "map": "Map"
    case "identity": "Identity"
    case "search": "Search & tax"
    case "old_record": "Old record"
    default: "Unsorted"
    }
}

/// The letters on the vault tile: what a clerk would scribble on the corner
/// of the file. Two glyphs, kind-specific — "SD 2024" answers which sale deed
/// before the row is read.
public func documentMono(_ docType: String) -> String {
    let t = docType.lowercased()
    if t.contains("adangal") || t.contains("pahani") { return "AD" }
    if t.contains("passbook") || t.contains("1b") || t.contains("1-b")
        || t.contains("ror") { return "1B" }
    if t.contains("mutation") { return "MU" }
    if t.contains("fmb") || t.contains("tippon") || t.contains("map")
        || t.contains("sketch") { return "FM" }
    if t.contains("encumbrance") || t == "ec" || t.hasPrefix("ec ") { return "EC" }
    if t.contains("aadhaar") || t.contains("aadhar") { return "AA" }
    if t == "pan" || t.contains("pan card") || t.contains("permanent account") { return "PA" }
    if t.contains("tax") || t.contains("receipt") || t.contains("kist")
        || t.contains("challan") { return "₹" }
    if t.contains("sethwar") { return "SE" }
    if t.contains("khasra") { return "KH" }
    if t.contains("gpa") || t.contains("attorney") { return "GP" }
    if t.contains("gift") { return "GD" }
    if t.contains("partition") { return "PD" }
    if t.contains("will") || t.contains("testament") { return "WL" }
    if t.contains("agreement") { return "AG" }
    if t.contains("sale") || t.contains("deed") || t.contains("conveyance") { return "SD" }
    let words = docType.split(whereSeparator: { !$0.isLetter }).prefix(2)
    let initials = words.compactMap { $0.first.map(String.init) }.joined().uppercased()
    return initials.isEmpty ? "?" : initials
}

/// Build the spine — from the reader's own spine when present, synthesised
/// from legacy fields when not.
public func docSpine(
    docType: String,
    documentNo: String = "",
    regYear: String = "",
    village: String = "",
    surveyNo: String = "",
    extent: String = "",
    consideration: Double = 0,
    reading: [String: Any] = [:]
) -> DocSpine {
    let spine = reading["spine"] as? [String: Any] ?? [:]
    func s(_ dict: [String: Any]?, _ key: String) -> String {
        ((dict?[key] as? String) ?? "").trimmingCharacters(in: .whitespaces)
    }
    func rs(_ key: String) -> String { s(reading, key) }

    let family = (reading["family"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        ?? documentFamily(docType)

    // Identity: the reader's label, else composed the way the registrar or
    // tahsildar would say it.
    let identityDict = spine["identity"] as? [String: Any]
    var identity = s(identityDict, "label")
    if identity.isEmpty {
        let khata = [rs("pattadar_no"), rs("khata_no")].first { !$0.isEmpty } ?? ""
        let fasli = rs("fasli_year")
        if !documentNo.isEmpty {
            identity = regYear.isEmpty ? documentNo : "\(documentNo) / \(regYear)"
        } else if !khata.isEmpty {
            identity = "Khata \(khata)"
        } else if !fasli.isEmpty {
            identity = "Fasli \(fasli)"
        }
    }
    // An identity that IS a sensitive number — an Aadhaar card's own number,
    // a PAN — is masked at the spine, so every row, tile, title and search
    // index downstream inherits the safe form. The details page's field rows
    // stay the one deliberate reveal surface.
    if isSensitiveIdentityValue(identity) { identity = maskedIdentity(identity) }

    // Place: village · Sy N — never a sentence.
    let placeDict = spine["place"] as? [String: Any]
    let spineVillage = s(placeDict, "village")
    let effVillage = spineVillage.isEmpty ? village : spineVillage
    var surveyList: [String] = surveyNo.trimmingCharacters(in: .whitespaces).isEmpty
        ? [] : [surveyNo.trimmingCharacters(in: .whitespaces)]
    if let surveys = placeDict?["survey"] as? [[String: Any]], !surveys.isEmpty {
        surveyList = surveys.compactMap { d -> String? in
            let no = (d["no"] as? String) ?? (d["no"] as? Int).map(String.init) ?? ""
            // The subdivision needs the same numeric fallback as the number:
            // a reader emitting {"no": 128, "sub": 1} must not collapse
            // 128/1 into 128 — 1 and 1/1 are different land.
            let sub = (d["sub"] as? String) ?? (d["sub"] as? Int).map(String.init) ?? ""
            return no.isEmpty ? nil : (sub.isEmpty ? no : "\(no)/\(sub)")
        }
    }
    let sy = surveyList.joined(separator: ", ")
    let placeLine = [effVillage, sy.isEmpty ? "" : "Sy \(sy)"]
        .filter { !$0.isEmpty }.joined(separator: " · ")

    // Parties, with direction. Deeds are from → to; everything else names
    // its one person.
    let parties = (spine["parties"] as? [[String: Any]])
        ?? (reading["parties"] as? [[String: Any]]) ?? []
    func party(_ role: String) -> String {
        (parties.first { ($0["role"] as? String)?.lowercased().contains(role) == true }?["name"]
            as? String ?? "").trimmingCharacters(in: .whitespaces)
    }
    let seller = [party("seller"), party("executant"), party("donor")].first { !$0.isEmpty } ?? ""
    let buyer = [party("buyer"), party("claimant"), party("donee")].first { !$0.isEmpty } ?? ""
    let holder = [rs("owner_name"), s(reading, "name")].first { !$0.isEmpty } ?? ""
    var partiesLine = ""
    var primary = ""
    if !seller.isEmpty || !buyer.isEmpty {
        partiesLine = [seller, buyer].filter { !$0.isEmpty }.joined(separator: " → ")
        primary = buyer.isEmpty ? seller : buyer
    } else if !holder.isEmpty {
        partiesLine = holder
        primary = holder
    }

    // Quantum: whichever the type measures, unit attached.
    let quantumDict = spine["quantum"] as? [String: Any]
    func num(_ dict: [String: Any]?, _ key: String) -> Double {
        (dict?[key] as? Double) ?? (dict?[key] as? Int).map(Double.init) ?? 0
    }
    var quantumParts: [String] = []
    let acres = num(quantumDict, "extent_ac")
    if acres > 0 {
        quantumParts.append(String(format: "%g ac", acres))
    } else if !extent.isEmpty {
        quantumParts.append(extent)
    }
    let amount = num(quantumDict, "amount_inr") > 0 ? num(quantumDict, "amount_inr") : consideration
    if amount > 0 { quantumParts.append(rupees(amount)) }
    let entries = (reading["parcels"] as? [[String: Any]])?.count ?? 0
    if entries > 1 { quantumParts.append("\(entries) entries") }
    // An identity document measures nothing — its quantum slot carries the
    // date of birth, the founder's own spine table for Aadhaar.
    if family == "identity" {
        let dob = rs("dob")
        quantumParts = dob.isEmpty ? [] : ["DOB \(humanDate(dob))"]
    }
    let quantumLine = quantumParts.joined(separator: " · ")

    // Review: the reader's items, else caveats promoted with medium severity.
    // Texts pass through maskSensitiveText — reader prose has carried an open
    // Aadhaar number before.
    var review: [DocSpine.ReviewItem] = []
    if let items = reading["review"] as? [[String: Any]] {
        review = items.compactMap { item in
            let text = (item["text"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return nil }
            return DocSpine.ReviewItem(
                code: item["code"] as? String ?? "review",
                severity: item["severity"] as? String ?? "medium",
                text: maskSensitiveText(text),
                page: (item["page"] as? Int) ?? Int(item["page"] as? Double ?? 0))
        }
    }
    if review.isEmpty {
        // Legacy readings: watch_out is THE warning — the one line most
        // likely to bite later — so it keeps its voice (actionable, high).
        // Caveats are commentary; they itemise on the page but stay quiet
        // in the list.
        if let watch = reading["watch_out"] as? String,
           !watch.trimmingCharacters(in: .whitespaces).isEmpty {
            review.append(DocSpine.ReviewItem(
                code: "watch_out", severity: "high",
                text: maskSensitiveText(watch), page: 0))
        }
        if let caveats = reading["caveats"] as? [String] {
            review += caveats.filter { !$0.isEmpty }.map {
                DocSpine.ReviewItem(code: "caveat", severity: "medium",
                                    text: maskSensitiveText($0), page: 0)
            }
        }
    }

    // The standard failure, caught at the spine: a deed that states its extent
    // in two units must reconcile them. The reader usually flags this itself;
    // this is the net under the reader.
    let hectares = num(quantumDict, "extent_ha")
    if !extentsAgree(acres: acres, hectares: hectares),
       !review.contains(where: { $0.code == "unit_conflict" }) {
        review.append(DocSpine.ReviewItem(
            code: "unit_conflict", severity: "high",
            text: "The extent's two units disagree — \(String(format: "%g", acres)) acres against \(String(format: "%g", hectares)) hectares. Trust neither until the schedule settles it.",
            page: 0))
    }

    return DocSpine(family: family, identityLabel: identity, placeLine: placeLine,
                    village: effVillage, surveys: surveyList, partiesLine: partiesLine,
                    primaryPerson: primary, quantumLine: quantumLine, review: review)
}

// MARK: - Normalisation (the six rules that cause most mismatches)

/// "128/1A" → (no: "128", sub: "1A"). Never compare survey numbers as plain
/// strings — 1 and 1/1 are different land.
public func surveyParts(_ display: String) -> (no: String, sub: String) {
    let trimmed = display.trimmingCharacters(in: .whitespaces)
    guard let slash = trimmed.firstIndex(where: { $0 == "/" || $0 == "-" }) else {
        return (trimmed, "")
    }
    return (String(trimmed[..<slash]).trimmingCharacters(in: .whitespaces),
            String(trimmed[trimmed.index(after: slash)...]).trimmingCharacters(in: .whitespaces))
}

/// Fasli + 590 ≈ the Gregorian start year: 1434 F → "2024–25". Farmers say
/// fasli; buyers read calendar years — both are kept.
public func fasliToGregorian(_ fasli: Int) -> String {
    let start = fasli + 590
    return "\(start)–\(String((start + 1) % 100).leftPadded)"
}

private extension String {
    var leftPadded: String { count == 1 ? "0" + self : self }
}

/// A fuzzy key that ignores token order and honorifics, so
/// "Telukutla Sankara Reddy" and "Sankara Reddy Telukutla" match. S/o, W/o,
/// D/o clauses are RELATION, not name, and are cut before keying.
public func nameKey(_ raw: String) -> String {
    var s = raw.lowercased()
    for marker in ["s/o", "w/o", "d/o", "s o ", "w o ", "d o "] {
        if let r = s.range(of: marker) { s = String(s[..<r.lowerBound]) }
    }
    let honorifics: Set<String> = ["sri", "smt", "shri", "sree", "kum", "mr", "mrs", "late"]
    let tokens = s.split(whereSeparator: { !$0.isLetter })
        .map(String.init)
        .filter { !honorifics.contains($0) && !$0.isEmpty }
    return tokens.sorted().joined(separator: " ")
}

/// A value that must not sit open on a screen: an Aadhaar number (12 digits,
/// spaced or not) or a PAN. These render masked everywhere and are revealed
/// only on a deliberate tap — the redesign must not be the moment numbers
/// start appearing.
public func isSensitiveIdentityValue(_ value: String) -> Bool {
    let v = value.trimmingCharacters(in: .whitespaces)
    if v.range(of: #"^\d{4}\s?\d{4}\s?\d{4}$"#, options: .regularExpression) != nil { return true }
    if v.range(of: #"^[A-Z]{5}\d{4}[A-Z]$"#, options: .regularExpression) != nil { return true }
    return false
}

/// The display form of ANY identity string: masked when it is an Aadhaar or
/// PAN, untouched otherwise — for render sites that read a raw column
/// instead of the spine.
public func displayIdentity(_ value: String) -> String {
    isSensitiveIdentityValue(value) ? maskedIdentity(value) : value
}

/// The first Aadhaar- or PAN-shaped number found INSIDE a text blob — for
/// reading the number off the user's OWN local scan at reveal time. The
/// cloud only ever holds the masked form; the full number lives in the file
/// on the phone, and this is how a deliberate tap gets it back.
public func firstIdentityNumber(in text: String) -> String? {
    for pattern in [#"\d{4}[\s-]\d{4}[\s-]\d{4}"#,
                    #"(?<!\d)\d{12}(?!\d)"#,
                    #"(?<![A-Z])[A-Z]{5}\d{4}[A-Z](?![A-Z])"#] {
        guard let r = text.range(of: pattern, options: .regularExpression) else { continue }
        let v = String(text[r])
        // An unbroken 12-digit run reads back in the card's own 4-4-4 shape.
        if v.count == 12, v.allSatisfy(\.isNumber) {
            let c = Array(v)
            return "\(String(c[0...3])) \(String(c[4...7])) \(String(c[8...11]))"
        }
        return v.replacingOccurrences(of: "-", with: " ")
    }
    return nil
}

/// Masks every Aadhaar- or PAN-shaped number INSIDE running text. The
/// reader's prose — key points, summaries, caveats — must never carry an
/// open identity number, even when the reader was told not to emit one.
public func maskSensitiveText(_ text: String) -> String {
    guard !text.isEmpty else { return text }
    var out = text
    for pattern in [#"\d{4}[\s-]\d{4}[\s-]\d{4}"#,
                    #"(?<!\d)\d{12}(?!\d)"#,
                    #"(?<![A-Z])[A-Z]{5}\d{4}[A-Z](?![A-Z])"#] {
        // maskedIdentity leaves only the last four characters, so a replaced
        // run can never match its pattern again and the loop terminates.
        while let r = out.range(of: pattern, options: .regularExpression) {
            out.replaceSubrange(r, with: maskedIdentity(String(out[r])))
        }
    }
    return out
}

/// "4821 9930 8412" → "×××× ×××× 8412". The last four stay — enough to tell
/// two cards apart, not enough to use.
public func maskedIdentity(_ value: String) -> String {
    let chars = Array(value)
    let alnum = chars.indices.filter { chars[$0].isLetter || chars[$0].isNumber }
    let keep = Set(alnum.suffix(4))
    return String(chars.indices.map { i -> Character in
        guard chars[i].isLetter || chars[i].isNumber else { return chars[i] }
        return keep.contains(i) ? chars[i] : "×"
    })
}

/// When a deed states its extent in two units, they must reconcile. Within
/// 2% they agree; beyond that trust neither — the "25 cents / 10.00 ha"
/// case is the standard failure.
public func extentsAgree(acres: Double, hectares: Double) -> Bool {
    guard acres > 0, hectares > 0 else { return true }
    let impliedAcres = hectares / 0.40468564224
    let ratio = acres / impliedAcres
    return ratio > 0.98 && ratio < 1.02
}
