import PattadarKit
import SwiftUI

/// Attach a document to land that already exists, and let it correct the record.
///
/// A passbook parcel starts with no deed: the passbook proves the holding, and
/// the sale deed turns up later, in another folder, sometimes years afterwards.
/// Until now there was no way in — a document could only arrive by creating a
/// NEW holding from it, which is how one field becomes two records.
///
/// The risk being managed is the wrong paper. The same survey number exists in
/// the next village, the adjacent subdivision, the plot next door in the same
/// layout — and a wrong attachment does not look wrong afterwards, it looks like
/// provenance. So the evidence is shown, and:
///
///   • a STRONG match (number and village agree) may suggest corrections
///   • a WEAK match may be attached, but suggests nothing
///   • a MISMATCH must be confirmed against a named conflict before it attaches
struct AttachDocumentSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let identity: HoldingIdentity
    let target: LinkTarget
    /// What the record says now, so the sheet can show what would change.
    let currentExtentAcres: Double
    let onAttached: () -> Void

    @State private var manualOpen = false
    @State private var scanned: ScanResult?
    @State private var applyExtent = false
    @State private var confirmMismatch = false
    /// The scan being re-filed as its own holding, when it turned out to
    /// describe different land. Boolean + stashed scan, because ScanResult
    /// is a plain bag of fields with no identity of its own.
    @State private var addingAsNew = false
    @State private var newPropertyScan: ScanResult?
    @State private var working = false
    @State private var problem = ""

    private var match: DocumentMatch? {
        scanned.map { matchDocument(identity, fields: $0.fields) }
    }

    var body: some View {
        NavigationStack {
            Form {
                if scanned == nil {
                    Section {
                        ScanFirstCard(
                            title: "Attach a document",
                            body_: "A sale deed, an EC, a tax receipt. It is checked against this holding before anything is changed.",
                            endpoint: .registeredDocument,
                            manualOpen: $manualOpen,
                            result: $scanned,
                            onResult: { _ in })
                    }
                }

                if let m = match, let r = scanned {
                    Section {
                        Label(verdictTitle(m), systemImage: verdictIcon(m))
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(verdictColour(m))
                        if !r.headline.isEmpty {
                            Text(r.headline).font(.callout)
                        }
                    } header: {
                        Text("What was read")
                    }

                    if !m.agreements.isEmpty {
                        Section("What matches") {
                            ForEach(m.agreements, id: \.self) { a in
                                Label(a, systemImage: "checkmark.circle.fill")
                                    .font(.subheadline).foregroundStyle(Palette.success)
                            }
                        }
                    }
                    if !m.conflicts.isEmpty {
                        Section {
                            ForEach(m.conflicts, id: \.self) { c in
                                Label(c, systemImage: "exclamationmark.triangle.fill")
                                    .font(.subheadline).foregroundStyle(Palette.danger)
                            }
                        } header: {
                            Text("What does not match")
                        } footer: {
                            Text("Attaching it anyway records this deed against land it may not describe.")
                        }
                    }

                    // Corrections are offered ONLY on a strong match, and only
                    // for what this holding's own mutation can actually write.
                    if m.isSafeToSuggest, let proposed = proposedExtent(r), proposed.0 > 0 {
                        Section {
                            Toggle(isOn: $applyExtent) {
                                VStack(alignment: .leading, spacing: Space.hair) {
                                    Text("Use the deed's extent").font(.subheadline)
                                    Text("\(areaText(currentExtentAcres, .acre)) → \(areaText(proposed.0, .acre))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        } header: {
                            Text("Update this holding")
                        } footer: {
                            Text("A deed conveys what was sold, which may be part of the holding. Off unless you choose it.")
                        }
                    }

                    if !problem.isEmpty {
                        Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
                    }

                    Section {
                        Button {
                            if m.level == .mismatch { confirmMismatch = true }
                            else { Task { await attach() } }
                        } label: {
                            HStack {
                                if working { ProgressView() }
                                Text(m.level == .mismatch ? "Attach anyway" : "Attach this document")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(m.level == .mismatch ? Palette.danger : .accentColor)
                        .disabled(working)

                        // The honest exit for a wrong paper: it is not this
                        // holding's document, but it IS a document — of some
                        // other land. Filing it as its own property keeps the
                        // reading instead of forcing a bad attach or a retreat.
                        if m.level != .strong {
                            Button {
                                newPropertyScan = scanned
                                addingAsNew = true
                            } label: {
                                Text("This is different land — file it as a NEW property")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }

                        Button("Read a different document") {
                            scanned = nil
                            applyExtent = false
                            app.clearRead()
                        }
                        .font(.footnote)
                    }
                }
            }
            .navigationTitle("Attach a document")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(app.isReading ? "Close" : "Cancel") {
                        app.clearReadIfSettled(); dismiss()
                    }
                }
            }
            .sheet(isPresented: $addingAsNew) {
                if let scan = newPropertyScan {
                    AddPropertyScreen(initialScan: scan)
                        .onDisappear { dismiss() }
                }
            }
            .confirmationDialog("Attach a document that does not match?",
                                isPresented: $confirmMismatch, titleVisibility: .visible) {
                Button("Attach anyway", role: .destructive) { Task { await attach() } }
                Button("Go back", role: .cancel) { }
            } message: {
                Text((match?.conflicts ?? []).joined(separator: "\n")
                     + "\n\nNothing about the holding will be changed — only the document is filed against it.")
            }
        }
    }

    private func verdictTitle(_ m: DocumentMatch) -> String {
        switch m.level {
        case .strong: "This document matches this holding"
        case .weak: "Cannot confirm this is the same land"
        case .mismatch: "This document describes different land"
        }
    }
    private func verdictIcon(_ m: DocumentMatch) -> String {
        switch m.level {
        case .strong: "checkmark.seal.fill"
        case .weak: "questionmark.circle.fill"
        case .mismatch: "xmark.octagon.fill"
        }
    }
    private func verdictColour(_ m: DocumentMatch) -> Color {
        switch m.level {
        case .strong: Palette.success
        case .weak: Palette.caution
        case .mismatch: Palette.danger
        }
    }

    /// The deed's extent in acres, when it states one.
    private func proposedExtent(_ r: ScanResult) -> (Double, UnitKey)? {
        let raw = (r.fields["extent"] as? String) ?? ""
        let parsed = parseExtent(raw, default: identity.acres > 0 ? .acre : .sqyd)
        guard parsed.value > 0 else { return nil }
        let acres = toAcres(parsed.value, parsed.unit)
        // Nothing to offer when it already agrees.
        return abs(acres - currentExtentAcres) < 1e-4 ? nil : (acres, parsed.unit)
    }

    private func attach() async {
        guard let r = scanned else { return }
        working = true
        problem = ""
        defer { working = false }

        do {
            try await app.fileDocument(r, linkTo: target)
        } catch {
            problem = "The document could not be filed: \(error.localizedDescription)"
            return
        }

        if applyExtent, let proposed = proposedExtent(r) {
            if let message = await app.updateExtent(target, acres: proposed.0, unit: proposed.1) {
                problem = "The document was attached, but the extent could not be updated: \(message)"
                onAttached()
                return
            }
        }

        app.completeReview()
        onAttached()
        dismiss()
    }
}
