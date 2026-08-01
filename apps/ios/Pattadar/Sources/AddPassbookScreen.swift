import PattadarKit
import SwiftUI

/// New passbook — scanning a passbook fills the owner AND creates every parcel
/// listed on it, each converted to canonical acres.
struct AddPassbookScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    /// Handed in when the routing screen has already read the document.
    var initialScan: ScanResult? = nil
    /// What you already hold. A passbook is identified by its khata number AND
    /// its village, so a repeat scan can be recognised rather than duplicated.
    var existing: [PassbookDetail] = []
    var existingParcels: [Parcel] = []

    @State private var manualOpen = false
    @State private var scanned: ScanResult?
    @State private var pattadarNo = ""
    @State private var ownerName = ""
    @State private var fatherName = ""
    @State private var state = "Andhra Pradesh"
    @State private var district = ""
    @State private var mandal = ""
    @State private var village = ""
    @State private var parcels: [[String: Any]] = []
    @State private var saving = false
    @State private var problem = ""
    @State private var savedID = ""
    /// The passbook this scan turns out to be a new reading of.
    @State private var duplicate: PassbookDetail?
    @State private var reconciling: PassbookDiff?

    /// "Cancel" abandons the form; "Close" steps out of a read that keeps
    /// running. Calling both Cancel made leaving mid-scan look destructive.
    private var closeLabel: String { app.isReading ? "Close" : "Cancel" }

    var body: some View {
        NavigationStack {
            Form {
                if initialScan == nil {
                Section {
                    ScanFirstCard(
                        title: "Read it from the passbook",
                        body_: "Photograph the pattadar passbook — the owner, village and every parcel on it are read for you.",
                        endpoint: .passbook,
                        manualOpen: $manualOpen,
                        result: $scanned,
                        onResult: prefill
                    )
                }
                }
                if manualOpen {
                    if let dup = duplicate {
                        Section {
                            VStack(alignment: .leading, spacing: 6) {
                                Label("You already have this passbook", systemImage: "doc.on.doc.fill")
                                    .font(.subheadline.weight(.medium))
                                Text("Khata \(dup.pattadarNo) in \(dup.village)\(dup.ownerName.isEmpty ? "" : " · \(dup.ownerName)"). Saving again would split one holding into two and double-count the acres.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Section {
                        FormRow(label: "Pattadar no.", text: $pattadarNo, prompt: "12345", required: true)
                        FormRow(label: "Owner", text: $ownerName, prompt: "Full name")
                        FormRow(label: "Father / husband", text: $fatherName, prompt: "Full name")
                        FormRow(label: "Village", text: $village, prompt: "Katraguntla", required: true)
                        FormRow(label: "Mandal", text: $mandal, prompt: "Konakanamitla")
                        FormRow(label: "District", text: $district, prompt: "Prakasam")
                        FormRow(label: "State", text: $state)
                    } header: {
                        Text("Passbook")
                    } footer: {
                        Text("A khata number identifies a passbook only within its village — both are needed.")
                    }
                    if parcels.isEmpty {
                        Section {
                            Text("Save the passbook first, then add its survey numbers from the passbook screen.")
                                .font(.caption).foregroundStyle(.secondary)
                        } header: {
                            Text("Parcels")
                        }
                    }
                    if !parcels.isEmpty {
                        Section("Parcels read from it") {
                            ForEach(Array(parcels.enumerated()), id: \.offset) { _, p in
                                HStack {
                                    Text("Sy \(p["survey_no"] as? String ?? "—")")
                                    Spacer()
                                    Text(extentLabel(p)).monospacedDigit().foregroundStyle(.secondary)
                                }
                            }
                            Text("Each is converted to acres before saving.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if !problem.isEmpty {
                        Section { Text(problem).foregroundStyle(.red).font(.callout) }
                    }
                    Section {
                        PrimaryButton(title: savedID.isEmpty
                                        ? (duplicate == nil ? "Save passbook" : "Review changes")
                                        : "Done",
                                      busy: saving,
                                      // A khata number is only unique WITHIN a
                                      // village; without both, two passbooks
                                      // cannot be told apart.
                                      disabled: pattadarNo.trimmingCharacters(in: .whitespaces).isEmpty
                                                || village.trimmingCharacters(in: .whitespaces).isEmpty) {
                            if !savedID.isEmpty { dismiss() }
                            else if duplicate != nil { review() }
                            else { Task { await save() } }
                        }
                    }
                    if scanned != nil {
                        Section {
                            RescanRow { scanned = nil; clearPrefill() }
                        }
                    }
                }
            }
            .navigationTitle("New passbook")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(closeLabel) { app.clearReadIfSettled(); dismiss() } } }
            .onChange(of: pattadarNo) { _, _ in matchExisting() }
            .onChange(of: village) { _, _ in matchExisting() }
            .sheet(item: $reconciling) { d in
                PassbookReconcileScreen(diff: d, scan: scanned) {
                    savedID = d.passbook.id
                    dismiss()
                }
            }
            .onAppear {
                // Already read upstream; prefill and open the form straight
                // away rather than asking for the same document twice.
                if let scan = initialScan, scanned == nil { prefill(scan); manualOpen = true }
            }
        }
    }

    private func extentLabel(_ p: [String: Any]) -> String {
        let parsed = parseExtent(p["extent"] as? String, default: .acre)
        let value = (p["extent"] as? Double) ?? parsed.value
        let unit = (p["unit"] as? String).map(unitKey) ?? parsed.unit
        return String(format: "%g %@", value, unit.label)
    }

    /// Starting over clears the passbook AND the parcels the passbook produced —
    /// leaving twenty parcels from a discarded scan would file them under the
    /// next one.
    private func clearPrefill() {
        pattadarNo = ""; ownerName = ""; fatherName = ""
        district = ""; mandal = ""; village = ""
        state = "Andhra Pradesh"
        parcels = []
        problem = ""
        duplicate = nil
    }

    private func prefill(_ r: ScanResult) {
        scanned = r
        let s = { (k: String) in (r.fields[k] as? String ?? "") }
        pattadarNo = s("pattadar_no")
        ownerName = s("owner_name")
        fatherName = s("father_husband_name")

        // A passbook read through the DEED endpoint has no owner_name field —
        // it has `parties`. Rather than leave the form blank beside a summary
        // that names the person, take the holder from there.
        if ownerName.isEmpty, let parties = r.fields["parties"] as? [[String: Any]] {
            let holder = parties.first { ($0["role"] as? String) == "buyer" } ?? parties.first
            ownerName = (holder?["name"] as? String) ?? ""
            if fatherName.isEmpty {
                fatherName = (holder?["parentage"] as? String) ?? ""
            }
        }
        if !s("state").isEmpty { state = s("state") }
        district = s("district")
        mandal = s("mandal")
        village = s("village")
        parcels = r.fields["parcels"] as? [[String: Any]] ?? []
        matchExisting()
    }

    /// A passbook is its khata number AND its village. Recognising a re-scan is
    /// what stops one holding becoming two records that each tell half the
    /// truth — and it applies to a number typed by hand just as much as a
    /// scanned one.
    private func matchExisting() {
        duplicate = findExistingPassbook(existing, pattadarNo: pattadarNo, village: village)
    }

    /// What this reading claims, in the shape the diff understands. Extents are
    /// converted here, once, exactly as `save()` does — a review that compared
    /// unconverted numbers would report every row as changed.
    private func scannedPassbook() -> ScannedPassbook {
        ScannedPassbook(
            pattadarNo: pattadarNo, ownerName: ownerName, fatherHusbandName: fatherName,
            state: state, district: district, mandal: mandal, village: village,
            parcels: parcels.map { p in
                let parsed = parseExtent(p["extent"] as? String, default: .acre)
                let raw = (p["extent"] as? Double) ?? parsed.value
                let unit = (p["unit"] as? String).map(unitKey) ?? parsed.unit
                return ScannedParcel(
                    surveyNo: p["survey_no"] as? String ?? "",
                    subdivision: p["subdivision"] as? String ?? "",
                    acres: toAcres(raw, unit),
                    unit: unit.label,
                    classification: p["classification"] as? String ?? "agri",
                    acquisitionSource: p["acquisition_source"] as? String ?? "")
            })
    }

    private func review() {
        guard let dup = duplicate else { return }
        reconciling = diffPassbook(
            existing: dup,
            parcels: existingParcels.filter { $0.passbookId == dup.id },
            scanned: scannedPassbook())
    }

    private func save() async {
        saving = true
        problem = ""
        defer { saving = false }

        struct Created: Decodable { let createPassbook: IDPayload? }
        let vars: [String: any Sendable] = [
            "pattadarNo": pattadarNo, "state": state, "district": district, "mandal": mandal,
            "village": village, "ownerName": ownerName, "fatherHusbandName": fatherName, "groupId": "",
        ]
        guard let created = await app.load(Mutations.createPassbook, variables: vars, as: Created.self),
              let passbookID = created.createPassbook?.id else {
            problem = app.lastFailure ?? "Could not create the passbook."
            return
        }

        // Every parcel read off the passbook, CONVERTED. Writing the extracted
        // number verbatim with its unit as a label stored "40 Guntas" as forty
        // ACRES in the RN app for months.
        // A passbook holds ONE OR MORE parcels, and a partial save is the
        // dangerous outcome: the holding silently shrinks to whatever survived
        // while the screen reports success. Every row is accounted for.
        struct MadeParcel: Decodable { let createParcel: IDPayload? }
        var missed: [String] = []
        for p in parcels {
            // A passbook's rows may carry the unit in the value string
            // ("2-20 acres") or in a separate field. Prefer the explicit
            // field; fall back to reading it out of the text.
            let rawText = p["extent"] as? String
            let parsed = parseExtent(rawText, default: .acre)
            let raw = (p["extent"] as? Double) ?? parsed.value
            let unit = (p["unit"] as? String).map(unitKey) ?? parsed.unit
            let vars: [String: any Sendable] = [
                "passbookId": passbookID,
                "surveyNo": p["survey_no"] as? String ?? "",
                "subdivision": p["subdivision"] as? String ?? "",
                "extent": toAcres(raw, unit),
                "unit": unit.label,
                "classification": p["classification"] as? String ?? "agri",
                "acquisitionSource": p["acquisition_source"] as? String ?? "",
                "parentParcelId": "", "source": "passbook:\(passbookID)",
            ]
            let made = await app.load(Mutations.createParcel, variables: vars, as: MadeParcel.self)
            if made?.createParcel?.id == nil {
                let sy = p["survey_no"] as? String ?? "?"
                missed.append("Sy \(sy)")
            }
        }
        if !missed.isEmpty {
            savedID = passbookID
            problem = missed.count == parcels.count
                ? "The passbook was saved, but none of its \(parcels.count) survey numbers could be added. Add them from the passbook screen."
                : "The passbook was saved with \(parcels.count - missed.count) of \(parcels.count) survey numbers. Missing: \(missed.joined(separator: ", ")). Add them from the passbook screen."
            return
        }

        if let scanned {
            do { try await app.fileDocument(scanned, linkTo: .passbook(passbookID)) }
            catch {
                savedID = passbookID
                problem = "The passbook was saved, but the passbook could not be filed: \(error.localizedDescription)"
                return
            }
        }
        // The document has been filed; the proposal is now a record, so it
        // comes off the review list. Cancelling deliberately does NOT — a
        // reading somebody walked away from is still waiting for them.
        app.completeReview()
        dismiss()
    }
}
