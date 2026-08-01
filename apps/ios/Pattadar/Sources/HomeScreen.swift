import PattadarKit
import SwiftUI

/// The dashboard: the total first, then what is wrong, then what happened.
struct HomeScreen: View {
    @Environment(AppModel.self) private var app
    @State private var data: DashboardResponse?
    @State private var holdings: HoldingsResponse?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if data != nil && isEmptyAccount {
                        // Nothing recorded yet — a grid of zeros reports a
                        // fault; this reports a beginning.
                        WelcomeState(name: firstName,
                                     onScan: { showAdd = true },
                                     onManual: { showAdd = true })
                    } else if data != nil {
                        greeting
                        // The shortcut row.
                        //
                        // These are the questions people arrive with — what is
                        // outstanding, who holds what, what has this cost — and
                        // each was buried in a tab or nowhere at all. Scrolls
                        // horizontally so adding a seventh does not shrink the
                        // other six into unreadable chips.
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                NavigationLink { GetItDoneScreen() } label: {
                                    shortcut(openRequestSummary(
                                        requests.map { (needsYou: $0.needsYou, closed: $0.closed) }),
                                        "hammer.fill")
                                }
                                NavigationLink { HoldersScreen(holdings: holdings) } label: {
                                    shortcut("Who holds what", "person.text.rectangle.fill")
                                }
                                NavigationLink { SpendScreen() } label: {
                                    shortcut("Spend", "indianrupeesign.circle.fill")
                                }
                                // The activity feed now lives entirely behind
                                // this chip. It used to ALSO be a card at the
                                // bottom of Home showing the same six events
                                // this screen shows in full — the same facts
                                // twice, with the copy pushing the land itself
                                // further off the first screen. What the card
                                // was actually good for was "has anything
                                // happened", so that much is kept here: the age
                                // of the newest entry, on the chip.
                                NavigationLink { ActivityScreen() } label: {
                                    shortcut("Timeline", "clock.arrow.circlepath", note: latestActivity)
                                }
                            }
                            .padding(.horizontal, 2)
                        }

                        // Read, but not yet yours.
                        //
                        // A read that finishes while the app is closed used to
                        // vanish with the process: the notification arrived, the
                        // app was opened, and the property was not there. These
                        // wait here until they are saved or thrown away.
                        if !app.pendingReviews.isEmpty {
                            ReviewCard(entries: app.pendingReviews,
                                       onOpen: { reviewToAdd = $0 },
                                       onDiscard: { app.discardReview($0.id) })
                        }
                        // Full width and equal weight. These are the four
                        // numbers the app exists to tell you; none is
                        // subordinate to another, and none should have to
                        // compete with its own label for room.
                        ForEach(categories) { c in
                            KindCard(kind: c.kind, amount: c.amount,
                                     count: c.count, passbooks: c.passbooks)
                        }

                        // What is left after the holdings themselves.
                        //
                        // The passbook count moved under the acreage on the
                        // farmland card, where it belongs to a figure; and the
                        // estimated value has gone entirely. It was a market
                        // rate nobody has entered, so it read "Not valued" on
                        // every account — a tile whose only content was the
                        // reason it was empty.
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            // Each opens the list it counts.
                            StatTile(value: "\(data.map(documentCount) ?? 0)",
                                     label: "Documents", icon: "doc.text.fill", tint: .purple,
                                     destination: .documents)
                            StatTile(value: "\(data?.dashboardStats.totalGroups ?? 0)",
                                     label: "Family groups", icon: "person.2.fill", tint: .pink,
                                     destination: .you, onSelect: { app.openFamily = true })
                        }

                        if !starred.isEmpty {
                            FavouritesCard(items: starred)
                        }
                        // What is wrong and what is not record-ready used to be
                        // two cards here — a dark ring saying 18%, and an amber
                        // list of unpinned parcels and missing heirs. Both are
                        // moving to one place that owns the whole subject, so
                        // Home is what you HAVE and that surface is what needs
                        // doing. Two answers to "what is wrong" on one screen
                        // is how they end up disagreeing.
                        if villages.count > 1 { VillageChart(slices: villages) }
                    } else if app.lastFailure != nil {
                        LoadFailure(message: app.lastFailure)
                    } else {
                        ProgressView().padding(.top, 60)
                    }
                }
                .padding(.horizontal, 16)
                // Clear of the floating tab bar, which draws OVER the scroll
                // view: without this the last card is half-covered at the end
                // of the list and looks clipped rather than scrollable.
                .padding(.bottom, 40)
            }
            .background(Color(.systemGroupedBackground))
            // No navigation bar on this screen.
            //
            // A large "Home" title cost about 60 points at the top to repeat
            // the word already lit up in the tab bar, and pushed the greeting —
            // and everything after it — that much further down. Pushed screens
            // still get their own bars; only the root goes without.
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showAdd) { AddPropertyScreen().onDisappear { Task { await load() } } }
            .sheet(item: $reviewToAdd) { entry in
                AddHoldingScreen(passbooks: [], parcels: holdings?.parcels ?? [], review: entry)
                    .onDisappear { Task { await load() } }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    /// One source of truth.
    ///
    /// This used to be `max(stat, documentsSeen)`, a workaround from when the
    /// API counted only the `documents` table and ignored scanned deeds. The
    /// API counts both now, so the workaround is dead weight that would hide
    /// the next regression — and it let Home and the You screen, which reads
    /// the stat directly, disagree about the same number.
    private func documentCount(_ d: DashboardResponse) -> Int {
        d.dashboardStats.totalDocuments
    }
    @State private var documentsSeen = 0
    @State private var requests: [WorkRequest] = []
    @State private var showAdd = false
    @State private var reviewToAdd: ReviewQueue.Entry?

    /// Nothing at all — not merely nothing in one category.
    private var isEmptyAccount: Bool {
        let h = holdings
        return (h?.parcels.isEmpty ?? true)
            && (h?.properties.isEmpty ?? true)
            && (h?.passbooks.isEmpty ?? true)
            && documentsSeen == 0
    }

    private var firstName: String {
        name.split(separator: " ").first.map(String.init) ?? ""
    }

    /// What you starred, at the top of Home — the point of starring is that
    /// these are the ones you come back to.
    private var starred: [Holding] {
        guard let h = holdings else { return [] }
        let parcels = h.parcels.map { p in Holding.parcel(p, h.passbooks.first { $0.id == p.passbookId }) }
        return (parcels + h.properties.map { Holding.property($0) })
            .filter { app.isFavourite($0.entityType, $0.entityId) }
    }

    /// 🙏 Namaste — the greeting people here actually use, and the emoji that
    /// carries it. Time-of-day so opening the app twice in a day is not the
    /// same sentence twice.
    /// One chip in the shortcut row, with an optional second phrase set quieter
    /// — used where the chip can say something about what is behind it.
    private func shortcut(_ title: String, _ icon: String, note: String = "") -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.footnote).foregroundStyle(Color.accentColor)
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                .lineLimit(1)
            if !note.isEmpty {
                Text(note).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(Capsule().fill(Color(.secondarySystemGroupedBackground)))
    }

    /// How long ago the last thing happened. Empty on an account where nothing
    /// has, rather than a chip that says "never".
    private var latestActivity: String {
        guard let newest = data?.recentAuditEvents.first else { return "" }
        return relativeTime(newest.timestamp)
    }

    /// The top of the screen, and now the only thing at the top of it.
    ///
    /// This was two lines under a large "Home" title: "Namaste, Sankara" over
    /// "Good morning · శుభోదయం". Three headings before a single fact — the
    /// navigation bar naming a tab the tab bar had already named, then a
    /// greeting, then the same greeting again in the other register.
    private var greeting: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(name.isEmpty ? timeOfDay.english : "\(timeOfDay.english), \(callingName)")
                .font(.title2.weight(.semibold))
            Text(timeOfDay.telugu).font(.subheadline).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }

    private var name: String { data?.me?.name ?? "" }

    /// What somebody is actually called.
    ///
    /// "Sankara Reddy Telukutla" is greeted as "Sankara Reddy": in Andhra the
    /// house name is the part that gets dropped in conversation, and the given
    /// name alone was too curt for the top of a person's own records. Names of
    /// one or two parts are left whole — dropping a part there would greet
    /// "Ravi Kumar" as "Ravi".
    private var callingName: String {
        let parts = name.split(separator: " ").map(String.init)
        return parts.count >= 3 ? parts.dropLast().joined(separator: " ") : name
    }

    private var timeOfDay: (english: String, telugu: String) {
        switch Calendar.current.component(.hour, from: Date()) {
        case 4..<12: ("Good morning", "శుభోదయం")
        case 12..<17: ("Good afternoon", "శుభ మధ్యాహ్నం")
        case 17..<21: ("Good evening", "శుభ సాయంత్రం")
        default: ("Working late", "శుభ రాత్రి")
        }
    }

    /// Totalled per kind, each in its own unit, with the passbooks they sit on.
    private var categories: [KindSummary] {
        guard let h = holdings else { return [] }
        var rows: [KindSummary] = []

        /// Distinct passbooks these parcels are filed under. A `passbookId`
        /// pointing at a passbook that is not there is a broken link, not a
        /// fifth khata, so it is not counted — the orphans are reported on the
        /// attention card instead.
        let known = Set(h.passbooks.map(\.id))
        func passbookCount(_ parcels: [Parcel]) -> Int {
            Set(parcels.map(\.passbookId).filter { known.contains($0) }).count
        }

        // Farmland: acres, from parcels.
        let agri = h.parcels.filter { !$0.classification.lowercased().contains("non") }
        if !agri.isEmpty {
            rows.append(.init(kind: .farmland,
                              amount: agri.reduce(0) { $0 + $1.extent },
                              count: agri.count,
                              passbooks: passbookCount(agri)))
        }
        // Non-agricultural parcels are sites held under a passbook — square
        // yards, like any other site.
        let nonAgri = h.parcels.filter { $0.classification.lowercased().contains("non") }

        // Properties, grouped by what they actually are.
        var byKind: [HoldingKind: [Property]] = [:]
        for p in h.properties {
            byKind[HoldingKind.of(propertyType: p.type), default: []].append(p)
        }
        // Fold the non-agricultural parcels in with the sites.
        for kind in [HoldingKind.plot, .home, .commercial] {
            let items = byKind[kind] ?? []
            let extraParcels = kind == .plot ? nonAgri : []
            guard !items.isEmpty || !extraParcels.isEmpty else { continue }

            var total = 0.0
            for p in items {
                if let a = headlineArea(propertyType: p.type,
                                        landArea: p.landArea, landUnit: p.landUnit,
                                        builtupArea: p.builtupArea, builtupUnit: p.builtupUnit) {
                    total += convert(a.value, from: a.unit, to: kind.unit)
                }
            }
            // A parcel's extent is acres; convert into the kind's unit.
            for p in extraParcels { total += fromAcres(p.extent, kind.unit) }

            rows.append(.init(kind: kind, amount: total,
                              count: items.count + extraParcels.count,
                              // Only the parcels carry a khata. A flat bought
                              // on a registered deed has none, and printing "0
                              // passbooks" under it would read as something
                              // missing rather than something inapplicable.
                              passbooks: passbookCount(extraParcels)))
        }
        // A FIXED order — land, plots, homes, commercial. Sorting by value
        // made the cards swap places whenever a figure was entered, and a
        // dashboard whose tiles move is one you have to read every time
        // instead of glance at.
        let order: [HoldingKind] = [.farmland, .plot, .home, .commercial]
        return rows.sorted {
            (order.firstIndex(of: $0.kind) ?? 9) < (order.firstIndex(of: $1.kind) ?? 9)
        }
    }

    private var villages: [VillageChart.Slice] {
        guard let h = holdings else { return [] }
        var totals: [String: Double] = [:]
        for p in h.parcels {
            // A parcel whose passbook is missing is a broken link, not a
            // village called "Unfiled": it is left off the chart rather than
            // charted under a place name that does not exist.
            guard let v = h.passbooks.first(where: { $0.id == p.passbookId })?.village,
                  !v.isEmpty else { continue }
            totals[v, default: 0] += p.extent
        }
        return totals.sorted { $0.value > $1.value }
            .map { VillageChart.Slice(village: $0.key, acres: $0.value) }
    }

    private func load() async {
        async let dash = app.load(Queries.dashboard, as: DashboardResponse.self)
        async let held = app.load(Queries.holdings, as: HoldingsResponse.self)
        async let docs = app.load(Queries.documents, as: DocumentsResponse.self)
        data = await dash
        holdings = await held
        requests = (await app.load(Queries.workRequests,
                                   as: WorkRequestsResponse.self))?.workRequests ?? []
        documentsSeen = (await docs?.registeredDocuments ?? []).count
        await app.loadFavourites()
        // Keep the widget in step with what the app just loaded.
        if let d = data {
            SharedSnapshot.write(acres: d.dashboardStats.totalExtent,
                                 parcels: d.dashboardStats.totalParcels,
                                 passbooks: d.dashboardStats.totalPassbooks,
                                 unpinned: holdings?.parcels.filter { parseGeoPoint($0.geoPoint) == nil }.count ?? 0)
        }
    }
}

