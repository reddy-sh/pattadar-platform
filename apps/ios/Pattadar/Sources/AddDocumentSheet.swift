import PattadarKit
import SwiftUI

/// Attach a document on its own, without creating a holding for it.
struct AddDocumentSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onFiled: () -> Void

    @State private var manualOpen = false
    @State private var scanned: ScanResult?
    @State private var filing = false
    @State private var problem = ""
    @State private var showFiles = false
    /// What is already in the vault, so a repeat scan can be recognised
    /// rather than filed a second time. Loaded when the sheet opens, for the
    /// same reason the passbook detector loads its own list: a detector that
    /// runs against nothing always says "new".
    @State private var alreadyFiled: [RegisteredDocument] = []
    /// A paper this scan appears to already be, and the scan waiting on the
    /// answer.
    @State private var duplicate: (match: FiledDocumentMatch, scan: ScanResult)?

    /// "Cancel" abandons the form; "Close" steps out of a read that keeps
    /// running. Calling both Cancel made leaving mid-scan look destructive.
    private var closeLabel: String { app.isReading ? "Close" : "Cancel" }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ScanFirstCard(
                        title: "Read the document",
                        body_: "Photograph or upload a deed, passbook or certificate. What it says is read and kept with it.",
                        endpoint: .registeredDocument,
                        manualOpen: $manualOpen,
                        result: $scanned,
                        onResult: file
                    )
                }
                // Keeping a paper and having it read are different wants. A
                // tax receipt, a photocopy, a page somebody just wants
                // somewhere safe — none of them need a model, and until this
                // existed the only way to keep them was to pay to read them.
                Section {
                    Button {
                        showFiles = true
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: Space.hair) {
                                Text("Just add the file")
                                Text("Kept as it is, nothing read. You can read it later.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "tray.and.arrow.down")
                        }
                    }
                    .disabled(filing || app.isReading)
                }
                if filing { Section { HStack { ProgressView(); Text("Filing…") } } }
                if !problem.isEmpty { Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) } }
            }
            .navigationTitle("Add document")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(closeLabel) { app.clearReadIfSettled(); dismiss() } } }
            .fileImporter(isPresented: $showFiles,
                          allowedContentTypes: [.pdf, .image, .plainText, .data]) { res in
                guard case .success(let url) = res else { return }
                keepAsIs(url)
            }
            .task {
                alreadyFiled = (await app.load(Queries.documents,
                                               as: DocumentsResponse.self))?
                    .registeredDocuments ?? []
            }
            // The paper is already here. Three honest ways forward, and no
            // default — the app cannot know whether this is a better copy of
            // the same sheet, a second original, or a scan made twice by
            // accident.
            .confirmationDialog(
                "This paper is already in your vault",
                isPresented: Binding(get: { duplicate != nil },
                                     set: { if !$0 { duplicate = nil } }),
                titleVisibility: .visible
            ) {
                Button("Replace the one on file") { resolve(.replace) }
                Button("File this as well") { resolve(.keepBoth) }
                Button("Don’t file it", role: .cancel) { resolve(.discard) }
            } message: {
                Text(duplicate?.match.because ?? "")
            }
        }
    }

    /// Keep a picked file exactly as it is — no model, no credit.
    ///
    /// No duplicate check runs here on purpose: the detector reads an
    /// EXTRACTION, and nothing has been extracted. Two copies of one file is
    /// also a thing people legitimately keep, and refusing the second is how
    /// a vault ends up with `deed2.pdf` typed by hand.
    private func keepAsIs(_ url: URL) {
        // A picked file lives outside the sandbox; it must be copied in
        // before it can be read or uploaded.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let temp = FileManager.default.temporaryDirectory
            .appendingPathComponent(url.lastPathComponent)
        try? FileManager.default.removeItem(at: temp)
        Task {
            filing = true
            defer { filing = false }
            do {
                try FileManager.default.copyItem(at: url, to: temp)
                // Unlinked on purpose, like a scanned filing: it can be
                // attached to a holding later.
                try await app.fileWithoutReading(url: temp, named: url.lastPathComponent,
                                                 linkTo: .none)
                onFiled()
                dismiss()
            } catch {
                problem = "Couldn’t keep that file — \(error.localizedDescription)"
            }
        }
    }

    /// What to do about a paper that is already on file.
    private enum Resolution { case replace, keepBoth, discard }

    private func file(_ r: ScanResult) {
        // Ask before filing, not after. A duplicate noticed afterwards is a
        // row somebody has to find and delete, and two identical lines in a
        // vault give no clue which of them to keep.
        if let match = findFiledDocument(alreadyFiled,
                                         like: ScannedDocumentIdentity(fields: r.fields)) {
            duplicate = (match, r)
            return
        }
        send(r, replacing: nil)
    }

    private func resolve(_ choice: Resolution) {
        guard let pending = duplicate else { return }
        duplicate = nil
        switch choice {
        case .replace: send(pending.scan, replacing: pending.match.existing)
        case .keepBoth: send(pending.scan, replacing: nil)
        case .discard:
            // Deliberately thrown away, which is different from failing. The
            // read is cleared so returning to this sheet does not offer it
            // again as if it were new.
            app.clearReadIfSettled()
            dismiss()
        }
    }

    private func send(_ r: ScanResult, replacing existing: RegisteredDocument?) {
        Task {
            filing = true
            defer { filing = false }
            do {
                // Unlinked on purpose: it can be attached to a holding later.
                try await app.fileDocument(r, linkTo: .none)
                // The new copy lands first, then the old one goes. The other
                // order would leave nothing on file at all if the filing failed.
                if let existing {
                    struct Gone: Decodable { let deleteRegisteredDocument: Bool? }
                    _ = await app.load(Mutations.deleteRegisteredDocument,
                                       variables: ["id": existing.id], as: Gone.self)
                }
                onFiled()
                dismiss()
            } catch {
                problem = String(describing: error)
            }
        }
    }
}

