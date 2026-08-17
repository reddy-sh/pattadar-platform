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

    /// The surveyed outline, "lat,lng;…" — empty when none is drawn.
    var boundary: String {
        switch self {
        case .parcel(let p, _): p.boundary
        case .property(let p): p.boundary
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
    case none = "No grouping"
    case village = "Village"
    case passbook = "Passbook"
    case owner = "Owner"
    case type = "Type"
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

/// How the list is ordered (M02's "Sort:" chip). The comp's default is the
/// survey number — the order the records themselves are spoken in.
enum HoldingSort: String, CaseIterable, Identifiable {
    case surveyNo = "Survey no."
    case extent = "Extent"
    case village = "Village"
    var id: String { rawValue }

    func ordered(_ items: [Holding]) -> [Holding] {
        switch self {
        case .surveyNo:
            items.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        case .extent:
            items.sorted { $0.acres > $1.acres }
        case .village:
            items.sorted {
                $0.village == $1.village
                    ? $0.title.localizedStandardCompare($1.title) == .orderedAscending
                    : $0.village < $1.village
            }
        }
    }
}

struct HoldingsScreen: View {
    @Environment(AppModel.self) private var app
    @State private var holdings: HoldingsResponse?
    @State private var passbooks: [PassbookDetail] = []
    /// Why THIS screen has no holdings, if it has none. Never set by another
    /// screen's query, and never set by a cancellation.
    @State private var ownFailure: String?
    @State private var search = ""
    @State private var filter: HoldingFilter = .all
    @State private var facetVillage: String?
    @State private var facetPassbook: String?
    @State private var grouping: HoldingGrouping = .none
    @State private var sort: HoldingSort = .surveyNo
    /// All | Mine (M02/M22). Everything on file today IS yours; the segment
    /// is where shared and assigned holdings land when the API carries them,
    /// and Mine is the only state that shows the portfolio totals.
    @State private var segment: Scope = .all
    @State private var showAdd = false
    @State private var showFilterSheet = false
    @State private var editParcel: Parcel?
    @State private var editProperty: Property?
    @State private var confirmParcel: Parcel?
    @State private var confirmProperty: Property?
    @State private var editPassbook: PassbookDetail?
    @State private var confirmPassbook: PassbookDetail?
    @State private var showMap = false

    enum Scope { case all, mine }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
            controls
            Group {
            if showMap {
                PropertiesMap(holdings: visible)
            } else {
            List {
                if holdings != nil {
                    if segment == .mine {
                        // M22: Mine is the only state that shows portfolio
                        // totals — the same card Home draws, consumed here.
                        Section {
                            StatTripleCard(totals: mineTotals) { chosen in
                                filter = chosen
                            }
                            .listRowInsets(EdgeInsets(top: Space.xs, leading: Space.lg,
                                                      bottom: Space.xs, trailing: Space.lg))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                        }
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
                                    .tint(Palette.accent)
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
                            ForEach(Array(items.enumerated()), id: \.element.id) { index, h in
                                // The first holding of the ungrouped list gets
                                // the hero treatment (M02); grouped sections
                                // keep their rhythm and their subtotals.
                                row(h, hero: grouping == .none && index == 0)
                            }
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
                                            HStack(spacing: Space.xs) {
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
                } else if let failure = ownFailure {
                    // There was no `else` here at all, so a load that finished
                    // with nothing rendered NOTHING — a blank screen under a
                    // search bar. It also read the app-wide `lastFailure`,
                    // which any other screen's query could overwrite; a tab
                    // switch cancelling a load wrote "Stopped." into it. This
                    // is this screen's own holdings query and nothing else.
                    LoadFailure(message: failure)
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                } else {
                    Section { HStack { ProgressView(); Text("Loading your land…") } }
                }
            }
            }
            }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Properties")
            .searchable(text: $search, prompt: "Survey number, village, owner")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showFilterSheet = true } label: {
                        Label("Filter", systemImage: "line.3.horizontal.decrease")
                    }
                    // The applied count rides the icon (M02), so a filtered
                    // list can never masquerade as the whole of it.
                    .overlay(alignment: .topTrailing) {
                        if appliedFacets > 0 {
                            Text("\(appliedFacets)")
                                .font(.caption2.weight(.semibold)).monospacedDigit()
                                .foregroundStyle(Palette.accentInk)
                                .padding(.horizontal, Space.xs)
                                .background(Capsule().fill(Palette.accent))
                                .offset(x: 6, y: -4)
                        }
                    }
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if !showMap, filter != .passbooks, holdings != nil {
                    fab
                }
            }
            .sheet(isPresented: $showFilterSheet) {
                HoldingFilterSheet(filter: $filter,
                                   village: $facetVillage,
                                   passbook: $facetPassbook,
                                   villages: villageNames,
                                   passbookNos: passbooks.map(\.pattadarNo).filter { !$0.isEmpty },
                                   count: countMatching)
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
            // A holding named by a widget. Pushed by id rather than by value so
            // the screen survives the list reloading underneath it.
            .navigationDestination(item: $deepLinked) { deepLinkedScreen($0) }
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
                takeDeepLink()
            }
            // A widget tapped while this tab is ALREADY in front changes
            // nothing that `onAppear` would notice.
            .onChange(of: app.pendingHolding) { _, _ in takeDeepLink() }
            .refreshable { await load() }
            .task {
                await load()
                takeDeepLink()
            }
        }
    }

    /// A holding opened from the Home Screen, once the list can show it.
    @State private var deepLinked: String?

    /// Taken only when the records are loaded — pushing before then would open
    /// an empty screen and then fill it in, which reads as a fault.
    private func takeDeepLink() {
        guard let wanted = app.pendingHolding, holdings != nil else { return }
        app.pendingHolding = nil
        deepLinked = wanted
    }

    @ViewBuilder
    private func deepLinkedScreen(_ id: String) -> some View {
        if let h = all.first(where: { "\($0.entityType):\($0.entityId)" == id }) {
            switch h {
            case .parcel(let p, let pb): HoldingDetailScreen(parcel: p, passbook: pb)
            case .property(let p): PropertyDetailScreen(property: p)
            }
        } else {
            // Deleted since the widget last refreshed. Said plainly rather than
            // pushing a blank screen somebody has to work out for themselves.
            ContentUnavailableView("Not in your records",
                                   systemImage: "questionmark.folder",
                                   description: Text("This holding is no longer on file."))
        }
    }

    /// The M02 chrome — count line, All | Mine, the utility chips and any
    /// applied facets — drawn once, above whichever face (list or map) shows.
    @ViewBuilder
    private var controls: some View {
        if holdings != nil {
            VStack(alignment: .leading, spacing: Space.sm) {
                Text(countLine)
                    .font(.note).foregroundStyle(.secondary)
                    .padding(.horizontal, Space.lg)
                Picker("Scope", selection: $segment) {
                    Text("All \(all.count)").tag(Scope.all)
                    Text("Mine \(all.count)").tag(Scope.mine)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Space.lg)
                utilityChips
                if appliedFacets > 0 { appliedChips }
            }
            .padding(.bottom, Space.sm)
        }
    }

    private var countLine: String {
        // "Shared" and "assigned" join this line when the API carries them;
        // printing zeros for them today would be inventing a feature.
        var parts = ["\(all.count) yours"]
        if !passbooks.isEmpty {
            parts.append("\(passbooks.count) passbook\(passbooks.count == 1 ? "" : "s")")
        }
        return parts.joined(separator: " · ")
    }

    private var utilityChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Space.sm) {
                Menu {
                    Picker("Group by", selection: $grouping) {
                        ForEach(HoldingGrouping.allCases) { Text($0.rawValue).tag($0) }
                    }
                } label: {
                    chip("Group: \(grouping == .none ? "None" : grouping.rawValue)")
                }
                .disabled(filter == .passbooks)
                Menu {
                    Picker("Sort", selection: $sort) {
                        ForEach(HoldingSort.allCases) { Text($0.rawValue).tag($0) }
                    }
                } label: {
                    chip("Sort: \(sort.rawValue)")
                }
                Button {
                    withAnimation(Motion.standard()) { showMap.toggle() }
                } label: {
                    chip(showMap ? "List" : "Map",
                         icon: showMap ? "list.bullet" : "map",
                         active: showMap)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Space.lg)
        }
    }

    /// The facets in force, each with its own ×, plus Clear (M02). A filter
    /// that can only be discovered by opening the sheet is a filter people
    /// forget is on.
    private var appliedChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Space.sm) {
                if filter != .all {
                    appliedChip(filter.rawValue) { filter = .all }
                }
                if let v = facetVillage {
                    appliedChip(v) { facetVillage = nil }
                }
                if let pb = facetPassbook {
                    appliedChip(pb) { facetPassbook = nil }
                }
                Button {
                    withAnimation(Motion.standard()) {
                        filter = .all; facetVillage = nil; facetPassbook = nil
                    }
                } label: {
                    chip("Clear")
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Space.lg)
        }
    }

    private func chip(_ label: String, icon: String? = nil, active: Bool = false) -> some View {
        HStack(spacing: Space.xs) {
            if let icon { Image(systemName: icon).font(.scaled(13)) }
            Text(label)
        }
        .font(.footnote)
        .padding(.horizontal, Space.md)
        .padding(.vertical, Space.sm)
        .background(Capsule().fill(active ? Palette.accent : Color(.secondarySystemFill)))
        .overlay(Capsule().strokeBorder(active ? .clear : Palette.ruleStrong.opacity(0.5)))
        .foregroundStyle(active ? Palette.accentInk : Palette.ink)
        .contentShape(Capsule())
    }

    private func appliedChip(_ label: String, clear: @escaping () -> Void) -> some View {
        Button {
            withAnimation(Motion.standard()) { clear() }
        } label: {
            HStack(spacing: Space.xs) {
                Text(label).font(.footnote.weight(.semibold))
                Image(systemName: "xmark").font(.scaled(11, weight: .semibold))
            }
            .padding(.horizontal, Space.md)
            .padding(.vertical, Space.sm)
            .background(Capsule().fill(Palette.accentWash))
            .foregroundStyle(Color.accentColor)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Remove the \(label) filter")
    }

    private var appliedFacets: Int {
        (filter == .all ? 0 : 1) + (facetVillage == nil ? 0 : 1) + (facetPassbook == nil ? 0 : 1)
    }

    private var villageNames: [String] {
        Array(Set(all.map(\.village).filter { !$0.isEmpty })).sorted()
    }

    /// Live count for the sheet's footer button — the sheet promises "Show N
    /// properties" and N must be the truth.
    private func countMatching(_ f: HoldingFilter, _ v: String?, _ pb: String?) -> Int {
        all.filter { h in
            if f == .favourites, !app.isFavourite(h.entityType, h.entityId) { return false }
            guard f.matches(h) else { return false }
            if let v, h.village != v { return false }
            if let pb, h.passbook != pb { return false }
            return true
        }.count
    }

    /// The totals card on the Mine face (M22) — the same figures Home shows,
    /// from the same PattadarKit arithmetic.
    private var mineTotals: [KindTotal] {
        guard let h = holdings else { return [] }
        return landTotals(parcels: h.parcels, properties: h.properties,
                          passbooks: h.passbooks)
    }

    private var fab: some View {
        Button { showAdd = true } label: {
            HStack(spacing: Space.sm) {
                Image(systemName: "plus").font(.scaled(18, weight: .semibold))
                Text("Add").font(.callout.weight(.semibold))
            }
            .foregroundStyle(Palette.accentInk)
            .padding(.horizontal, Space.xl)
            .frame(minHeight: 56)
            .background(Capsule().fill(Palette.accent)
                .shadow(color: Palette.accent.opacity(0.35), radius: 9, y: 6))
        }
        .buttonStyle(.plain)
        .padding(.trailing, Space.lg)
        .padding(.bottom, Space.lg)
        .accessibilityLabel("Add a holding")
    }

    @ViewBuilder
    private func row(_ h: Holding, hero: Bool = false) -> some View {
        if hero {
            // The card IS the row: the link rides invisibly underneath so the
            // List's own chevron and inset chrome never draw over it.
            ZStack {
                NavigationLink { HoldingDestination(holding: h) } label: { EmptyView() }
                    .opacity(0)
                HoldingHeroCard(holding: h,
                                starred: app.isFavourite(h.entityType, h.entityId))
            }
            .listRowInsets(EdgeInsets(top: Space.xs, leading: Space.lg,
                                      bottom: Space.xs, trailing: Space.lg))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .swipeActions(edge: .leading) { starButton(h) }
            .swipeActions(edge: .trailing) { trailingActions(h) }
        } else {
            NavigationLink { HoldingDestination(holding: h) } label: {
                HoldingRow(holding: h, showPassbook: grouping != .passbook)
            }
            .swipeActions(edge: .leading) { starButton(h) }
            .swipeActions(edge: .trailing) { trailingActions(h) }
        }
    }

    @ViewBuilder
    private func trailingActions(_ h: Holding) -> some View {
        switch h {
        case .parcel(let parcel, _):
            Button(role: .destructive) { confirmParcel = parcel } label: {
                Label("Delete", systemImage: "trash.fill")
            }
            Button { editParcel = parcel } label: { Label("Edit", systemImage: "pencil.line") }
                .tint(Palette.accent)
        case .property(let property):
            Button(role: .destructive) { confirmProperty = property } label: {
                Label("Delete", systemImage: "trash.fill")
            }
            Button { editProperty = property } label: { Label("Edit", systemImage: "pencil.line") }
                .tint(Palette.accent)
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
        .tint(Palette.accent)
    }

    /// Acres and square yards, stated separately and never combined.
    ///
    /// The unit follows the LAND, not the filing: a 25-acre field bought on a
    /// deed is acres even though it sits among "properties", and converting
    /// it produced a village header of "121000 sq. yd" — a number nobody in
    /// India says. People know their fields in acres and their sites in
    /// square yards; a mixed village reads "25.00 ac · 191 sq. yd".
    private func subtotal(_ items: [Holding]) -> String {
        var acres = 0.0
        var sqyd = 0.0
        for h in items {
            switch h {
            case .parcel(let p, _):
                if p.classification.lowercased().contains("non") {
                    sqyd += fromAcres(p.extent, .sqyd)
                } else {
                    acres += p.extent
                }
            case .property(let p):
                switch unitKey(p.landUnit) {
                case .acre, .cent, .gunta, .hectare:
                    acres += toAcres(p.landArea, unitKey(p.landUnit))
                default:
                    if let a = headlineArea(propertyType: p.type,
                                            landArea: p.landArea, landUnit: p.landUnit,
                                            builtupArea: p.builtupArea, builtupUnit: p.builtupUnit) {
                        sqyd += convert(a.value, from: a.unit, to: .sqyd)
                    }
                }
            }
        }
        var parts: [String] = []
        if acres > 0 { parts.append(String(format: "%.2f ac", acres)) }
        if sqyd > 0 { parts.append(String(format: "%.0f sq. yd", sqyd)) }
        return parts.joined(separator: " · ")
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
            if let v = facetVillage, h.village != v { return false }
            if let pb = facetPassbook, h.passbook != pb { return false }
            guard !q.isEmpty else { return true }
            return [h.title, h.village, h.passbook, h.owner, h.typeLabel]
                .joined(separator: " ").lowercased().contains(q)
        }
    }

    /// Grouped, rows in the chosen sort order; groups themselves still land
    /// biggest first — the order that answers "where is most of it".
    private var groups: [(String, [Holding])] {
        guard grouping != .none else { return [("", sort.ordered(visible))] }
        var buckets: [String: [Holding]] = [:]
        for h in visible { buckets[grouping.key(for: h), default: []].append(h) }
        return buckets
            .map { ($0.key, sort.ordered($0.value)) }
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
        let answer = await app.fetch(Queries.holdings, as: HoldingsResponse.self)
        holdings = answer.value
        ownFailure = answer.failure
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
        HStack(spacing: Space.md) {
            Image(systemName: holding.isAgricultural ? "leaf.fill" : "building.2.fill")
                .font(.footnote)
                .foregroundStyle(holding.isAgricultural ? Palette.Category.farmland : Palette.Category.plot)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: Space.xs) {
                Text(holding.title).fontWeight(.semibold).lineLimit(1)
                HStack(spacing: Space.sm) {
                    let caption = [showPassbook ? holding.passbook : "", holding.village, holding.owner]
                        .filter { !$0.isEmpty }.joined(separator: " · ")
                    if !caption.isEmpty {
                        Text(caption).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    if !holding.hasPin {
                        Image(systemName: "mappin.slash").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                // The alert line (M22): a dispute is said in words and in the
                // danger colour, not left to a glyph somebody has to decode.
                if holding.disputed {
                    Text("Disputed")
                        .font(.caption).foregroundStyle(Palette.danger)
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
        HStack(spacing: Space.md) {
            Image(systemName: "book.closed.fill")
                .font(.footnote).foregroundStyle(Palette.Category.commercial).frame(width: 18)
            VStack(alignment: .leading, spacing: Space.xs) {
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

/// The first holding of the list, given the M02 hero treatment: a category
/// wash with the kind's own motif ghosted large, then the record's facts.
/// A card inside the List is allowed here — a holding is a genuine unit.
struct HoldingHeroCard: View {
    let holding: Holding
    let starred: Bool

    private var tint: Color { Palette.tint(for: holding.kind) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomTrailing) {
                LinearGradient(colors: [Palette.card, tint.opacity(0.22)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                Image(systemName: holding.kind.icon)
                    .font(.scaled(76))
                    .foregroundStyle(tint.opacity(0.22))
                    .offset(x: 8, y: 14)
            }
            .frame(height: 96)
            .clipped()
            .overlay(alignment: .topLeading) {
                HStack(spacing: Space.xs) {
                    Text("Yours")
                        .font(.caption2.weight(.bold))
                        .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                        .background(Capsule().fill(Palette.success.opacity(0.14)))
                        .overlay(Capsule().strokeBorder(Palette.success.opacity(0.32)))
                        .foregroundStyle(Palette.success)
                    if starred {
                        Image(systemName: "star.fill")
                            .font(.scaled(11))
                            .foregroundStyle(Color.accentColor)
                    }
                }
                .padding(Space.md)
            }

            VStack(alignment: .leading, spacing: Space.xs) {
                HStack(alignment: .firstTextBaseline) {
                    Text(holding.title)
                        .font(.title3.weight(.semibold))
                    Spacer()
                    if !holding.typeLabel.isEmpty {
                        Text(holding.typeLabel.lowercased())
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                            .overlay(Capsule().strokeBorder(tint.opacity(0.5)))
                            .foregroundStyle(tint)
                    }
                }
                if !holding.owner.isEmpty {
                    Text(holding.owner)
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                if !holding.village.isEmpty {
                    HStack(spacing: Space.xs) {
                        Image(systemName: "mappin.and.ellipse").font(.caption)
                        Text(holding.village)
                    }
                    .font(.subheadline).foregroundStyle(.secondary)
                }
                if !holding.passbook.isEmpty {
                    HStack(spacing: Space.xs) {
                        Circle().fill(Palette.success).frame(width: 5, height: 5)
                        Text("Khata \(holding.passbook)")
                            .font(.caption.monospacedDigit())
                    }
                    .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                    .overlay(Capsule().strokeBorder(Palette.ruleStrong))
                    .foregroundStyle(.secondary)
                    .padding(.top, Space.hair)
                }
                Divider().padding(.top, Space.sm)
                HStack(alignment: .firstTextBaseline) {
                    Text(holding.extentText)
                        .font(.callout.weight(.semibold)).monospacedDigit()
                    Spacer()
                    Text(kindWord)
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.top, Space.xs)
                if holding.disputed {
                    Text("Disputed")
                        .font(.caption).foregroundStyle(Palette.danger)
                }
            }
            .padding(Space.lg)
        }
        .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .fill(Palette.card))
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var kindWord: String {
        switch holding.kind {
        case .farmland: "Land parcel"
        case .plot: "Open plot"
        case .home: "Home"
        case .commercial: "Commercial"
        }
    }
}

/// The filter sheet (M03). Facets are the app's own vocabulary — kind, then
/// state, then where and how it is filed — and the footer button counts what
/// it will show, so an empty result is never a surprise. "My stake" and
/// "Your tags" join when shared holdings and tags exist server-side.
struct HoldingFilterSheet: View {
    @Binding var filter: HoldingFilter
    @Binding var village: String?
    @Binding var passbook: String?
    let villages: [String]
    let passbookNos: [String]
    let count: (HoldingFilter, String?, String?) -> Int
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Kind") {
                    facetChips([.all, .agricultural, .plots])
                }
                Section("State") {
                    facetChips([.needsAttention, .disputed, .favourites])
                }
                Section {
                    Picker("Village", selection: villageBinding) {
                        Text("All").tag("")
                        ForEach(villages, id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Passbook", selection: passbookBinding) {
                        Text("All").tag("")
                        ForEach(passbookNos, id: \.self) { Text($0).tag($0) }
                    }
                }
                Section {
                    PrimaryButton(title: "Show \(count(filter, village, passbook)) propert\(count(filter, village, passbook) == 1 ? "y" : "ies")") {
                        dismiss()
                    }
                }
            }
            .navigationTitle("Filter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Reset") {
                        withAnimation(Motion.standard()) {
                            filter = .all; village = nil; passbook = nil
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func facetChips(_ options: [HoldingFilter]) -> some View {
        FlowLayout(spacing: Space.sm) {
            ForEach(options) { option in
                let selected = filter == option
                Button {
                    withAnimation(Motion.standard()) {
                        filter = selected && option != .all ? .all : option
                    }
                } label: {
                    Text(option.rawValue)
                        .font(.footnote.weight(selected ? .semibold : .regular))
                        .padding(.horizontal, Space.md)
                        .padding(.vertical, Space.sm)
                        .background(Capsule().fill(selected ? Palette.accent : Color(.secondarySystemFill)))
                        .foregroundStyle(selected ? Palette.accentInk : Palette.ink)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var villageBinding: Binding<String> {
        Binding(get: { village ?? "" }, set: { village = $0.isEmpty ? nil : $0 })
    }

    private var passbookBinding: Binding<String> {
        Binding(get: { passbook ?? "" }, set: { passbook = $0.isEmpty ? nil : $0 })
    }
}
