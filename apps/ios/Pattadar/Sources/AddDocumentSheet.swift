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
                if filing { Section { HStack { ProgressView(); Text("Filing…") } } }
                if !problem.isEmpty { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
            }
            .navigationTitle("Add document")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(closeLabel) { app.clearReadIfSettled(); dismiss() } } }
        }
    }

    private func file(_ r: ScanResult) {
        Task {
            filing = true
            defer { filing = false }
            do {
                // Unlinked on purpose: it can be attached to a holding later.
                try await app.fileDocument(r, linkTo: .none)
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

    var body: some View {
        NavigationStack {
            Form {
                if let scan {
                    let type = (scan.fields["doc_type"] as? String ?? "")
                    let family = documentFamily(type)
                    Section {
                        VStack(alignment: .leading, spacing: 10) {
                            Text((type.isEmpty ? "Document" : type).uppercased())
                                .font(.system(size: 10.5, weight: .semibold)).kerning(0.8)
                                .padding(.horizontal, 9).padding(.vertical, 4)
                                .background(familyTintColor(family).opacity(0.16), in: Capsule())
                                .foregroundStyle(familyTintColor(family))
                            Text(headline(scan))
                                .font(.system(size: 22, weight: .semibold, design: .serif))
                            let summary = maskSensitiveText(scan.fields["summary"] as? String ?? "")
                            if !summary.isEmpty {
                                Text(summary.components(separatedBy: "\n\n").first ?? summary)
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    } footer: {
                        Text("An identity card, certificate or receipt is a paper, not a holding — it goes into the vault and can be attached to land or a person any time.")
                    }
                    Section {
                        Button { file(scan) } label: {
                            HStack {
                                if filing { ProgressView().padding(.trailing, 6) }
                                Label(filing ? "Filing…" : "File into the vault",
                                      systemImage: "lock.doc.fill")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .disabled(filing)
                    }
                    if !problem.isEmpty {
                        Section { Text(problem).foregroundStyle(.red).font(.callout) }
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
        }
    }

    private func headline(_ r: ScanResult) -> String {
        let h = maskSensitiveText(r.fields["headline"] as? String ?? "")
        if !h.isEmpty { return h }
        let type = (r.fields["doc_type"] as? String ?? "")
        return type.isEmpty ? "What was read" : type
    }

    private func file(_ r: ScanResult) {
        Task {
            filing = true
            defer { filing = false }
            do {
                try await app.fileDocument(r, linkTo: .none)
                // The proposal became a record; its queue entry goes with it.
                app.completeReview()
                dismiss()
            } catch {
                problem = String(describing: error)
            }
        }
    }
}