/// A reading that is a PAPER, not a holding — an identity card, an EC, a
/// receipt — shown for one confirming look, then filed into the vault. A
/// machine's reading never becomes a record without a person saying so.
struct FileToVaultScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let scan: ScanResult?

    @State private var filing = false
    @State private var problem = ""
    /// Same detector as the vault's own add flow — a reading accepted from
    /// the review queue is just as capable of being a paper already on file.
    @State private var alreadyFiled: [RegisteredDocument] = []
    @State private var duplicate: (match: FiledDocumentMatch, scan: ScanResult)?

    var body: some View {
        NavigationStack {
            Form {
                if let scan {
                    let type = (scan.fields["doc_type"] as? String ?? "")
                    let family = documentFamily(type)
                    Section {
                        VStack(alignment: .leading, spacing: Space.md) {
                            Text((type.isEmpty ? "Document" : type).uppercased())
                                .font(.scaled(10.5, weight: .semibold)).kerning(0.8)
                                .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                                .background(familyTintColor(family).opacity(0.16), in: Capsule())
                                .foregroundStyle(familyTintColor(family))
                            Text(headline(scan))
                                .font(.scaled(22, weight: .semibold, design: .serif))
                            let summary = maskSensitiveText(scan.fields["summary"] as? String ?? "")
                            if !summary.isEmpty {
                                Text(summary.components(separatedBy: "\n\n").first ?? summary)
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, Space.xs)
                    } footer: {
                        Text("An identity card, certificate or receipt is a paper, not a holding — it goes into the vault and can be attached to land or a person any time.")
                    }
                    Section {
                        Button { file(scan) } label: {
                            HStack {
                                if filing { ProgressView().padding(.trailing, Space.sm) }
                                Label(filing ? "Filing…" : "File into the vault",
                                      systemImage: "lock.doc.fill")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .disabled(filing)
                    }
                    if !problem.isEmpty {
                        Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
                    }
                }
            }
            .navigationTitle("File this paper")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // Walking away KEEPS the reading in the review queue —
                    // discarding is the queue's own, deliberate action.
                    Button("Not now") { dismiss() }
                }
            }
            .task {
                alreadyFiled = (await app.load(Queries.documents,
                                               as: DocumentsResponse.self))?
                    .registeredDocuments ?? []
            }
            .confirmationDialog(
                "This paper is already in your vault",
                isPresented: Binding(get: { duplicate != nil },
                                     set: { if !$0 { duplicate = nil } }),
                titleVisibility: .visible
            ) {
                Button("Replace the one on file") { resolve(replacing: true) }
                Button("File this as well") { resolve(replacing: false) }
                Button("Don’t file it", role: .cancel) { duplicate = nil }
            } message: {
                Text(duplicate?.match.because ?? "")
            }
        }
    }

    private func resolve(replacing: Bool) {
        guard let pending = duplicate else { return }
        duplicate = nil
        send(pending.scan, replacing: replacing ? pending.match.existing : nil)
    }

    private func headline(_ r: ScanResult) -> String {
        let h = maskSensitiveText(r.fields["headline"] as? String ?? "")
        if !h.isEmpty { return h }
        let type = (r.fields["doc_type"] as? String ?? "")
        return type.isEmpty ? "What was read" : type
    }

    private func file(_ r: ScanResult) {
        if let match = findFiledDocument(alreadyFiled,
                                         like: ScannedDocumentIdentity(fields: r.fields)) {
            duplicate = (match, r)
            return
        }
        send(r, replacing: nil)
    }

    private func send(_ r: ScanResult, replacing existing: RegisteredDocument?) {
        Task {
            filing = true
            defer { filing = false }
            do {
                try await app.fileDocument(r, linkTo: .none)
                if let existing {
                    struct Gone: Decodable { let deleteRegisteredDocument: Bool? }
                    _ = await app.load(Mutations.deleteRegisteredDocument,
                                       variables: ["id": existing.id], as: Gone.self)
                }
                // The proposal became a record; its queue entry goes with it.
                app.completeReview()
                dismiss()
            } catch {
                problem = String(describing: error)
            }
        }
    }
}
