import PattadarKit
import SwiftUI

/// More (M24) — everything the four tabs don't carry.
///
/// This tab was "You": a profile head with shortcuts hanging off it. The
/// M-series comps make it a hub instead — the places (Maps, Groups, Services),
/// the money (Wallet, Tools, Audit log), and the person (Account) — because a
/// junk drawer with a face on it was neither a good drawer nor a good mirror.
/// The personal matter now lives one push away on `AccountScreen`.
struct MoreScreen: View {
    @Environment(AppModel.self) private var app
    @State private var stats: DashboardStats?
    @State private var holdings: HoldingsResponse?
    @State private var groups: [FamilyGroup] = []
    @State private var showFamily = false
    /// A tab swapped out of the bar (M25) is still a place; it answers from
    /// here instead, presented whole — the screens own their own stacks.
    @AppStorage(BarTab.storageKey) private var barRaw = BarTab.defaultRaw
    @State private var displacedShowing: BarTab?

    private var displaced: [BarTab] {
        [BarTab.home, .properties].filter { !BarTab.parse(barRaw).contains($0) }
    }

    var body: some View {
        NavigationStack {
            List {
                if !displaced.isEmpty {
                    Section {
                        ForEach(displaced) { tab in
                            Button { displacedShowing = tab } label: {
                                HStack {
                                    Label(tab.label, systemImage: tab.symbol)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption).foregroundStyle(.tertiary)
                                }
                            }
                        }
                    } footer: {
                        Text("Swapped out of the tab bar — still one tap away.")
                    }
                }

                Section {
                    NavigationLink { MapsScreen(holdings: allHoldings) } label: {
                        HStack {
                            Label("Maps", systemImage: "map")
                            Spacer()
                            if !allHoldings.isEmpty {
                                Text("\(allHoldings.count) parcels")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    // Family lives behind Groups: these are the people in your
                    // records. Presented as a sheet — FamilyScreen owns its own
                    // NavigationStack, and pushing one stack inside another
                    // gave two bars and a back button to the wrong place.
                    Button { showFamily = true } label: {
                        HStack {
                            Label("Groups", systemImage: "person.2")
                            Spacer()
                            Text(groupsValue)
                                .font(.caption).foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                    NavigationLink { ServicesScreen() } label: {
                        Label("Services", systemImage: "storefront")
                    }
                    Link(destination: URL(string: "https://pattadar.com/app")!) {
                        HStack {
                            Label("Invitations", systemImage: "envelope")
                            Spacer()
                            if let pending = stats?.pendingInvitations, pending > 0 {
                                Text("\(pending)")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Palette.accentInk)
                                    .padding(.horizontal, Space.sm)
                                    .padding(.vertical, Space.hair)
                                    .background(Capsule().fill(Palette.accent))
                            }
                            Image(systemName: "arrow.up.forward.square")
                                .font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                }

                Section {
                    NavigationLink { WalletScreen() } label: {
                        HStack {
                            Label("Wallet", systemImage: "wallet.pass")
                            Spacer()
                            Text(rupees(Double(SampleData.walletBalance)))
                                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                    NavigationLink { ToolsScreen(holdings: holdings) } label: {
                        Label("Tools", systemImage: "wrench.and.screwdriver")
                    }
                    NavigationLink { ActivityScreen() } label: {
                        Label("Audit log", systemImage: "clock.arrow.circlepath")
                    }
                }

                // The single most consequential gap in the records, kept in
                // sight until the Family screen (M11) takes the warning over.
                if stats != nil, (stats?.totalBeneficiaries ?? 0) == 0 {
                    Section("Succession") {
                        Label("No heirs recorded. If nothing is set, your land has no stated succession.",
                              systemImage: "exclamationmark.triangle.fill")
                            .font(.callout).foregroundStyle(Palette.danger)
                    }
                }

                Section {
                    NavigationLink { CustomiseTabsScreen() } label: {
                        HStack {
                            Label("Customise tabs", systemImage: "slider.horizontal.3")
                            Spacer()
                            Text("\(BarTab.parse(barRaw).first?.label ?? "Home") first")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    NavigationLink { AccountScreen() } label: {
                        Label("Account", systemImage: "person.crop.circle")
                    }
                }
            }
            .navigationTitle("More")
            .sheet(isPresented: $showFamily) { FamilyScreen() }
            .sheet(item: $displacedShowing) { tab in
                switch tab {
                case .home: HomeScreen()
                case .properties: HoldingsScreen()
                default: EmptyView()
                }
            }
            .onAppear {
                if app.openFamily { app.openFamily = false; showFamily = true }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private var groupsValue: String {
        if let first = groups.first, groups.count == 1 { return first.name }
        return groups.isEmpty ? "" : "\(groups.count) groups"
    }

    private var allHoldings: [Holding] {
        guard let h = holdings else { return [] }
        let parcels = h.parcels.map { p in
            Holding.parcel(p, h.passbooks.first { $0.id == p.passbookId })
        }
        return parcels + h.properties.map { Holding.property($0) }
    }

    private func load() async {
        if let d = await app.load(Queries.dashboard, as: DashboardResponse.self) {
            stats = d.dashboardStats
        }
        holdings = await app.load(Queries.holdings, as: HoldingsResponse.self)
        if let g = await app.load(Queries.groups, as: GroupsResponse.self) { groups = g.groups }
    }
}

/// Everything you own, on one map — the M24 "Maps" row's destination, and no
/// more than that: the map itself is the shared `PropertiesMap`.
struct MapsScreen: View {
    let holdings: [Holding]

    var body: some View {
        PropertiesMap(holdings: holdings)
            .navigationTitle("Maps")
            .navigationBarTitleDisplayMode(.inline)
    }
}

/// The reference tools — the screens that answer questions rather than hold
/// records. Registry records (M21) joins this list when it lands.
struct ToolsScreen: View {
    let holdings: HoldingsResponse?

    var body: some View {
        List {
            NavigationLink { SpendScreen() } label: {
                Label("Spend", systemImage: "indianrupeesign.circle")
            }
            NavigationLink { HoldersScreen(holdings: holdings) } label: {
                Label("Who holds what", systemImage: "person.text.rectangle")
            }
        }
        .navigationTitle("Tools")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Wallet (M24) — the float that pays for services. Seeded from `SampleData`
/// until payments exist server-side.
struct WalletScreen: View {
    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text("Balance")
                        .font(.label).foregroundStyle(.secondary)
                        .textCase(.uppercase)
                    Text(rupees(Double(SampleData.walletBalance)))
                        .font(.figure)
                }
                .padding(.vertical, Space.xs)
            } footer: {
                Text("Pays for services — an EC, a survey, a caretaker's month. Top up by UPI when ordering; refunds land back here.")
            }

            Section("Recent") {
                ForEach(SampleData.walletEntries) { entry in
                    HStack {
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text(entry.title)
                            Text(entry.detail)
                                .font(.note).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text((entry.amount > 0 ? "+" : "−") + rupees(Double(abs(entry.amount))))
                            .font(.callout.monospacedDigit())
                            .foregroundStyle(entry.amount > 0 ? Palette.success : Palette.ink)
                    }
                }
            }
        }
        .navigationTitle("Wallet")
        .navigationBarTitleDisplayMode(.inline)
    }
}
