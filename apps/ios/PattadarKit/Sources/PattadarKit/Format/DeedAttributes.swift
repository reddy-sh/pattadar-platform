import Foundation

/// The parts of a deed reading that have no column of their own.
///
/// A registered sale deed carries far more than the transfer: the stamp-paper
/// set it was written on, the layout and plot numbers, the rate per square yard,
/// the four boundaries with their measurements, the prior deed that forms the
/// title chain, and what is bound into the file. None of that fits the
/// `properties` table, and all of it is what a lawyer or a buyer asks for.
///
/// It is stored as a flat JSON blob on the property. FLAT is the requirement:
/// the reader stringifies whatever it finds, so a nested dictionary left in
/// place renders as `["north": "30 ft wide road"]` — Swift debug output shown
/// to a person. Flattening happens here, once, at the point of writing.
public func deedAttributes(_ fields: [String: Any]) -> [String: String] {
    var out: [String: String] = [:]

    func put(_ label: String, _ value: Any?) {
        guard let value else { return }
        var text: String
        // A JSON `true` arrives as an NSNumber, and an NSNumber casts happily to
        // Int as well as to Bool. Testing Int first turned `"route_map": true`
        // into the row "Attached route map — 1", which is a number where a
        // person expects a yes. Booleans are identified by their CoreFoundation
        // type, which is the only reliable way to tell them from 1 and 0.
        if let n = value as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() {
            text = n.boolValue ? "Yes" : ""
        } else {
            switch value {
            case let s as String: text = s
            case let b as Bool: text = b ? "Yes" : ""
            case let n as Int: text = n == 0 ? "" : String(n)
            case let d as Double:
                text = d == 0 ? "" : (d == d.rounded() ? String(Int(d)) : String(d))
            case let a as [Any]:
                text = a.compactMap { $0 as? String }.joined(separator: ", ")
                if text.isEmpty { return }
            default: return
            }
        }
        text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text != "0" else { return }
        out[label] = text
    }

    // Labels are ordered by the reader alphabetically, so each group is named
    // with a common prefix to keep its rows together on screen.
    put("Layout", fields["layout_name"])
    put("Plot numbers", fields["plot_nos"])
    if let rate = fields["rate_per_unit"] as? Double, rate > 0 {
        let unit = (fields["rate_unit"] as? String) ?? ""
        put("Rate", "₹\(Int(rate))" + (unit.isEmpty ? "" : " per \(unit)"))
    } else if let rate = fields["rate_per_unit"] as? Int, rate > 0 {
        let unit = (fields["rate_unit"] as? String) ?? ""
        put("Rate", "₹\(rate)" + (unit.isEmpty ? "" : " per \(unit)"))
    }
    // Kept distinctly labelled: this is the extent of the WHOLE survey number,
    // not of the plot conveyed. Confusing the two overstates the holding.
    put("Survey extent (whole number)", fields["parent_survey_extent"])
    put("Total pages", fields["total_pages"])

    // Boundaries: what abuts, and how long that side is. One row each, because
    // "30 ft wide road" and "71 ft" are two different facts about the north.
    let bounds = fields["boundaries"] as? [String: Any] ?? [:]
    let lengths = fields["boundary_lengths"] as? [String: Any] ?? [:]
    for side in ["north", "south", "east", "west"] {
        let what = (bounds[side] as? String ?? "").trimmingCharacters(in: .whitespaces)
        let len = (lengths[side] as? String ?? "").trimmingCharacters(in: .whitespaces)
        let joined = [what, len.isEmpty ? "" : "(\(len))"]
            .filter { !$0.isEmpty }.joined(separator: " ")
        put("Boundary \(side)", joined)
    }

    // The numbers that identify the land on the ground and in the registrar's
    // index. `survey_no` has no column on a property, so it would otherwise be
    // read off the deed and thrown away.
    put("Survey no.", fields["survey_no"])
    if let list = fields["plot_nos"] as? [String], !list.isEmpty {
        put("Plot no.", list.joined(separator: ", "))
    } else {
        put("Plot no.", fields["plot_no"])
    }

    // WHO, with what the deed says about them.
    //
    // A name alone does not identify a person in a land record — half a village
    // shares a surname, so parentage, age and address are how the seller on
    // this deed is matched to the buyer on the previous one. All of it was being
    // extracted and then dropped.
    for party in fields["parties"] as? [[String: Any]] ?? [] {
        let role = (party["role"] as? String ?? "").lowercased()
        guard role == "seller" || role == "buyer" else { continue }
        let who = role == "seller" ? "Seller" : "Buyer"
        put(who, party["name"])
        put("\(who) parentage", party["parentage"])
        put("\(who) age", party["age"])
        put("\(who) address", party["address"])
        // The signature on the page may not be the owner's. A GPA holder acts
        // FOR the principal, and treating the agent as the party is how a
        // record ends up naming the wrong owner.
        if let isGPA = party["is_gpa"] as? Bool, isGPA {
            put("\(who) acting as", "General Power of Attorney holder")
        } else if let n = party["is_gpa"] as? NSNumber,
                  CFGetTypeID(n) == CFBooleanGetTypeID(), n.boolValue {
            put("\(who) acting as", "General Power of Attorney holder")
        }
    }

    // The stamp-paper set is evidence in itself — the serial run and the
    // denominations are what gets checked for a substituted page.
    if let sp = fields["stamp_papers"] as? [String: Any] {
        put("Stamp papers total", sp["total_value"])
        put("Stamp papers serials", sp["serials"])
        put("Stamp papers count", sp["count"])
        if let dens = sp["denominations"] as? [[String: Any]], !dens.isEmpty {
            let text = dens.compactMap { d -> String? in
                let v = (d["value"] as? Int) ?? Int((d["value"] as? Double) ?? 0)
                let c = (d["count"] as? Int) ?? Int((d["count"] as? Double) ?? 0)
                guard v > 0, c > 0 else { return nil }
                return "₹\(v) × \(c)"
            }.joined(separator: ", ")
            put("Stamp papers denominations", text)
        }
        put("Stamp papers bought by", sp["purchased_by"])
    }

    // The title chain. Its number, date and office are what make it checkable.
    if let pd = fields["prior_document_details"] as? [String: Any] {
        put("Prior deed no.", pd["number"])
        put("Prior deed date", humanDate((pd["registration_date"] as? String) ?? ""))
        put("Prior deed office", pd["office"])
        put("Prior deed book", pd["book_volume_pages"])
        put("Prior deed seller", pd["original_seller"])
        put("Prior deed buyer", pd["original_buyer"])
    }

    if let at = fields["attachments"] as? [String: Any] {
        put("Attached route map", at["route_map"])
        put("Attached landmarks", at["landmarks"])
        put("Attached identity proof", at["identity_verification"])
        put("Attached declaration", at["declaration"])
    }

    return out
}

