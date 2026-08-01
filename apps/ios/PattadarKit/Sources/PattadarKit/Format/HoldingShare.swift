import Foundation

/// A holding, written out to send to somebody.
///
/// The realistic recipients are a brother, a buyer, a surveyor or a lawyer, and
/// what each of them needs is the same short set of facts: what it is, how big,
/// where, and which paper it hangs off. So this is plain text — it pastes into
/// WhatsApp, SMS, Mail and a notes app without losing anything.
///
/// Two things are deliberately NOT in here. Money, because what was paid is
/// nobody's business by default and is routinely understated on the deed; and
/// any identity number, because Aadhaar must never leave the app in a message.
/// Both are decisions rather than omissions — a share that quietly included the
/// purchase price would be a privacy leak performed by a helpful button.
public struct HoldingShare: Sendable {
    public var title: String
    public var extent: String
    public var place: String
    /// "Sy 1-C1B" or "Khata 567" — how the record is referred to on paper.
    public var reference: String
    public var owner: String
    public var pin: LatLng?

    public init(title: String, extent: String = "", place: String = "",
                reference: String = "", owner: String = "", pin: LatLng? = nil) {
        self.title = title
        self.extent = extent
        self.place = place
        self.reference = reference
        self.owner = owner
        self.pin = pin
    }

    public var text: String {
        var lines: [String] = []
        lines.append(title)
        if !extent.isEmpty && !title.contains(extent) { lines.append(extent) }
        if !reference.isEmpty { lines.append(reference) }
        if !place.isEmpty { lines.append(place) }
        if !owner.isEmpty { lines.append("Owner: " + owner) }
        if let pin {
            // A maps link, not a coordinate pair: the person receiving this
            // wants to see where it is, and "15.670059, 79.322765" requires
            // them to know what to do with it.
            lines.append(String(format: "https://maps.apple.com/?ll=%.6f,%.6f&q=%@",
                                pin.latitude, pin.longitude,
                                title.addingPercentEncoding(
                                    withAllowedCharacters: .urlQueryAllowed) ?? "Land"))
        }
        return lines.joined(separator: "\n")
    }
}
