import PattadarKit
import SwiftUI

struct AddParcelScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let passbooks: [PassbookDetail]
    /// When set, the parcel belongs to this passbook and the picker is hidden —
    /// the question has already been answered by where you came from.
    var fixedPassbookID: String? = nil
    /// Handed in when the routing screen has already read the document.
    var initialScan: ScanResult? = nil

    @State private var manualOpen = false
    @State private var scanned: ScanResult?
    @State private var passbookID = ""
    @State private var surveyNo = ""
    @State private var subdivision = ""
    @State private var extent = ""
    @State private var unit: UnitKey = .acre
    @State private var classification = "agri"
    @State private var saving = false
    @State private var problem = ""
    @State private var savedID = ""
    /// Set when the scan is clearly a passbook rather than a single deed.
    @State private var looksLikePassbook = false
    @State private var showPassbookForm = false

    /// "Cancel" abandons the form; "Close" steps out of a read that keeps
    /// running. Calling both Cancel made leaving mid-scan look destructive.
    private var closeLabel: String { app.isReading ? "Close" : "Cancel" }

    var body: some View {
        NavigationStack {
            Form {
                if initialScan == nil {
                Section {
                    ScanFirstCard(
                        title: "Read it from the deed",
                        body_: "Photograph or upload the deed — the survey number, extent and classification are read from it.",
                        endpoint: .registeredDocument,
                        manualOpen: $manualOpen,
                        result: $scanned,
                        onResult: prefill
                    )
                }
                }
                if looksLikePassbook {
                    Section {
                        // Classification should route, not just describe. A ROR
                        // lists many survey numbers; entering it as one parcel
                        // throws the rest of the passbook away.
                        VStack(alignment: .leading, spacing: Space.sm) {
                            Label("This looks like a passbook, not a single parcel",
                                  systemImage: "arrow.triangle.branch")
                                .font(.subheadline.weight(.medium))
                            Text("A pattadar passbook or ROR lists every survey number you hold. Entered here, only one of them is kept.")
                                .font(.caption).foregroundStyle(.secondary)
                            Button {
                                showPassbookForm = true
                            } label: {
                                Label("Open the passbook form instead", systemImage: "book.closed.fill")
                                    .font(.subheadline)
                            }
                        }
                    }
                    .listRowBackground(Palette.caution.opacity(0.12))
                }
                if manualOpen {
                    Section("Details") {
                        if fixedPassbookID == nil {
                            Picker("Passbook", selection: $passbookID) {
                                Text("Choose a passbook").tag("")
                                ForEach(passbooks) { Text("\($0.pattadarNo) (\($0.village))").tag($0.id) }
                            }
                        } else if let pb = passbooks.first {
                            LabeledContent("Passbook", value: pb.pattadarNo)
                        }
                        FormRow(label: "Survey number", text: $surveyNo, prompt: "124", required: true)
                        FormRow(label: "Sub-division", text: $subdivision, prompt: "1")
                        LabeledContent("Extent") {
                            HStack(spacing: Space.sm) {
                                TextField("0", text: $extent)
                                    .multilineTextAlignment(.trailing)
                                    .keyboardType(.decimalPad)
                                // Fixed width so opening the unit list cannot
                                // squeeze the number it belongs to.
                                Picker("", selection: $unit) {
                                    ForEach(UnitKey.allCases, id: \.self) { Text($0.label).tag($0) }
                                }
                                .labelsHidden()
                                .frame(width: 116)
                            }
                        }
                        Picker("Classification", selection: $classification) {
                            Text("Agricultural").tag("agri")
                            Text("Non-agricultural").tag("non-agri")
                        }
                        .pickerStyle(.segmented)
                    }
                    if !problem.isEmpty {
                        Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
                    }
                    Section {
                        PrimaryButton(title: savedID.isEmpty ? "Save parcel" : "Done",
                                      busy: saving,
                                      disabled: passbookID.isEmpty || surveyNo.isEmpty || (Double(extent) ?? 0) <= 0) {
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
            .navigationTitle("New parcel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(closeLabel) { app.clearReadIfSettled(); dismiss() } } }
            .sheet(isPresented: $showPassbookForm) {
                AddPassbookScreen().onDisappear { dismiss() }
            }
            .onAppear {
                if let scan = initialScan, scanned == nil { prefill(scan); manualOpen = true }
                if let fixed = fixedPassbookID { passbookID = fixed }
                else if passbookID.isEmpty { passbookID = passbooks.first?.id ?? "" }
            }
        }
    }

    /// Starting over clears what the read filled; a half-replaced form reads
    /// as checked when it is not. The chosen passbook stays — that was yours.
    private func clearPrefill() {
        surveyNo = ""; subdivision = ""; extent = ""
        unit = .acre
        classification = "agri"
        problem = ""
    }

    private func prefill(_ r: ScanResult) {
        scanned = r
        let docType = (r.fields["doc_type"] as? String ?? "").lowercased()
        looksLikePassbook = docType.contains("passbook") || docType.contains("ror")
            || docType.contains("adangal") || docType.contains("1-b") || docType.contains("1b")
        let s = { (k: String) in (r.fields[k] as? String ?? "") }
        surveyNo = s("survey_no")
        subdivision = s("plot_no")
        // The unit comes from the DOCUMENT. Assuming square yards filed a ROR
        // reading "30.00 acres" as thirty square yards — the holding
        // understated 4,840-fold, silently.
        //
        // Farmland records are written in acres, so that is the fallback when
        // the paper names no unit at all.
        let parsed = parseExtent(s("extent"), default: .acre)
        if parsed.value > 0 {
            extent = String(format: "%g", parsed.value)
            unit = parsed.unit
        }
        let c = s("classification").lowercased()
        if !c.isEmpty {
            classification = (c.contains("house") || c.contains("commerc") || c.contains("site")) ? "non-agri" : "agri"
        }
    }

    private func save() async {
        saving = true
        problem = ""
        defer { saving = false }
        struct Created: Decodable { let createParcel: IDPayload? }
        // `extent` is canonical decimal ACRES; the unit is a provenance label.
        // Writing the raw number with the label is how "40 Guntas" becomes 40
        // acres — the exact bug the shared vectors now pin.
        let acres = toAcres(Double(extent) ?? 0, unit)
        let vars: [String: any Sendable] = [
            "passbookId": passbookID, "surveyNo": surveyNo, "subdivision": subdivision,
            "extent": acres, "unit": unit.label, "classification": classification,
            "acquisitionSource": "", "parentParcelId": "", "source": "ios",
        ]
        guard let created = await app.load(Mutations.createParcel, variables: vars, as: Created.self),
              let parcelID = created.createParcel?.id else {
            problem = app.lastFailure ?? "Could not create the parcel."
            return
        }
        if let scanned {
            do { try await app.fileDocument(scanned, linkTo: .parcel(parcelID)) }
            catch {
                savedID = parcelID
                problem = "The parcel was saved, but its deed could not be filed: \(error.localizedDescription)"
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
