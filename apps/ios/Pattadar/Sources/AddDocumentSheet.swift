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