/// ₹67.5L / ₹1.2Cr — a dashboard tile has no room for eight digits.
func compactRupees(_ amount: Double) -> String {
    switch amount {
    case 1_00_00_000...: String(format: "₹%.2fCr", amount / 1_00_00_000)
    case 1_00_000...: String(format: "₹%.1fL", amount / 1_00_000)
    case 1_000...: String(format: "₹%.0fK", amount / 1_000)
    default: rupees(amount)
    }
}

struct ActivityRow: View {
    let event: AuditEvent

    /// The login handle is not a name; show the person it belongs to.
    private var actorName: String {
        let local = event.actor.split(separator: "@").first.map(String.init) ?? event.actor
        return local.replacingOccurrences(of: ".", with: " ")
            .split(separator: " ").map { $0.capitalized }.joined(separator: " ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Destructive rows differ by SHAPE as well as colour — colour alone
            // is invisible to a large minority of people.
            // The actor's face, with the severity marked on it by SHAPE as
            // well as colour — colour alone is invisible to a large minority.
            Avatar(name: actorName, size: 28, isSelf: true)
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: isDestructive(event.action) ? "minus.circle.fill" : "checkmark.circle.fill")
                        .font(.system(size: 11))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, isDestructive(event.action) ? .red : .green)
                        .offset(x: 3, y: 3)
                }
            VStack(alignment: .leading, spacing: 2) {
                let entity = eventEntity(action: event.action, target: event.target, details: event.details)
                Text(actionLabel(event.action) + (entity.isEmpty ? "" : " · \(entity)"))
                    .font(.subheadline)
                Text(relativeTime(event.timestamp)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }
}
