import PattadarKit
import SwiftUI

struct FamilyScreen: View {
    @Environment(AppModel.self) private var app
    @State private var groups: [FamilyGroup] = []
    @State private var loaded = false
    @State private var showAdd = false
    @State private var editing: FamilyGroup?
    @State private var confirming: FamilyGroup?

    var body: some View {
        NavigationStack {
            List {
                ForEach(groups) { g in
                    NavigationLink { GroupDetailScreen(group: g) } label: {
                        VStack(alignment: .leading, spacing: Space.xs) {
                            Text(g.name).fontWeight(.semibold)
                            Text("\(g.memberCount) member\(g.memberCount == 1 ? "" : "s") · \(g.landCount) holding\(g.landCount == 1 ? "" : "s")")
                                .font(.caption).foregroundStyle(.secondary)
                            // Succession is the single most consequential thing
                            // here, so it is stated, not left to be inferred.
                            if g.landCount > 0 && g.totalShare == 0 {
                                Label("No heirs recorded", systemImage: "exclamationmark.triangle")
                                    .font(.caption).foregroundStyle(Palette.caution)
                            }
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { confirming = g } label: {
                            Label("Delete", systemImage: "trash.fill")
                        }
                        Button { editing = g } label: { Label("Edit", systemImage: "pencil.line") }
                            .tint(Palette.accent)
                    }
                }
                if loaded && groups.isEmpty {
                    ContentUnavailableView("No groups yet", systemImage: "person.2",
                                           description: Text("A group holds land and records who inherits it."))
                }
            }
            .navigationTitle("Family")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Label("Add", systemImage: "plus") }
                }
            }
            .sheet(isPresented: $showAdd) { EditGroupScreen(group: nil) { Task { await load() } } }
            .sheet(item: $editing) { g in EditGroupScreen(group: g) { Task { await load() } } }
            .confirmationDialog("Delete this group?", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let g = confirming { Task { await delete(g) } }
                }
                Button("Keep it", role: .cancel) { confirming = nil }
            } message: {
                // Land is not deleted with the group, and saying so prevents
                // the fear that stops people tidying up.
                Text(confirming.map {
                    "\($0.name) and its \($0.memberCount) member\($0.memberCount == 1 ? "" : "s") will be removed. Land stays; it simply stops being held by a group."
                } ?? "")
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        if let r = await app.load(Queries.groups, as: GroupsResponse.self) { groups = r.groups }
        loaded = true
    }

    private func delete(_ g: FamilyGroup) async {
        struct Ack: Decodable { let deleteGroup: Bool? }
        _ = await app.load(Mutations.deleteGroup, variables: ["id": g.id], as: Ack.self)
        confirming = nil
        await load()
    }
}

struct GroupDetailScreen: View {
    @Environment(AppModel.self) private var app
    let group: FamilyGroup
    @State private var members: [Member] = []
    @State private var showAdd = false
    @State private var confirming: Member?
    @State private var editing = false
    @State private var confirmDeleteGroup = false
    @State private var dossier: PropertyDossier?
    @Environment(\.dismiss) private var dismissGroup

