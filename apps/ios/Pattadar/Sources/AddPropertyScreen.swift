import PattadarKit
import SwiftUI

/// New property — scan first, type only if you must.
struct AddPropertyScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    /// Handed in when the routing screen has already read the document.
    var initialScan: ScanResult? = nil

    @State private var manualOpen = false
    @State private var scanned: ScanResult?
    @State private var type = "open_plot"
    @State private var label = ""
    @State private var city = ""
    @State private var locality = ""
    @State private var district = ""
    @State private var landArea = ""
    /// The unit the deed itself states. Hard-coding "Sq.yd" here turned a
    /// 25-acre schedule into a 25-square-yard plot.
    @State private var landUnit: UnitKey = .sqyd
    @State private var builtup = ""
    @State private var price = ""
    @State private var saving = false
    @State private var stage = ""
    @State private var problem = ""
    @State private var savedID = ""
    /// What the reader thought it was, so a changed type can be explained
    /// rather than silently overriding the document.
    @State private var suggestedType = ""
    /// Read from the deed and carried to the server. Not shown as form fields —
    /// nobody types a book-and-volume reference by hand — but discarding them
    /// meant re-reading the document to answer "which deed was this?".
    @State private var regDocNo = ""
    @State private var sro = ""
    @State private var regDate = ""
    @State private var sellerName = ""
    @State private var buyerName = ""
    @State private var purchaseDate = ""
    @State private var acquisitionMode = ""
    @State private var address = ""

    /// Every type, in one place. Splitting "plot" and "building" across two
    /// menu entries made people choose before they knew — and the deed had not
    /// even been read yet.
    private let types = [("open_plot", "Open plot / site"),
                         ("flat", "Flat / apartment"),
                         ("independent_house", "Independent house"),
                         ("villa", "Villa"),
                         ("commercial", "Commercial / shop"),
                         ("rental", "Rental"),
                         ("other", "Other")]

    /// "Cancel" abandons the form; "Close" steps out of a read that keeps
    /// running. Calling both Cancel made leaving mid-scan look destructive.
    private var closeLabel: String { app.isReading ? "Close" : "Cancel" }

    var body: some View {
        NavigationStack {
            Form {
                if initialScan == nil {
                Section {
                    ScanFirstCard(
                        title: "Read it from the sale deed",
                        body_: "Photograph or upload the deed — the type, locality, area and price are read from it and filled in below for you to check.",
                        endpoint: .registeredDocument,
                        manualOpen: $manualOpen,
                        result: $scanned,
                        onResult: prefill
                    )
                }
                }
                if manualOpen {
                    Section {
                        Picker("Type", selection: $type) {
                            ForEach(types, id: \.0) { Text($0.1).tag($0.0) }
                        }
                        FormRow(label: "Name", text: $label, prompt: "Plot 150 · Nallapadu", required: true)
                        FormRow(label: "Village / town", text: $city, prompt: "Nallapadu")
                        FormRow(label: "Mandal", text: $locality, prompt: "Guntur Rural")
                        FormRow(label: "District", text: $district, prompt: "Guntur")
                        FormRow(label: "Land area (\(landUnit.label))", text: $landArea, prompt: "0",
                                keyboard: .decimalPad, suffix: "Sq.yd")
                        FormRow(label: "Purchase price", text: $price, prompt: "0",
                                keyboard: .numberPad, suffix: "₹")
                        if isBuilding {
                            // A flat is quoted in built-up square feet; its land
                            // share is meaningless and usually zero.
                            FormRow(label: "Built-up area", text: $builtup, prompt: "0",
                                    keyboard: .decimalPad, suffix: "Sq.ft")
                        }
                    } header: {
                        Text("Details")
                    } footer: {
                        if !suggestedType.isEmpty && suggestedType != type {
                            Text("The deed reads like \(label(for: suggestedType).lowercased()); you have changed it. Yours wins.")
                        } else if !suggestedType.isEmpty {
                            Text("Type suggested from the deed — change it if it is wrong.")
                        }
                    }
                    if !problem.isEmpty {
                        Section { Text(problem).foregroundStyle(.red).font(.callout) }
                    }
                    Section {
                        PrimaryButton(
                            title: savedID.isEmpty ? (stage.isEmpty ? "Save property" : stage) : "Done",
                            busy: saving,
                            disabled: label.trimmingCharacters(in: .whitespaces).isEmpty
                        ) {
                            if savedID.isEmpty { Task { await save() } } else { dismiss() }
                        }
                    }
                    if scanned != nil {
                        Section {
                            RescanRow { scanned = nil; clearPrefill() }
                        }
                    }
                }
            }
            .navigationTitle("New property")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(closeLabel) { app.clearReadIfSettled(); dismiss() } } }
            .onAppear {
                // Already read upstream; prefill and open the form straight
                // away rather than asking for the same document twice.
                if let scan = initialScan, scanned == nil { prefill(scan); manualOpen = true }
            }
        }
    }

    /// Starting over means the fields the read filled go too. Leaving one
    /// deed's plot number beside another deed's price is worse than a blank
    /// form — it looks checked.
    private func clearPrefill() {
        regDocNo = ""; sro = ""; regDate = ""; purchaseDate = ""
        sellerName = ""; buyerName = ""; acquisitionMode = ""; address = ""
        type = "open_plot"
        label = ""; city = ""; locality = ""; district = ""; landArea = ""; price = ""; builtup = ""
        suggestedType = ""
        problem = ""
    }

    private var isBuilding: Bool {
        HoldingKind.of(propertyType: type) == .home
            || HoldingKind.of(propertyType: type) == .commercial
    }

    private func label(for key: String) -> String {
        types.first { $0.0 == key }?.1 ?? key
    }

    private func prefill(_ r: ScanResult) {
        scanned = r
        let f = r.fields
        let s = { (k: String) in (f[k] as? String ?? "").trimmingCharacters(in: .whitespaces) }
        // "house-site" and "site" are VACANT LAND. They contain the word
        // "house", so testing for house first typed a bare plot in Nallapadu
        // as an independent house — the deed said "house-site plot No.150".
        // Site wins, and it is tested first for that reason.
        let classification = s("classification").lowercased()
        let guessed = classification.contains("site") || classification.contains("plot") ? "open_plot"
             : classification.contains("flat") || classification.contains("apartment") ? "flat"
             : classification.contains("villa") ? "villa"
             : classification.contains("house") || classification.contains("residen") ? "independent_house"
             : classification.contains("commerc") || classification.contains("shop") ? "commercial"
             : "open_plot"
        type = guessed
        suggestedType = guessed
        let plot = s("plot_no"), village = s("village")
        label = [plot.isEmpty ? "" : "Plot \(plot)", village].filter { !$0.isEmpty }.joined(separator: " · ")
        if label.isEmpty { label = village }
        // The VILLAGE is the place; the mandal is an administrative
        // jurisdiction. Putting "Guntur Rural" in `city` sent the map to a
        // sub-district office rather than to Nallapadu, and grouped the list
        // under names nobody would recognise as where their land is.
        city = village.isEmpty ? s("mandal") : village
        locality = s("mandal")
        district = s("district")
        // The extent in the deed's OWN unit. Urban site deeds say square
        // yards, agricultural deeds say acres (often as "Ac 25-00", which is
        // acres-and-cents); assuming square yards turned 25 acres into 25
        // square yards. "418-1/2 sq. yards" still parses as 418.5.
        let parsed = parseExtent(s("extent"), default: .sqyd)
        landArea = parsed.value > 0 ? String(format: "%g", parsed.value) : ""
        if parsed.value > 0 { landUnit = parsed.unit }
        if let c = f["consideration"] as? Double, c > 0 { price = String(Int(c)) }

        // "2056/2010" only when BOTH halves are on the page. Joining a blank
        // number to a year produced "2003" in the Document no. row — the year
        // presented as the deed's registered number, which is the one field
        // used to match a property against an Encumbrance Certificate.
        let docNo = s("document_no"), regYear = s("reg_year")
        regDocNo = docNo.isEmpty ? "" : (regYear.isEmpty ? docNo : "\(docNo)/\(regYear)")
        sro = s("sro")
        regDate = s("registration_date").isEmpty ? s("execution_date") : s("registration_date")
        purchaseDate = s("execution_date").isEmpty ? s("registration_date") : s("execution_date")
        // The layout and plot are the street address of a site; the village
        // line already carries the rest.
        address = [s("layout_name"),
                   (f["plot_nos"] as? [String] ?? []).joined(separator: ", ")]
            .filter { !$0.isEmpty }.joined(separator: ", Plot ")

        // Roles decide who owns it, so they are taken from `parties` rather
        // than from name order on the page.
        let parties = f["parties"] as? [[String: Any]] ?? []
        sellerName = (parties.first { ($0["role"] as? String) == "seller" }?["name"] as? String) ?? ""
        buyerName = (parties.first { ($0["role"] as? String) == "buyer" }?["name"] as? String) ?? ""

        let type = s("doc_type").lowercased()
        acquisitionMode = type.contains("gift") || type.contains("settlement") ? "gift"
            : type.contains("partition") ? "partition"
            : type.contains("will") ? "inheritance"
            : "purchase"
    }

    private func save() async {
        saving = true
        problem = ""
        defer { saving = false }

        struct Created: Decodable { let createProperty: IDPayload? }
        let vars: [String: any Sendable] = [
            "type": type, "label": label.trimmingCharacters(in: .whitespaces),
            "address": address, "locality": locality, "city": city, "district": district,
            "landArea": Double(landArea) ?? 0, "landUnit": landUnit.label,
            "builtupArea": Double(builtup) ?? 0, "builtupUnit": "Sq.ft",
            "acquisitionMode": acquisitionMode.isEmpty ? "purchase" : acquisitionMode,
            "projectId": "", "groupId": "",
            // Everything the deed reader found that has no column of its own:
            // the stamp-paper set, the layout, the rate, the boundaries with
            // their measurements, the prior deed, what is bound into the file.
            // These were extracted, shown on screen, and then thrown away at
            // the wire — `attributes` was hard-coded to "".
            "attributes": scanned.map { deedAttributesJSON($0.fields) } ?? "",
            "purchasePrice": Double(price) ?? 0, "purchaseDate": purchaseDate,
            // Likewise the registration identity and the two names. A property
            // whose deed number is blank cannot be matched against an EC.
            "regDocNo": regDocNo, "sro": sro, "regDate": regDate,
            "sellerName": sellerName, "buyerName": buyerName,
        ]
        guard let created = await app.load(Mutations.createProperty, variables: vars, as: Created.self),
              let propertyID = created.createProperty?.id
        else {
            problem = app.lastFailure ?? "Could not create the property."
            return
        }

        // File the deed WITH the property, so the paper, what was read from it,
        // and the record all stay together. A record made from a document that
        // then throws the document away is how a holding ends up saying "no
        // documents attached" about the very deed that created it.
        if let scanned {
            stage = "Filing the deed…"
            do {
                try await file(scanned, linkTo: .property(propertyID))
            } catch {
                // The property IS saved; navigating away would carry this
                // message off screen with it.
                savedID = propertyID
                problem = "The property was saved, but its deed could not be filed: \(error.localizedDescription)"
                stage = ""
                return
            }
            stage = ""
        }
        app.clearRead()
        dismiss()
    }

    private func file(_ r: ScanResult, linkTo target: LinkTarget) async throws {
        try await app.fileDocument(r, linkTo: target)
    }
}

enum LinkTarget {
    case property(String), parcel(String), passbook(String), none
}
