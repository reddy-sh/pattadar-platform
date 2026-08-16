import PattadarKit
import SwiftUI

/// One passbook, and the land filed under it.
///
/// A passbook was a dead row: it showed a total and could not be opened, so the
/// parcels it holds — the reason it exists — were only reachable by filtering
/// the Land tab by village and hoping.
struct PassbookDetailScreen: View {
    @Environment(AppModel.self) private var app
    let passbook: PassbookDetail
    let onChanged: () -> Void

    @State private var parcels: [Parcel] = []
    @State private var editing = false
    @State private var confirmDelete = false
    @State private var dossier: PropertyDossier?
    @State private var documents: [RegisteredDocument] = []
    @State private var showAddParcel = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section("Passbook") {
                LabeledContent("Pattadar no.", value: passbook.pattadarNo)
                LabeledContent("Owner", value: passbook.ownerName.isEmpty ? "—" : passbook.ownerName)
                if !passbook.fatherHusbandName.isEmpty {
                    LabeledContent("Father / husband", value: passbook.fatherHusbandName)
                }
                LabeledContent("Where", value: [passbook.village, passbook.mandal, passbook.district]
                    .filter { !$0.isEmpty }.joined(separator: " · "))
                LabeledContent("Total") {
                    Text(String(format: "%.2f ac", passbook.totalExtent)).monospacedDigit()
                }
            }

            Section {
                if parcels.isEmpty {
                    // A passbook exists to hold parcels; one with none is
                    // half-entered, not finished. Say what is missing and
                    // offer the way to fix it in the same breath.
                    VStack(alignment: .leading, spacing: Space.sm) {
                        Text("No parcels filed under this passbook yet.")
                            .foregroundStyle(.secondary)
                        Text("A passbook usually lists several survey numbers. Add them so the extent and the map mean something.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    ForEach(parcels) { p in
                        NavigationLink {
                            HoldingDetailScreen(parcel: p, passbook: nil)
                        } label: {
                            // The same row the Properties list uses, so a
                            // parcel looks identical wherever it appears.
                            HoldingRow(holding: .parcel(p, nil), showPassbook: false)
                        }
                    }
                }
            }

            LinkedDocumentsSection(documents: documents)

            NotesSection(entityType: "passbook", entityId: passbook.id,
                         notes: dossier?.notes ?? []) { Task { await loadDossier() } }

            RecordHistorySection(events: dossier?.auditEvents ?? [])

            Section {
                Button { editing = true } label: { Label("Edit passbook", systemImage: "pencil.line") }
                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete passbook", systemImage: "trash.fill")
                }
            }
        }
        .navigationTitle(passbook.pattadarNo.isEmpty ? "Passbook" : passbook.pattadarNo)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .primaryAction) { StarButton(type: "passbook", id: passbook.id) } }
        .sheet(isPresented: $editing) { EditPassbookScreen(passbook: passbook) { onChanged() } }
        .sheet(isPresented: $showAddParcel) {
            // Pre-bound to THIS passbook, so adding land from here never asks
            // which passbook it belongs to.
            AddParcelScreen(passbooks: [passbook], fixedPassbookID: passbook.id)
                .onDisappear { Task { await load(); onChanged() } }
        }
        .confirmationDialog("Delete this passbook?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await remove() } }
            Button("Keep it", role: .cancel) { }
        } message: {
            Text("\(passbook.pattadarNo) and its \(parcels.count) parcel\(parcels.count == 1 ? "" : "s") will be removed. This cannot be undone.")
        }
        .task { await load() }
    }

    private func load() async {
        guard let h = await app.load(Queries.holdings, as: HoldingsResponse.self) else { return }
        parcels = h.parcels.filter { $0.passbookId == passbook.id }
        await loadDossier()
    }

    private func loadDossier() async {
        dossier = await app.load(Queries.propertyDossier,
                                 variables: ["target": passbook.id], as: PropertyDossier.self)
        if let docs = await app.load(Queries.documents, as: DocumentsResponse.self) {
            documents = docs.registeredDocuments.filter { $0.passbookId == passbook.id }
        }
    }

    private func remove() async {
        struct Ack: Decodable { let deletePassbook: Bool }
        _ = await app.load(Mutations.deletePassbook, variables: ["id": passbook.id], as: Ack.self)
        onChanged()
        dismiss()
    }
}

/// One member of a group.
///
/// Members were a list you could only swipe, so a person's share, relation and
/// verification state had nowhere to be read — and a share is the thing a
/// succession argument turns on.
struct MemberDetailScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let member: Member
    let onChanged: () -> Void

    @State private var confirmRemove = false
    @State private var dossier: PropertyDossier?

    var body: some View {
        List {
            Section {
                HStack(spacing: Space.md) {
                    Avatar(name: member.name, size: 52, isSelf: member.isSelf)
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text(member.name).font(.title3.weight(.semibold))
                        if !member.relation.isEmpty {
                            Text(humanize(member.relation))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.vertical, Space.xs)
                if !member.relation.isEmpty {
                    LabeledContent("Relation", value: humanize(member.relation))
                }
                if !member.phone.isEmpty { LabeledContent("Phone", value: member.phone) }
                if !member.dob.isEmpty { LabeledContent("Date of birth", value: member.dob) }
                LabeledContent("Role", value: member.isSelf ? "You" : humanize(member.role))
            }

            Section("Inheritance") {
                if member.isBeneficiary {
                    LabeledContent("Share") {
                        Text(String(format: "%.0f%%", member.sharePct)).monospacedDigit()
                    }
                    LabeledContent("Status", value: humanize(member.status))
                    if member.phone.isEmpty {
                        // An heir who cannot be reached cannot confirm they
                        // accept, which is the whole point of recording them.
                        Label("No phone number — they cannot be asked to confirm",
                              systemImage: "exclamationmark.triangle")
                            .font(.caption).foregroundStyle(Palette.caution)
                    }
                } else {
                    Text("Not recorded as an heir.").foregroundStyle(.secondary)
                }
            }

            NotesSection(entityType: "member", entityId: member.id,
                         notes: dossier?.notes ?? []) { Task { await loadDossier() } }

            RecordHistorySection(events: dossier?.auditEvents ?? [])

            if !member.isSelf {
                Section {
                    Button(role: .destructive) { confirmRemove = true } label: {
                        Label("Remove from this group", systemImage: "person.badge.minus")
                    }
                }
            }
        }
        .navigationTitle(member.name)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Remove this person?", isPresented: $confirmRemove, titleVisibility: .visible) {
            Button("Remove", role: .destructive) { Task { await remove() } }
            Button("Keep them", role: .cancel) { }
        } message: {
            Text(member.isBeneficiary
                 ? "\(member.name) and their \(Int(member.sharePct))% share are removed from this group."
                 : "\(member.name) is removed from this group.")
        }
        .task { await loadDossier() }
    }

    private func loadDossier() async {
        dossier = await app.load(Queries.propertyDossier,
                                 variables: ["target": member.id], as: PropertyDossier.self)
    }

    private func remove() async {
        struct Ack: Decodable { let removeMember: Bool }
        _ = await app.load(Mutations.removeMember, variables: ["id": member.id], as: Ack.self)
        onChanged()
        dismiss()
    }
}
