import PattadarKit
import SwiftUI

/// One row in the Properties list, whether it is farmland or a plot.
///
/// Parcels and properties are different tables with different columns, but to
/// the person holding the phone they are all "things I own". Wrapping them
/// lets one list filter, group and sort across both — which is what makes the
/// separate Passbooks tab redundant rather than merely duplicated.
enum Holding: Identifiable {
    case parcel(Parcel, Passbook?)
    case property(Property)

    var id: String {
        switch self {
        case .parcel(let p, _): "parcel-\(p.id)"
        case .property(let p): "property-\(p.id)"
        }
    }

    var title: String {
        switch self {
        case .parcel(let p, _):
            "Sy \(p.surveyNo)" + (p.subdivision.isEmpty ? "" : "/\(p.subdivision)")
        case .property(let p):
            p.label.isEmpty ? humanize(p.type) : p.label
        }
    }

    /// Acres for everything, so a mixed list can be totalled and sorted.
    var acres: Double {
        switch self {
        case .parcel(let p, _): p.extent
        // A property's landArea is in ITS OWN unit, not acres — see
        // propertyAcres. Returning it raw inflated every subtotal.
        case .property(let p): propertyAcres(landArea: p.landArea, landUnit: p.landUnit)
        }
    }

    /// Shown in the unit it was filed in — acres for farmland, sq. yards for a
    /// plot. Converting a 200 sq.yd site to "0.04 ac" is technically right and
    /// useless.
    var extentText: String {
        switch self {
        case .parcel(let p, _):
            return String(format: "%.2f ac", p.extent)
        case .property(let p):
            return propertyAreaText(landArea: p.landArea, landUnit: p.landUnit)
        }
    }

    var village: String {
        switch self {
        case .parcel(_, let pb): pb?.village ?? ""
        case .property(let p): p.city
        }
    }

    var passbook: String {
        switch self {
        case .parcel(_, let pb): pb?.pattadarNo ?? ""
        // A plot has no passbook: it comes from a sale deed, not a passbook.
        case .property: ""
        }
    }

    var owner: String {
        switch self {
        case .parcel(let p, let pb): p.currentOwner.isEmpty ? (pb?.ownerName ?? "") : p.currentOwner
        case .property(let p): p.currentOwner
        }
    }

    var isAgricultural: Bool {
        switch self {
        case .parcel(let p, _): !p.classification.lowercased().contains("non")
        case .property: false
        }
    }

    var hasPin: Bool {
        switch self {
        case .parcel(let p, _): parseGeoPoint(p.geoPoint) != nil
        case .property(let p): parseGeoPoint(p.geoPoint) != nil
        }
    }

    var disputed: Bool {
        switch self {
        case .parcel(let p, _): p.litigation
        case .property(let p): p.litigation
        }
    }

    /// Where it is, when it has been pinned.
    var pin: LatLng? {
        switch self {
        case .parcel(let p, _): parseGeoPoint(p.geoPoint)
        case .property(let p): parseGeoPoint(p.geoPoint)
        }
    }

    /// Which family of holding this is — decides the unit it is quoted in.
    var kind: HoldingKind {
        switch self {
        case .parcel(let p, _):
            p.classification.lowercased().contains("non") ? .plot : .farmland
        case .property(let p):
            HoldingKind.of(propertyType: p.type)
        }
    }

    /// The entity type the favourites table stores.
    var entityType: String {
        switch self {
        case .parcel: "parcel"
        case .property: "property"
        }
    }

    /// The row id without the local `parcel-`/`property-` prefix.
    var entityId: String {
        switch self {
        case .parcel(let p, _): p.id
        case .property(let p): p.id
        }
    }

    var typeLabel: String {
        switch self {
        case .parcel(let p, _): humanize(p.classification)
        case .property(let p): humanize(p.type)
        }
    }
}

