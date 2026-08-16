import PattadarKit
import SwiftUI

/// Which screens ride the tab bar (M25).
///
/// Three reorderable slots around the fixed centre File button, then More,
/// always last. The FIRST slot is what opens at launch. Papers may move but
/// never leaves the bar — it is where every shared document lands, and a
/// door people are sent through must not be movable out of the house.
enum BarTab: String, CaseIterable, Identifiable {
    case home, properties, papers, maps, groups, services

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: "Home"
        case .properties: "Properties"
        case .papers: "Papers"
        case .maps: "Maps"
        case .groups: "Groups"
        case .services: "Services"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .properties: "building.2.fill"
        case .papers: "doc.text.fill"
        case .maps: "map.fill"
        case .groups: "person.2.fill"
        case .services: "storefront.fill"
        }
    }

    /// The selection tag. `.papers` keeps the historical `.documents` case —
    /// WidgetLink URLs and installed widgets speak that vocabulary.
    var tab: AppModel.Tab {
        switch self {
        case .home: .home
        case .properties: .properties
        case .papers: .documents
        case .maps: .maps
        case .groups: .groups
        case .services: .services
        }
    }

    // MARK: - The persisted order

    static let storageKey = "pattadar.tabs.bar"
    static let defaultRaw = "home,properties,papers"

    /// Parse, and refuse to be broken: exactly three, unique, Papers present.
    /// A malformed value (an old build, a hand-edited plist) falls back to the
    /// default rather than to a bar with no door to the vault.
    static func parse(_ raw: String) -> [BarTab] {
        let slots = raw.split(separator: ",").compactMap { BarTab(rawValue: String($0)) }
        guard slots.count == 3,
              Set(slots).count == 3,
              slots.contains(.papers) else {
            return [.home, .properties, .papers]
        }
        return slots
    }

    static func encode(_ slots: [BarTab]) -> String {
        slots.map(\.rawValue).joined(separator: ",")
    }
}

/// Customise tabs (M25) — drag to reorder; swap a pool screen in.
struct CustomiseTabsScreen: View {
    @AppStorage(BarTab.storageKey) private var barRaw = BarTab.defaultRaw

    private var slots: [BarTab] { BarTab.parse(barRaw) }
    private var pool: [BarTab] { BarTab.allCases.filter { !slots.contains($0) } }

    var body: some View {
        List {
            Section {
                Text("Three tabs plus More. Drag to reorder — the first one is what opens when you launch the app.")
                    .font(.bodyCopy).foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }

            Section("In the tab bar") {
                ForEach(slots) { slot in
                    HStack {
                        Label(slot.label, systemImage: slot.symbol)
                        Spacer()
                        if slot == slots.first {
                            Text("opens at launch")
                                .font(.note).foregroundStyle(.secondary)
                        }
                    }
                }
                .onMove { from, to in
                    var next = slots
                    next.move(fromOffsets: from, toOffset: to)
                    barRaw = BarTab.encode(next)
                }
                HStack {
                    Label("More", systemImage: "ellipsis")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text("always last")
                        .font(.note).foregroundStyle(.secondary)
                    Image(systemName: "lock")
                        .font(.caption).foregroundStyle(.tertiary)
                }
            }

            Section {
                ForEach(pool) { candidate in
                    HStack {
                        Label(candidate.label, systemImage: candidate.symbol)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Swap in") { swapIn(candidate) }
                            .font(.callout.weight(.semibold))
                    }
                }
            } header: {
                Text("Under More")
            } footer: {
                Text("Swapping one in pushes the last tab down into More. Papers cannot be removed — it is where every shared document lands.")
            }
        }
        // Grabbers always showing: this screen IS the edit mode; a hidden
        // second mode behind an Edit button would be a door behind a door.
        .environment(\.editMode, .constant(.active))
        .navigationTitle("Customise tabs")
        .navigationBarTitleDisplayMode(.inline)
    }

    /// The comp's rule, verbatim: the incoming screen takes the LAST slot and
    /// the displaced one drops into More — except Papers, which cannot be
    /// displaced, so the last non-Papers slot gives way instead.
    private func swapIn(_ candidate: BarTab) {
        var next = slots
        let out = next[2] == .papers ? 1 : 2
        next[out] = candidate
        withAnimation(Motion.standard()) {
            barRaw = BarTab.encode(next)
        }
    }
}

// MARK: - Tab roots for the pool screens

/// Maps as a tab: loads its own holdings — a tab root answers to nobody.
struct MapsTabScreen: View {
    @Environment(AppModel.self) private var app
    @State private var holdings: HoldingsResponse?

    var body: some View {
        NavigationStack {
            MapsScreen(holdings: allHoldings)
                .task { holdings = await app.load(Queries.holdings, as: HoldingsResponse.self) }
        }
    }

    private var allHoldings: [Holding] {
        guard let h = holdings else { return [] }
        let parcels = h.parcels.map { p in
            Holding.parcel(p, h.passbooks.first { $0.id == p.passbookId })
        }
        return parcels + h.properties.map { Holding.property($0) }
    }
}

/// Groups as a tab: the family groups, pushable to their detail — the same
/// destinations the More row reaches through the FamilyScreen sheet.
struct GroupsTabScreen: View {
    @Environment(AppModel.self) private var app
    @State private var groups: [FamilyGroup] = []
    @State private var showFamily = false

    var body: some View {
        NavigationStack {
            List {
                ForEach(groups) { g in
                    NavigationLink { GroupDetailScreen(group: g) } label: {
                        HStack {
                            Text(g.name)
                            Spacer()
                            Text("\(g.memberCount) member\(g.memberCount == 1 ? "" : "s")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Section {
                    Button { showFamily = true } label: {
                        Label("Manage family and heirs", systemImage: "person.2")
                    }
                }
            }
            .navigationTitle("Groups")
            .sheet(isPresented: $showFamily) {
                FamilyScreen().onDisappear { Task { await load() } }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func load() async {
        if let g = await app.load(Queries.groups, as: GroupsResponse.self) { groups = g.groups }
    }
}

/// Services as a tab.
struct ServicesTabScreen: View {
    var body: some View {
        NavigationStack { ServicesScreen() }
    }
}
