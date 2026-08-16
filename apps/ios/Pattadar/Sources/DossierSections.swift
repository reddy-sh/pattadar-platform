import MapKit
import PattadarKit
import SwiftUI

/// The chain of title: who holds it now, and who held it before.
///
/// A single "current owner" string answers the wrong question. What a buyer,
/// an heir or a court asks is how it came to be theirs — and that is a chain,
/// each link with a mutation type and a date.
struct OwnerHistorySection: View {
    let owners: [ParcelOwner]

    var body: some View {
        if !owners.isEmpty {
            Section("Ownership") {
                ForEach(sorted) { o in
                    VStack(alignment: .leading, spacing: Space.xs) {
                        HStack {
                            Text(o.ownerName.isEmpty ? "Unnamed" : o.ownerName)
                                .fontWeight(o.isCurrent ? .semibold : .regular)
                            if o.isCurrent {
                                Text("current")
                                    .font(.caption2).padding(.horizontal, Space.sm).padding(.vertical, Space.hair)
                                    .background(Capsule().fill(Palette.success.opacity(0.20)))
                            }
                            Spacer()
                            if o.extent > 0 {
                                Text(String(format: "%.2f ac", o.extent))
                                    .font(.caption).monospacedDigit().foregroundStyle(.secondary)
                            }
                        }
                        let line = [humanize(o.mutationType), humanize(o.acquisitionSource), o.mutationDate]
                            .filter { !$0.isEmpty }.joined(separator: " · ")
                        if !line.isEmpty {
                            Text(line).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    /// Current holder first, then most recent change downward — the order the
    /// question is actually asked in.
    private var sorted: [ParcelOwner] {
        owners.sorted {
            if $0.isCurrent != $1.isCurrent { return $0.isCurrent }
            return $0.mutationDate > $1.mutationDate
        }
    }
}

/// Free-text notes, and a way to add one.
struct NotesSection: View {
    @Environment(AppModel.self) private var app
    let entityType: String
    let entityId: String
    let notes: [Note]
    let onChanged: () -> Void

    @State private var draft = ""
    @State private var saving = false

    var body: some View {
        Section("Notes") {
            ForEach(notes) { n in
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text(n.body).font(.callout)
                    Text(relativeTime(n.createdAt)).font(.caption2).foregroundStyle(.secondary)
                }
            }
            HStack {
                TextField("Add a note", text: $draft, axis: .vertical)
                Button {
                    Task { await add() }
                } label: {
                    if saving { ProgressView() } else { Image(systemName: "arrow.up.circle.fill") }
                }
                .accessibilityLabel(saving ? "Saving the note" : "Add this note")
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || saving)
            }
        }
    }

    private func add() async {
        saving = true
        defer { saving = false }
        struct Ack: Decodable { let addNote: IDPayload? }
        _ = await app.load(Mutations.addNote,
                           variables: ["entityType": entityType, "entityId": entityId, "body": draft],
                           as: Ack.self)
        draft = ""
        onChanged()
    }
}

/// This record's own slice of the audit trail — append-only, so it is the one
/// place that can say what happened after the fact.
struct RecordHistorySection: View {
    let events: [AuditEvent]

    var body: some View {
        Section("History") {
            if events.isEmpty {
                Text("Nothing recorded against this yet.").foregroundStyle(.secondary)
            } else {
                ForEach(events) { ActivityRow(event: $0) }
            }
        }
    }
}

/// Documents filed against this holding, leading with what they say.
struct LinkedDocumentsSection: View {
    let documents: [RegisteredDocument]
    /// Attaching belongs in the documents section, not in a section of its
    /// own below it — the button sits with the list it adds to.
    var onAttach: (() -> Void)? = nil

    var body: some View {
        Section {
            if documents.isEmpty {
                Text("No documents attached yet.").foregroundStyle(.secondary)
            } else {
                ForEach(documents) { d in
                    NavigationLink { DocumentDetailScreen(doc: d) } label: {
                        VStack(alignment: .leading, spacing: Space.xs) {
                            Text(d.docType.isEmpty ? "Document" : d.docType)
                                .fontWeight(.medium)
                            Text(d.headline.isEmpty
                                 ? [d.village, d.surveyNo].filter { !$0.isEmpty }.joined(separator: " · ")
                                 : d.headline)
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                }
            }
            if let onAttach {
                Button(action: onAttach) {
                    Label("Attach a document", systemImage: "paperclip")
                }
            }
        } header: {
            Text("Documents")
        } footer: {
            if onAttach != nil {
                Text("Checked against this holding before anything is changed.")
            }
        }
    }
}