/// How the list is cut.
enum HoldingFilter: String, CaseIterable, Identifiable {
    case all = "All"
    /// A passbook is not a holding — it is how farmland is FILED — so
    /// selecting it shows the passbooks themselves rather than the land under
    /// them. It sits here because it replaced a tab.
    case passbooks = "Passbooks"
    case favourites = "Favourites"
    case agricultural = "Agricultural"
    case plots = "Plots"
    case needsAttention = "Needs attention"
    case disputed = "Disputed"
    var id: String { rawValue }

    /// True when this filter lists holdings at all. Passbooks list something
    /// else entirely.
    var listsHoldings: Bool { self != .passbooks }

    func matches(_ h: Holding) -> Bool {
        switch self {
        case .passbooks: false
        // Favourites is answered by the store, not by the holding — see
        // `visible`, which is the only place with access to it.
        case .favourites: true
        case .all: true
        case .agricultural: h.isAgricultural
        case .plots: !h.isAgricultural
        // The one filter that is a to-do list rather than a category.
        case .needsAttention: !h.hasPin || h.disputed
        case .disputed: h.disputed
        }
    }
}

enum HoldingGrouping: String, CaseIterable, Identifiable {
    case village = "Village"
    case passbook = "Passbook"
    case owner = "Owner"
    case type = "Type"
    case none = "No grouping"
    var id: String { rawValue }

    func key(for h: Holding) -> String {
        switch self {
        case .village: h.village.isEmpty ? "No village" : h.village
        case .passbook: h.passbook.isEmpty ? "No passbook (plots & buildings)" : h.passbook
        case .owner: h.owner.isEmpty ? "Owner not recorded" : h.owner
        case .type: h.typeLabel.isEmpty ? "Unclassified" : h.typeLabel
        case .none: ""
        }
    }
}

struct HoldingsScreen: View {
    @Environment(AppModel.self) private var app
    @State private var holdings: HoldingsResponse?
    @State private var passbooks: [PassbookDetail] = []
    @State private var search = ""
    @State private var filter: HoldingFilter = .all
    @State private var grouping: HoldingGrouping = .village
    @State private var showAdd = false
    @State private var editParcel: Parcel?
    @State private var editProperty: Property?
    @State private var confirmParcel: Parcel?
    @State private var confirmProperty: Property?
    @State private var editPassbook: PassbookDetail?
    @State private var confirmPassbook: PassbookDetail?
    @State private var showMap = false

