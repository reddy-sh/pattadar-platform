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

    public struct ReviewItem: Sendable, Identifiable {
        public let id = UUID()
        public let code: String
        /// high | medium | low
        public let severity: String
        public let text: String
        public let page: Int
    }
}

/// Family from the doc type, for readings that predate the family key.
public func documentFamily(_ docType: String) -> String {
    let t = docType.lowercased()
    if t.contains("deed") || t.contains("gpa") || t.contains("will")
        || t.contains("agreement") || t.contains("mortgage") { return "title" }
    if t.contains("passbook") || t.contains("ror") || t.contains("adangal")
        || t.contains("pahani") || t.contains("1b") || t.contains("1-b") { return "revenue" }
    if t.contains("fmb") || t.contains("map") || t.contains("tippon")
        || t.contains("sketch") { return "map" }
    if t.contains("aadhaar") || t.contains("aadhar") || t.contains("pan") { return "identity" }
    if t.contains("encumbrance") || t == "ec" || t.contains("tax")
        || t.contains("receipt") || t.contains("challan") { return "search" }
    if t.contains("sethwar") || t.contains("khasra") || t.contains("faisal")
        || t.contains("old") { return "old_record" }
    return "title"
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

    // Place: village · Sy N — never a sentence.
    let placeDict = spine["place"] as? [String: Any]
    let spineVillage = s(placeDict, "village")
    let effVillage = spineVillage.isEmpty ? village : spineVillage
    var sy = surveyNo
    if let surveys = placeDict?["survey"] as? [[String: Any]], !surveys.isEmpty {
        sy = surveys.compactMap { d -> String? in
            let no = (d["no"] as? String) ?? (d["no"] as? Int).map(String.init) ?? ""
            let sub = (d["sub"] as? String) ?? ""
            return no.isEmpty ? nil : (sub.isEmpty ? no : "\(no)/\(sub)")
        }.joined(separator: ", ")
    }
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
    if amount > 0 { quantumParts.append(indianRupees(amount)) }
    let entries = (reading["parcels"] as? [[String: Any]])?.count ?? 0
    if entries > 1 { quantumParts.append("\(entries) entries") }
    let quantumLine = quantumParts.joined(separator: " · ")

    // Review: the reader's items, else caveats promoted with medium severity.
    var review: [DocSpine.ReviewItem] = []
    if let items = reading["review"] as? [[String: Any]] {
        review = items.compactMap { item in
            let text = (item["text"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty else { return nil }
            return DocSpine.ReviewItem(
                code: item["code"] as? String ?? "review",
                severity: item["severity"] as? String ?? "medium",
                text: text,
                page: (item["page"] as? Int) ?? Int(item["page"] as? Double ?? 0))
        }
    }
    if review.isEmpty, let caveats = reading["caveats"] as? [String] {
        review = caveats.filter { !$0.isEmpty }.map {
            DocSpine.ReviewItem(code: "caveat", severity: "medium", text: $0, page: 0)
        }
    }

    return DocSpine(family: family, identityLabel: identity, placeLine: placeLine,
                    village: effVillage, partiesLine: partiesLine, primaryPerson: primary,
                    quantumLine: quantumLine, review: review)
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

/// When a deed states its extent in two units, they must reconcile. Within
/// 2% they agree; beyond that trust neither — the "25 cents / 10.00 ha"
/// case is the standard failure.
public func extentsAgree(acres: Double, hectares: Double) -> Bool {
    guard acres > 0, hectares > 0 else { return true }
    let impliedAcres = hectares / 0.40468564224
    let ratio = acres / impliedAcres
    return ratio > 0.98 && ratio < 1.02
}

/// ₹50,00,000 — Indian grouping, no decimals for whole rupees.
public func indianRupees(_ amount: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_IN")
    f.maximumFractionDigits = 0
    return "₹" + (f.string(from: NSNumber(value: amount)) ?? String(Int(amount)))
}