    var body: some View {
        List {
            Section("Group") {
                Fact(label: "Type", value: humanize(group.type))
                Fact(label: "Note", value: group.description)
                Fact(label: "Land", value: String(format: "%.2f ac", group.totalExtent), mono: true)
                Fact(label: "Holdings", value: "\(group.landCount)")
                Fact(label: "Members", value: "\(group.memberCount)")
                LabeledContent("Allocated") {
                    // Over or under 100% is the thing that voids a succession,
                    // so it is coloured, not merely printed.
                    Text(String(format: "%.0f%%", group.totalShare))
                        .monospacedDigit()
                        .foregroundStyle(shareTone)
                }
            }
            if group.landCount > 0 && group.totalShare != 100 {
                Section {
                    Label(group.totalShare == 0
                          ? "This group holds land but no heirs are recorded. If nothing is set, the land has no stated succession."
                          : String(format: "Shares total %.0f%%, not 100%%. An allocation that does not add up can be disputed.", group.totalShare),
                          systemImage: "exclamationmark.triangle.fill")
                        .font(.callout)
                        .foregroundStyle(group.totalShare == 0 ? Palette.danger : Palette.caution)
                }
            }
            Section("Members") {
                ForEach(members) { m in
                    NavigationLink {
                        MemberDetailScreen(member: m) { Task { await reload() } }
                    } label: {
                    HStack {
                        Avatar(name: m.name, size: 34, isSelf: m.isSelf)
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text(m.name + (m.isSelf ? " (you)" : "")).fontWeight(.medium)
                            Text([m.relation, m.status].filter { !$0.isEmpty }.map(humanize).joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if m.isBeneficiary {
                            Text(String(format: "%.0f%%", m.sharePct)).monospacedDigit()
                        }
                    }
                    }
                    .swipeActions(edge: .trailing) {
                        // You cannot remove yourself from your own group.
                        if !m.isSelf {
                            Button(role: .destructive) { confirming = m } label: {
                                Label("Remove", systemImage: "person.badge.minus")
                            }
                        }
                    }
                }
                Button { showAdd = true } label: {
                    Label("Add member", systemImage: "person.badge.plus")
                }
            }

            NotesSection(entityType: "group", entityId: group.id,
                         notes: dossier?.notes ?? []) { Task { await loadDossier() } }

            RecordHistorySection(events: dossier?.auditEvents ?? [])

            Section {
                Button { editing = true } label: { Label("Edit group", systemImage: "pencil.line") }
                Button(role: .destructive) { confirmDeleteGroup = true } label: {
                    Label("Delete group", systemImage: "trash.fill")
                }
            }
        }
        .navigationTitle(group.name)
        .sheet(isPresented: $editing) { EditGroupScreen(group: group) { } }
        .confirmationDialog("Delete this group?", isPresented: $confirmDeleteGroup,
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await removeGroup() } }
            Button("Keep it", role: .cancel) { }
        } message: {
            Text("\(group.name) and its \(members.count) member\(members.count == 1 ? "" : "s") will be removed. Land stays; it simply stops being held by a group.")
        }
        .sheet(isPresented: $showAdd) {
            AddMemberScreen(groupID: group.id) { Task { await reload() } }
        }
        .confirmationDialog("Remove this person?", isPresented: Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } }),
                            titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let m = confirming { Task { await remove(m) } }
            }
            Button("Keep them", role: .cancel) { confirming = nil }
        } message: {
            Text(confirming.map {
                $0.isBeneficiary
                    ? "\($0.name) and their \(Int($0.sharePct))% share are removed from this group."
                    : "\($0.name) is removed from this group."
            } ?? "")
        }
        .task { await reload(); await loadDossier() }
    }

    private var shareTone: Color {
        if group.totalShare == 100 { return Palette.success }
        if group.totalShare == 0 { return .secondary }
        return Palette.caution
    }

    private func loadDossier() async {
        dossier = await app.load(Queries.propertyDossier,
                                 variables: ["target": group.id], as: PropertyDossier.self)
    }

    private func removeGroup() async {
        struct Ack: Decodable { let deleteGroup: Bool }
        _ = await app.load(Mutations.deleteGroup, variables: ["id": group.id], as: Ack.self)
        dismissGroup()
    }

    private func reload() async {
        if let r = await app.load(Queries.members, variables: ["gid": group.id], as: MembersResponse.self) {
            members = r.members
        }
    }

    private func remove(_ m: Member) async {
        struct Ack: Decodable { let removeMember: Bool? }
        _ = await app.load(Mutations.removeMember, variables: ["id": m.id], as: Ack.self)
        confirming = nil
        await reload()
    }
}
