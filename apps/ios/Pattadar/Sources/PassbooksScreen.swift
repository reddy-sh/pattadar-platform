import PattadarKit
import SwiftUI

struct PassbooksScreen: View {
    @Environment(AppModel.self) private var app
    @State private var passbooks: [PassbookDetail] = []
    @State private var loaded = false
    @State private var showAdd = false
    @State private var editing: PassbookDetail?
    @State private var confirming: PassbookDetail?

    var body: some View {
        NavigationStack {
            List {
                ForEach(passbooks) { pb in
                    NavigationLink {
                        PassbookDetailScreen(passbook: pb) { Task { await load() } }
                    } label: {
                        passbookRow(pb)
                    }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) { confirming = pb } label: {
                                Label("Delete", systemImage: "trash.fill")
                            }
                            Button { editing = pb } label: { Label("Edit", systemImage: "pencil.line") }
                                .tint(Palette.accent)
                        }
                }
                if loaded && passbooks.isEmpty {
                    ContentUnavailableView("No passbooks yet", systemImage: "book.closed",
                                           description: Text("Scan a pattadar passbook to add one."))
                }
            }
            .navigationTitle("Passbooks")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Label("Add", systemImage: "plus") }
                }
            }
            .sheet(isPresented: $showAdd) { AddPassbookScreen().onDisappear { Task { await load() } } }
            .sheet(item: $editing) { k in EditPassbookScreen(passbook: k) { Task { await load() } } }
            // Deleting a passbook takes its parcels. That is the whole holding, so
            // the count is stated before the tap, not discovered after it.
            .confirmationDialog("Delete this passbook?", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let k = confirming { Task { await delete(k) } }
                }
                Button("Keep it", role: .cancel) { confirming = nil }
            } message: {
                Text(confirming.map { "\($0.pattadarNo) and every parcel filed under it will be removed. This cannot be undone." } ?? "")
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func delete(_ k: PassbookDetail) async {
        struct Ack: Decodable { let deletePassbook: Bool? }
        _ = await app.load(Mutations.deletePassbook, variables: ["id": k.id], as: Ack.self)
        confirming = nil
        await load()
    }

    @ViewBuilder
    private func passbookRow(_ pb: PassbookDetail) -> some View {
                    VStack(alignment: .leading, spacing: Space.xs) {
                        HStack {
                            Text(pb.pattadarNo.isEmpty ? "Passbook" : pb.pattadarNo).fontWeight(.semibold)
                            Spacer(minLength: 12)
                            Text(String(format: "%.2f ac", pb.totalExtent))
                                .monospacedDigit().layoutPriority(1)
                        }
                        Text(pb.ownerName).font(.subheadline)
                        Text([pb.village, pb.mandal, pb.district].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary)
                    }
    }

    private func load() async {
        if let r = await app.load(Queries.passbooks, as: PassbooksResponse.self) { passbooks = r.passbooks }
        loaded = true
    }
}