    var body: some View {
        NavigationStack {
            Group {
            if showMap {
                PropertiesMap(holdings: visible)
            } else {
            List {
                if holdings != nil {
                    Section {
                        filterBar
                            .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                            .listRowBackground(Color.clear)
                    }
                    if filter == .passbooks {
                        Section {
                            ForEach(passbooks) { pb in
                                NavigationLink {
                                    PassbookDetailScreen(passbook: pb) { Task { await load() } }
                                } label: {
                                    PassbookRow(passbook: pb,
                                                parcelCount: parcelCount(for: pb))
                                }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) { confirmPassbook = pb } label: {
                                        Label("Delete", systemImage: "trash.fill")
                                    }
                                    Button { editPassbook = pb } label: {
                                        Label("Edit", systemImage: "pencil.line")
                                    }
                                    .tint(.blue)
                                }
                            }
                            if passbooks.isEmpty {
                                Text("No passbooks yet. Scanning one adds every parcel on it.")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                    ForEach(groups, id: \.0) { heading, items in
                        Section {
                            ForEach(items) { row($0) }
                        } header: {
                            if !heading.isEmpty {
                                HStack {
                                    // Grouped by passbook, the heading IS the
                                    // passbook — so it opens it. That is what
                                    // replaced the separate tab.
                                    if grouping == .passbook, let pb = passbook(named: heading) {
                                        NavigationLink {
                                            PassbookDetailScreen(passbook: pb) { Task { await load() } }
                                        } label: {
                                            HStack(spacing: 4) {
                                                Text(heading)
                                                Image(systemName: "chevron.right")
                                                    .font(.caption2)
                                            }
                                        }
                                    } else {
                                        Text(heading)
                                    }
                                    Spacer()
                                    // The subtotal is the reason to group at
                                    // all — "how much do I hold in
                                    // Katraguntla" — but it must be in the
                                    // unit the group is actually made of. A
                                    // section of 400 sq.yd plots headed
                                    // "0.09 ac" is arithmetically right and
                                    // reads as nothing.
                                    Text(subtotal(items))
                                        .monospacedDigit()
                                }
                            }
                        }
                    }
                    if visible.isEmpty { emptyState }
                    }
                } else if app.lastFailure != nil {
                    LoadFailure(message: app.lastFailure)
                }
            }
            }
            }
            .navigationTitle("Properties")
            .searchable(text: $search, prompt: "Survey number, village, owner")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker("Group by", selection: $grouping) {
                            ForEach(HoldingGrouping.allCases) { Text($0.rawValue).tag($0) }
                        }
                    } label: {
                        Label("Group by", systemImage: "line.3.horizontal.decrease.circle")
                    }
                    .disabled(filter == .passbooks)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showMap.toggle() } label: {
                        Label(showMap ? "List" : "Map",
                              systemImage: showMap ? "list.bullet" : "map.fill")
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Label("Add", systemImage: "plus") }
                }
            }
            .sheet(isPresented: $showAdd) {
                AddHoldingScreen(passbooks: passbooks, parcels: holdings?.parcels ?? []).onDisappear { Task { await load() } }
            }
            .sheet(item: $editParcel) { p in EditParcelScreen(parcel: p) { Task { await load() } } }
            .sheet(item: $editProperty) { p in EditPropertyScreen(property: p) { Task { await load() } } }
            .sheet(item: $editPassbook) { pb in EditPassbookScreen(passbook: pb) { Task { await load() } } }
            .confirmationDialog("Delete this passbook?",
                                isPresented: Binding(get: { confirmPassbook != nil },
                                                     set: { if !$0 { confirmPassbook = nil } }),
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let pb = confirmPassbook { Task { await delete(passbook: pb) } }
                }
                Button("Keep it", role: .cancel) { confirmPassbook = nil }
            } message: {
                Text(confirmPassbook.map {
                    "\($0.pattadarNo) and every parcel filed under it will be removed. This cannot be undone."
                } ?? "")
            }
            .confirmationDialog("Delete this parcel?",
                                isPresented: Binding(get: { confirmParcel != nil },
                                                     set: { if !$0 { confirmParcel = nil } }),
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let p = confirmParcel { Task { await delete(parcel: p) } }
                }
                Button("Keep it", role: .cancel) { confirmParcel = nil }
            } message: {
                Text(confirmParcel.map { "Sy \($0.surveyNo) and the documents attached to it will be removed. This cannot be undone." } ?? "")
            }
            .confirmationDialog("Delete this property?",
                                isPresented: Binding(get: { confirmProperty != nil },
                                                     set: { if !$0 { confirmProperty = nil } }),
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) {
                    if let p = confirmProperty { Task { await delete(property: p) } }
                }
                Button("Keep it", role: .cancel) { confirmProperty = nil }
            } message: {
                Text(confirmProperty.map { "\($0.label.isEmpty ? "This property" : $0.label) and its deeds will be removed. This cannot be undone." } ?? "")
            }
            // Applied once and cleared: a filter set by tapping an attention
            // item must not still be in force the next time the tab is opened.
            .onAppear {
                if let requested = app.holdingsFilter {
                    filter = requested
                    app.holdingsFilter = nil
                }
                if app.requestAddHolding {
                    app.requestAddHolding = false
                    showAdd = true
                }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    /// Scrolling capsules, the way a messaging app filters a thread list —
    /// always visible, one tap, and each says how many it would show so an
    /// empty filter is never a surprise.
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(HoldingFilter.allCases) { f in
                    let count = switch f {
                    case .passbooks: passbooks.count
                    case .favourites: all.filter { app.isFavourite($0.entityType, $0.entityId) }.count
                    default: all.filter { f.matches($0) }.count
                    }
                    Button {
                        filter = f
                    } label: {
                        HStack(spacing: 5) {
                            Text(f.rawValue)
                            if count > 0 && f != .all {
                                Text("\(count)").monospacedDigit()
                                    .font(.caption2)
                                    .padding(.horizontal, 5).padding(.vertical, 1)
                                    .background(Capsule().fill(filter == f ? .white.opacity(0.25) : .secondary.opacity(0.18)))
                            }
                        }
                        .font(.subheadline)
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Capsule().fill(filter == f ? Color.accentColor : Color(.secondarySystemFill)))
                        .foregroundStyle(filter == f ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                    // Empty categories are shown but dimmed, so the set of
                    // filters stays stable instead of reshuffling as data
                    // changes underneath.
                    .opacity(count == 0 && f != .all ? 0.45 : 1)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    @ViewBuilder
    private func row(_ h: Holding) -> some View {
        switch h {
        case .parcel(let parcel, let pb):
            NavigationLink { HoldingDetailScreen(parcel: parcel, passbook: pb) } label: {
                HoldingRow(holding: h, showPassbook: grouping != .passbook)
            }
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) { confirmParcel = parcel } label: {
                    Label("Delete", systemImage: "trash.fill")
                }
                Button { editParcel = parcel } label: { Label("Edit", systemImage: "pencil.line") }
                    .tint(.blue)
            }
        case .property(let property):
            NavigationLink { PropertyDetailScreen(property: property) } label: {
                HoldingRow(holding: h, showPassbook: false)
            }
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) { confirmProperty = property } label: {
                    Label("Delete", systemImage: "trash.fill")
                }
                Button { editProperty = property } label: { Label("Edit", systemImage: "pencil.line") }
                    .tint(.blue)
            }
        }
    }

    /// Leading swipe, the way Mail flags a message.
    private func starButton(_ h: Holding) -> some View {
        Button {
            Task { await app.toggleFavourite(h.entityType, h.entityId) }
        } label: {
            Label(app.isFavourite(h.entityType, h.entityId) ? "Unstar" : "Star",
                  systemImage: app.isFavourite(h.entityType, h.entityId) ? "star.slash" : "star")
        }
        .tint(.yellow)
    }

    /// One unit when the group is all one kind, acres when it is mixed.
    private func subtotal(_ items: [Holding]) -> String {
        let acres = items.reduce(0) { $0 + $1.acres }
        let kinds = Set(items.map { $0.kind })
        guard kinds.count == 1, let kind = kinds.first else {
            return String(format: "%.2f ac", acres)
        }
        let amount = fromAcres(acres, kind.unit)
        switch kind.unit {
        case .acre: return String(format: "%.2f ac", amount)
        case .sqyd: return String(format: "%.0f sq. yd", amount)
        case .sqft: return String(format: "%.0f sq. ft", amount)
        default: return String(format: "%.2f %@", amount, kind.unit.label)
        }
    }

    private var emptyState: some View {
        ContentUnavailableView(
            filter == .all ? "Nothing recorded yet" : "Nothing in \(filter.rawValue.lowercased())",
            systemImage: filter == .all ? "map" : "line.3.horizontal.decrease.circle",
            description: Text(filter == .all
                              ? "Scan a passbook or a deed to add your first record."
                              : "Try another filter.")
        )
    }

    // MARK: - Data

    private var all: [Holding] {
        guard let h = holdings else { return [] }
        let parcels = h.parcels.map { p in
            Holding.parcel(p, h.passbooks.first { $0.id == p.passbookId })
        }
        return parcels + h.properties.map { Holding.property($0) }
    }

    private var visible: [Holding] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return all.filter { h in
            if filter == .favourites, !app.isFavourite(h.entityType, h.entityId) { return false }
            guard filter.matches(h) else { return false }
            guard !q.isEmpty else { return true }
            return [h.title, h.village, h.passbook, h.owner, h.typeLabel]
                .joined(separator: " ").lowercased().contains(q)
        }
    }

    /// Grouped, with the biggest holding first inside each group and the
    /// largest group first — the order that answers "where is most of it".
    private var groups: [(String, [Holding])] {
        guard grouping != .none else { return [("", visible.sorted { $0.acres > $1.acres })] }
        var buckets: [String: [Holding]] = [:]
        for h in visible { buckets[grouping.key(for: h), default: []].append(h) }
        return buckets
            .map { ($0.key, $0.value.sorted { $0.acres > $1.acres }) }
            .sorted { lhs, rhs in
                let l = lhs.1.reduce(0) { $0 + $1.acres }
                let r = rhs.1.reduce(0) { $0 + $1.acres }
                return l == r ? lhs.0 < rhs.0 : l > r
            }
    }

    private func parcelCount(for pb: PassbookDetail) -> Int {
        holdings?.parcels.filter { $0.passbookId == pb.id }.count ?? 0
    }

    private func delete(passbook pb: PassbookDetail) async {
        struct Ack: Decodable { let deletePassbook: Bool }
        _ = await app.load(Mutations.deletePassbook, variables: ["id": pb.id], as: Ack.self)
        confirmPassbook = nil
        await load()
    }

    private func passbook(named pattadarNo: String) -> PassbookDetail? {
        passbooks.first { $0.pattadarNo == pattadarNo }
    }

    private func load() async {
        holdings = await app.load(Queries.holdings, as: HoldingsResponse.self)
        await app.loadFavourites()
        if let r = await app.load(Queries.passbooks, as: PassbooksResponse.self) { passbooks = r.passbooks }
    }

    private func delete(parcel: Parcel) async {
        struct Ack: Decodable { let deleteParcel: Bool }
        _ = await app.load(Mutations.deleteParcel, variables: ["id": parcel.id], as: Ack.self)
        confirmParcel = nil
        await load()
    }

    private func delete(property: Property) async {
        struct Ack: Decodable { let deleteProperty: Bool }
        _ = await app.load(Mutations.deleteProperty, variables: ["id": property.id], as: Ack.self)
        confirmProperty = nil
        await load()
    }
}