/// The blob as it goes on the wire — "" when there is nothing worth storing, so
/// an empty section never appears.
public func deedAttributesJSON(_ fields: [String: Any]) -> String {
    let flat = deedAttributes(fields)
    guard !flat.isEmpty,
          let data = try? JSONSerialization.data(withJSONObject: flat, options: [.sortedKeys]),
          let text = String(data: data, encoding: .utf8)
    else { return "" }
    return text
}


/// The stored blob, split into the groups a person reads it in.
///
/// The reader sorted every key alphabetically, which interleaved the four
/// boundaries with route maps and plot numbers: "Attached landmarks, Attached
/// route map, Boundary east, Boundary north, Boundary south, Boundary west,
/// Plot numbers". The four boundaries are ONE fact about the land — together
/// they are what identifies a plot on the ground, and in a partition dispute
/// they are the argument — so they are read as a set, in compass order, not
/// scattered through an alphabetised list.
public func deedAttributeGroups(_ raw: [String: String])
    -> (parties: [(String, String)], boundaries: [(String, String)], rest: [(String, String)]) {
    // BUYER first, then seller.
    //
    // On a record of what somebody owns, the buyer is the present owner — the
    // name that answers "whose land is this now". The seller is where it came
    // from, which is the second question. Alphabetical order answered neither,
    // opening with "Buyer address".
    var parties: [(String, String)] = []
    for who in ["Buyer", "Seller"] {
        for suffix in ["", " parentage", " age", " address", " acting as"] {
            let key = who + suffix
            if let value = raw[key], !value.isEmpty {
                parties.append((suffix.isEmpty ? who : who + suffix.replacingOccurrences(of: " ", with: " "),
                                value))
            }
        }
    }

    // North, east, south, west — clockwise from north, the order a schedule is
    // written in and the order a surveyor walks it. Alphabetical put east
    // first, which is nobody's mental model of a compass.
    let compass = ["north", "east", "south", "west"]
    var boundaries: [(String, String)] = []
    for side in compass {
        let key = "Boundary " + side
        if let value = raw[key], !value.isEmpty {
            boundaries.append((side.capitalized, value))
        }
    }
    let partyKeys = Set(parties.map(\.0))
    let rest = raw
        .filter { !$0.key.hasPrefix("Boundary ") && !partyKeys.contains($0.key) }
        .sorted { $0.key < $1.key }
        .map { ($0.key, $0.value) }
    return (parties, boundaries, rest)
}
