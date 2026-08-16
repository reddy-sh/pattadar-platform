import PattadarKit
import SwiftUI

/// You scanned a passbook you already hold. Review what changed.
///
/// The two wrong answers are creating a second copy — which double-counts the
/// acres and leaves neither record true — and overwriting silently, which loses
/// whatever was corrected by hand. So the scan is presented as a proposal:
/// added, changed, unchanged, and no longer listed, each with a decision.
///
/// The default on a REMOVAL is always "keep". A page that did not fit in frame
/// is indistinguishable from a parcel that was sold, and only one of those two
/// mistakes destroys a land record.
struct PassbookReconcileScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let diff: PassbookDiff
    /// The document that produced this reading, filed against the passbook.
    var scan: ScanResult?
    let onApplied: () -> Void

    @State private var takeField: [String: Bool] = [:]
    @State private var takeParcel: [String: Bool] = [:]
    @State private var applying = false
    @State private var problem = ""

    private var chosenCount: Int {
        takeField.values.filter { $0 }.count + takeParcel.values.filter { $0 }.count
    }

    /// "Cancel" abandons the form; "Close" steps out of a read that keeps
    /// running. Calling both Cancel made leaving mid-scan look destructive.
    private var closeLabel: String { app.isReading ? "Close" : "Cancel" }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        Label("You already have this passbook", systemImage: "doc.on.doc.fill")
                            .font(.subheadline.weight(.medium))
                        Text("Khata \(diff.passbook.pattadarNo) in \(diff.passbook.village). Nothing is added twice — this reading is compared against what you hold.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }

                if diff.isIdentical {
                    Section {
                        Label("Nothing has changed", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(Palette.success)
                        Text("This passbook reads exactly as it does on file — \(diff.unchanged.count) survey \(diff.unchanged.count == 1 ? "number" : "numbers"), same extents.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }

                if !diff.fields.isEmpty {
                    Section {
                        ForEach(diff.fields) { f in
                            DecisionRow(
                                title: f.label,
                                was: f.existing,
                                now: f.scanned,
                                note: f.fillsABlank ? "Not set before" : "Replaces what you have",
                                take: binding(field: f))
                        }
                    } header: {
                        Text("Details")
                    } footer: {
                        Text("A name you entered yourself is kept unless you choose the new reading.")
                    }
                }

                if !diff.added.isEmpty {
                    Section {
                        ForEach(diff.added) { c in
                            if case .added(let s) = c {
                                DecisionRow(
                                    title: "Sy \(s.surveyNo)",
                                    was: nil,
                                    now: acresText(s.acres),
                                    note: "New on this passbook",
                                    take: binding(parcel: c))
                            }
                        }
                    } header: {
                        Label("Added — \(diff.added.count)", systemImage: "plus.circle.fill")
                    }
                }

                if !diff.changed.isEmpty {
                    Section {
                        ForEach(diff.changed) { c in
                            if case .changed(let e, let s) = c {
                                DecisionRow(
                                    title: "Sy \(e.surveyNo)",
                                    was: acresText(e.extent),
                                    now: acresText(s.acres),
                                    note: s.acres < e.extent ? "Smaller than your record" : "Larger than your record",
                                    take: binding(parcel: c))
                            }
                        }
                    } header: {
                        Label("Changed — \(diff.changed.count)", systemImage: "arrow.triangle.2.circlepath")
                    } footer: {
                        Text("Land is partitioned, sold and re-surveyed. Accepting replaces the extent on file.")
                    }
                }

                if !diff.missing.isEmpty {
                    Section {
                        ForEach(diff.missing) { c in
                            if case .missing(let e) = c {
                                DecisionRow(
                                    title: "Sy \(e.surveyNo)",
                                    was: acresText(e.extent),
                                    now: nil,
                                    note: "Not on this scan",
                                    take: binding(parcel: c),
                                    destructive: true,
                                    acceptLabel: "Remove")
                            }
                        }
                    } header: {
                        Label("No longer listed — \(diff.missing.count)", systemImage: "exclamationmark.triangle.fill")
                    } footer: {
                        Text("Kept unless you say otherwise. A page that did not fit in the photograph looks exactly like a parcel that was sold.")
                    }
                }

                if !diff.unchanged.isEmpty && !diff.isIdentical {
                    Section("Unchanged — \(diff.unchanged.count)") {
                        ForEach(diff.unchanged) { c in
                            if case .unchanged(let e) = c {
                                LabeledContent("Sy \(e.surveyNo)", value: acresText(e.extent))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
                }
            }
            .navigationTitle("Review changes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(closeLabel) { app.clearReadIfSettled(); dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: Space.sm) {
                    Button {
                        Task { await apply() }
                    } label: {
                        Group {
                            if applying { ProgressView() }
                            else { Text(chosenCount == 0 ? "Keep everything as it is" : "Apply \(chosenCount) \(chosenCount == 1 ? "change" : "changes")") }
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(applying)
                    if chosenCount == 0 && !diff.isIdentical {
                        Text("Nothing selected — your record stays exactly as it is.")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .padding()
                .background(.bar)
            }
            .onAppear(perform: seedDecisions)
        }
    }

    /// Every row starts where the safe answer is, not where the scan wants it.
    private func seedDecisions() {
        guard takeField.isEmpty && takeParcel.isEmpty else { return }
        for f in diff.fields { takeField[f.id] = defaultDecision(for: f) }
        for c in diff.parcels where c.isActionable { takeParcel[c.id] = defaultDecision(for: c) }
    }

    private func binding(field f: FieldChange) -> Binding<Bool> {
        Binding(get: { takeField[f.id] ?? false }, set: { takeField[f.id] = $0 })
    }
    private func binding(parcel c: ParcelChange) -> Binding<Bool> {
        Binding(get: { takeParcel[c.id] ?? false }, set: { takeParcel[c.id] = $0 })
    }

    /// Acres, the same way the holdings list writes them — a comparison is
    /// worthless if the two numbers are formatted differently.
    private func acresText(_ a: Double) -> String {
        String(format: "%.2f ac", a)
    }

    // MARK: - Applying

    private func apply() async {
        applying = true
        defer { applying = false }
        problem = ""
        var failed: [String] = []

        // Header fields go in ONE update, because updatePassbook takes the whole
        // row: sending it per-field would wipe the fields left out.
        if diff.fields.contains(where: { takeField[$0.id] == true }) {
            func value(_ field: String, _ current: String) -> String {
                guard let f = diff.fields.first(where: { $0.field == field }), takeField[f.id] == true
                else { return current }
                return f.scanned
            }
            let p = diff.passbook
            struct Ack: Decodable { let updatePassbook: IDPayload? }
            let vars: [String: any Sendable] = [
                "id": p.id,
                "pattadarNo": p.pattadarNo,
                "ownerName": value("ownerName", p.ownerName),
                "fatherHusbandName": value("fatherHusbandName", p.fatherHusbandName),
                "state": value("state", p.state),
                "district": value("district", p.district),
                "mandal": value("mandal", p.mandal),
                "village": p.village,
            ]
            if await app.load(Mutations.updatePassbook, variables: vars, as: Ack.self)?
                .updatePassbook?.id == nil {
                failed.append("the passbook details")
            }
        }

        for c in diff.parcels where takeParcel[c.id] == true {
            switch c {
            case .added(let s):
                struct Ack: Decodable { let createParcel: IDPayload? }
                let vars: [String: any Sendable] = [
                    "passbookId": diff.passbook.id,
                    "surveyNo": s.surveyNo, "subdivision": s.subdivision,
                    "extent": s.acres, "unit": s.unit,
                    "classification": s.classification.isEmpty ? "agri" : s.classification,
                    "acquisitionSource": s.acquisitionSource,
                    "parentParcelId": "", "source": "passbook:\(diff.passbook.id)",
                ]
                if await app.load(Mutations.createParcel, variables: vars, as: Ack.self)?
                    .createParcel?.id == nil { failed.append("Sy \(s.surveyNo)") }

            case .changed(let e, let s):
                struct Ack: Decodable { let updateParcel: IDPayload? }
                let vars: [String: any Sendable] = [
                    "id": e.id, "surveyNo": e.surveyNo, "subdivision": e.subdivision,
                    "extent": s.acres, "unit": s.unit,
                    "classification": s.classification.isEmpty ? e.classification : s.classification,
                ]
                if await app.load(Mutations.updateParcel, variables: vars, as: Ack.self)?
                    .updateParcel?.id == nil { failed.append("Sy \(e.surveyNo)") }

            case .missing(let e):
                struct Ack: Decodable { let deleteParcel: Bool }
                if await app.load(Mutations.deleteParcel, variables: ["id": e.id], as: Ack.self)?
                    .deleteParcel != true { failed.append("Sy \(e.surveyNo)") }

            case .unchanged:
                break
            }
        }

        // The document is filed against the passbook either way — it is the
        // evidence for this reading, whether or not anything was accepted.
        if let scan {
            do { try await app.fileDocument(scan, linkTo: .passbook(diff.passbook.id)) }
            catch { failed.append("the scanned document") }
        }

        if failed.isEmpty {
            app.clearRead()
            onApplied()
            dismiss()
        } else {
            problem = "Applied, except: \(failed.joined(separator: ", ")). Nothing else was affected — try those again."
        }
    }
}

/// One proposed change: what you have, what the paper says, and your answer.
private struct DecisionRow: View {
    let title: String
    let was: String?
    let now: String?
    let note: String
    @Binding var take: Bool
    var destructive = false
    var acceptLabel = "Use this"

    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            HStack {
                Text(title).font(.body.weight(.medium))
                Spacer()
                Toggle(acceptLabel, isOn: $take)
                    .labelsHidden()
                    .tint(destructive ? Palette.danger : .accentColor)
            }
            HStack(spacing: Space.sm) {
                if let was {
                    Text(was)
                        .strikethrough(take && now != nil || (take && destructive), color: .secondary)
                        .foregroundStyle(take ? .secondary : .primary)
                }
                if was != nil && now != nil {
                    Image(systemName: "arrow.right").font(.caption2).foregroundStyle(.secondary)
                }
                if let now {
                    Text(now).foregroundStyle(take ? .primary : .secondary)
                        .fontWeight(take ? .medium : .regular)
                }
                if now == nil && destructive {
                    Text(take ? "will be removed" : "kept")
                        .font(.caption)
                        .foregroundStyle(take ? Palette.danger : .secondary)
                }
            }
            .font(.subheadline)
            Text(note).font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, Space.hair)
    }
}