struct HoldingRow: View {
    let holding: Holding
    let showPassbook: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: holding.isAgricultural ? "leaf.fill" : "building.2.fill")
                .font(.footnote)
                .foregroundStyle(holding.isAgricultural ? .green : .blue)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                Text(holding.title).fontWeight(.semibold).lineLimit(1)
                HStack(spacing: 6) {
                    let caption = [showPassbook ? holding.passbook : "", holding.village, holding.owner]
                        .filter { !$0.isEmpty }.joined(separator: " · ")
                    if !caption.isEmpty {
                        Text(caption).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    if !holding.hasPin {
                        Image(systemName: "mappin.slash").font(.caption2).foregroundStyle(.secondary)
                    }
                    if holding.disputed {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.caption2).foregroundStyle(.orange)
                    }
                }
            }
            Spacer(minLength: 8)
            // The number is the point of the row: it never shrinks or wraps.
            Text(holding.extentText)
                .monospacedDigit().fontWeight(.medium).layoutPriority(1)
        }
    }
}


struct PassbookRow: View {
    let passbook: PassbookDetail
    let parcelCount: Int

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "book.closed.fill")
                .font(.footnote).foregroundStyle(.indigo).frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                Text(passbook.pattadarNo.isEmpty ? "Passbook" : passbook.pattadarNo)
                    .fontWeight(.semibold).lineLimit(1)
                Text([passbook.ownerName, passbook.village,
                      parcelCount > 0 ? "\(parcelCount) parcel\(parcelCount == 1 ? "" : "s")" : ""]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(String(format: "%.2f ac", passbook.totalExtent))
                .monospacedDigit().fontWeight(.medium).layoutPriority(1)
        }
    }
}
