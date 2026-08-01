import PattadarKit
import SwiftUI

/// Who holds what.
///
/// The second question people ask about land, after where it is. Land is rarely
/// held by one person: it is in a father's name, a mother's, jointly, under a
/// firm, or still undivided among heirs — and who is ON the title decides who
/// has to sign before anything can be sold or mortgaged.
///
/// Grouped by the holder as RECORDED. Names are not merged or tidied: "T. Sankar
/// Reddy" and "Telukutla Sankara Reddy" may well be one man, but guessing that
/// on a land record would silently combine two people's holdings, and the fix
/// for a wrong name is to correct the record rather than to hide it.
struct HoldersScreen: View {
    let holdings: HoldingsResponse?

    private struct Holder: Identifiable {
        let id: String
        let name: String
        var acres: Double
        var parcels: Int
        var properties: Int
        var places: [String]
    }

    private var holders: [Holder] {
        guard let h = holdings else { return [] }
        var map: [String: Holder] = [:]

        func add(name raw: String, acres: Double, place: String, isParcel: Bool) {
            let name = raw.trimmingCharacters(in: .whitespaces)
            let key = name.isEmpty ? "" : name.lowercased()
            var holder = map[key] ?? Holder(id: key, name: name.isEmpty ? "Not recorded" : name,
                                            acres: 0, parcels: 0, properties: 0, places: [])
            holder.acres += acres
            if isParcel { holder.parcels += 1 } else { holder.properties += 1 }
            if !place.isEmpty && !holder.places.contains(place) { holder.places.append(place) }
            map[key] = holder
        }

        for p in h.parcels {
            let pb = h.passbooks.first { $0.id == p.passbookId }
            // The parcel's own owner if it has one, otherwise the pattadar the
            // passbook is in the name of.
            let name = p.currentOwner.isEmpty ? (pb?.ownerName ?? "") : p.currentOwner
            add(name: name, acres: p.extent, place: pb?.village ?? "", isParcel: true)
        }
        for p in h.properties {
            add(name: p.currentOwner,
                acres: propertyAcres(landArea: p.landArea, landUnit: p.landUnit),
                place: p.city, isParcel: false)
        }
        // Most land first; the unrecorded bucket last, however big it is,
        // because it is a gap rather than a holder.
        return map.values.sorted {
            if ($0.id.isEmpty) != ($1.id.isEmpty) { return !$0.id.isEmpty }
            return $0.acres > $1.acres
        }
    }

    var body: some View {
        List {
            Section {
                Text("Who is on the title decides who has to sign before anything can be sold or mortgaged.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }

            ForEach(holders) { holder in
                Section {
                    HStack(spacing: 12) {
                        Text(initials(holder.name))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(holder.id.isEmpty ? Color.gray : Color.accentColor))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(holder.name).font(.headline)
                            Text(summary(holder)).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    if !holder.places.isEmpty {
                        Text(holder.places.prefix(4).joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if holder.id.isEmpty {
                        // Not a holder — a gap. Said plainly, because land with
                        // nobody recorded on it is the thing that turns into a
                        // dispute.
                        Label("No name recorded against this land. Whoever inherits it will have to prove who held it.",
                              systemImage: "exclamationmark.triangle.fill")
                            .font(.caption).foregroundStyle(.orange)
                    }
                }
            }

            if holders.isEmpty {
                ContentUnavailableView("Nothing recorded yet", systemImage: "person.2",
                                       description: Text("Add a holding and the names on it appear here."))
            }
        }
        .navigationTitle("Who holds what")
        .navigationBarTitleDisplayMode(.large)
    }

    private func summary(_ h: Holder) -> String {
        var parts: [String] = []
        if h.acres > 0 { parts.append(areaText(h.acres, .acre)) }
        if h.parcels > 0 { parts.append("\(h.parcels) parcel\(h.parcels == 1 ? "" : "s")") }
        if h.properties > 0 { parts.append("\(h.properties) propert\(h.properties == 1 ? "y" : "ies")") }
        return parts.joined(separator: " · ")
    }

    private func initials(_ name: String) -> String {
        let letters = name.split(separator: " ").prefix(2).compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}
