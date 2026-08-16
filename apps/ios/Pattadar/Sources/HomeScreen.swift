import PattadarKit
import SwiftUI

/// Home (M01): what needs you, then what you own.
///
/// The order IS the design — the outbox and waiting readings first (they ask
/// for a decision), then the three figures, then worth, then the two doors
/// people actually come to open, then the obligations with dates on them,
/// then what is wrong, then where you last were.
struct HomeScreen: View {
    @Environment(AppModel.self) private var app
    @State private var data: DashboardResponse?
    @State private var holdings: HoldingsResponse?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Space.lg) {
                    if data != nil && !hasHoldings {
                        // No land on file — a beginning, not a fault. But the
                        // beginning must not HIDE what does exist: readings
                        // waiting for review and documents already in the
                        // vault survive an emptied portfolio, and a screen
                        // that pretends otherwise looks broken.
                        header
                        outbox
                        if !app.pendingReviews.isEmpty {
                            ReviewCard(entries: app.pendingReviews,
                                       onOpen: { reviewToAdd = $0 },
                                       onDiscard: { app.discardReview($0.id) })
                        }
                        WelcomeState(name: firstName,
                                     onScan: { showAdd = true },
                                     onManual: { showAdd = true },
                                     showsGreeting: false)
                        if documentsSeen > 0 {
                            Button { app.selectedTab = .documents } label: {
                                shortcut("\(documentsSeen) document\(documentsSeen == 1 ? "" : "s") in the vault",
                                         "doc.text.fill")
                            }
                        }
                    } else if data != nil {
                        header
                        outbox

                        // Read, but not yet yours.
                        //
                        // A read that finishes while the app is closed used to
                        // vanish with the process: the notification arrived, the
                        // app was opened, and the property was not there. These
                        // wait here until they are saved or thrown away — above
                        // everything, because they are the one thing on this
                        // screen asking for a decision.
                        if !app.pendingReviews.isEmpty {
                            ReviewCard(entries: app.pendingReviews,
                                       onOpen: { reviewToAdd = $0 },
                                       onDiscard: { app.discardReview($0.id) })
                        }

                        // The land first, in one card of three figures. Each
                        // column opens the list it counts — a summary you
                        // cannot open is a dead end.
                        StatTripleCard(totals: categories) { filter in
                            app.holdingsFilter = filter
                            app.selectedTab = .properties
                        }

                        // Worth today (M01). Hidden until a value has been
                        // recorded somewhere: a worth card of zeros would
                        // lend a guess the extents' authority.
                        if worth > 0 || paid > 0 {
                            WorthTodayCard(worth: worth, paid: paid,
                                           costsThisYear: spentThisFY,
                                           loans: loans, mix: portfolioMix)
                        }

                        quickActions

                        if !upcomingRows.isEmpty {
                            UpcomingCard(rows: upcomingRows)
                        }
                        if !attentionRows.isEmpty {
                            NeedsAttentionCard(rows: attentionRows)
                        }
                        if !recentHoldings.isEmpty {
                            RecentlyOpenedCard(items: recentHoldings) {
                                app.holdingsFilter = .all
                                app.selectedTab = .properties
                            }
                        }
                    } else if let failure = ownFailure {
                        // THIS screen's own dashboard query failed — not
                        // whatever the app-wide `lastFailure` happened to be
                        // holding. That field is written by every concurrent
                        // query, so a sibling succeeding from the cache erased
                        // the real failure, and a tab switch cancelling a load
                        // wrote "Stopped." over it. The screen reads only its
                        // own outcome now.
                        LoadFailure(message: failure)
                    } else {
                        ProgressView().padding(.top, 40)
                    }
                }
                .padding(.horizontal, Space.lg)
                // Clear of the floating tab bar, which draws OVER the scroll
                // view: without this the last card is half-covered at the end
                // of the list and looks clipped rather than scrollable.
                .padding(.bottom, 40)
            }
            .background(Palette.ground)
            // No navigation bar on this screen.
            //
            // A large "Home" title cost about 60 points at the top to repeat
            // the word already lit up in the tab bar, and pushed everything
            // after it that much further down. Pushed screens still get their
            // own bars; only the root goes without.
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showAdd) { AddPropertyScreen().onDisappear { Task { await load() } } }
            .sheet(isPresented: $showAddPassbook) {
                AddPassbookScreen().onDisappear { Task { await load() } }
            }
            .sheet(isPresented: $showSearch) {
                SearchScreen(holdings: allHoldings, documents: documents)
            }
            .sheet(isPresented: $showAccount) {
                NavigationStack {
                    AccountScreen().toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") { showAccount = false }
                        }
                    }
                }
            }
            .sheet(isPresented: $showCustomise) {
                NavigationStack {
                    CustomiseTabsScreen().toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") { showCustomise = false }
                        }
                    }
                }
            }
            .sheet(item: $reviewToAdd) { entry in
                AddHoldingScreen(passbooks: [], parcels: holdings?.parcels ?? [], review: entry)
                    .onDisappear { Task { await load() } }
            }
            .refreshable { await load() }
            .task { avatar = Identity.avatar(); await load() }
        }
    }

    // MARK: - Header (M01)

    /// The brand wordmark in serif, your own face on the LEFT (the way to the
    /// account), search and the overflow on the right. The greeting moved out
    /// with the M-series: a records app opens on the records.
    private var header: some View {
        HStack(spacing: Space.md) {
            Button { showAccount = true } label: {
                if let avatar {
                    Image(uiImage: avatar)
                        .resizable().scaledToFill()
                        .frame(width: 40, height: 40)
                        .clipShape(Circle())
                } else {
                    Text(initial)
                        .font(.scaled(17, weight: .semibold))
                        .foregroundStyle(Color.accentColor)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Palette.accentWash))
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Your account")

            Text("Pattadar")
                .font(.recordTitle)

            Spacer(minLength: Space.sm)

            Button { showSearch = true } label: {
                Image(systemName: "magnifyingglass")
                    .font(.scaled(18, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .minimumTouchTarget()
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Search")

            Menu {
                Button { showAddPassbook = true } label: {
                    Label("Add a passbook", systemImage: "text.book.closed")
                }
                Button { showAdd = true } label: {
                    Label("Add a property", systemImage: "building.2")
                }
                Divider()
                Button { showCustomise = true } label: {
                    Label("Customise tabs", systemImage: "slider.horizontal.3")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.scaled(18, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .minimumTouchTarget()
            }
            .accessibilityLabel("More options")
        }
        .padding(.top, Space.xs)
    }

    /// What is queued and uploadable — readings still waiting for review are
    /// not "going up", they are waiting for YOU, and the ReviewCard says so.
    @ViewBuilder
    private var outbox: some View {
        let uploadable = SyncEngine.shared.pendingFilings.filter { !$0.needsReview }
        let photos = uploadable.filter { $0.photo != nil }.count
        OutboxStrip(filings: uploadable.count - photos, photos: photos) {
            SyncEngine.shared.kick(.userPull)
        }
    }

    /// The two doors people come to open (M01): file a passbook, file a
    /// property. 56pt tiles — the comp's size, above the 44pt floor.
    private var quickActions: some View {
        HStack(alignment: .top, spacing: Space.xxxl) {
            quickAction("Passbook", icon: "text.book.closed.fill") { showAddPassbook = true }
            quickAction("Property", icon: "house.fill") { showAdd = true }
            Spacer()
        }
        .padding(.horizontal, Space.xs)
    }

    private func quickAction(_ title: String, icon: String,
                             action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: Space.sm) {
                Image(systemName: icon)
                    .font(.scaled(22, weight: .medium))
                    .foregroundStyle(Palette.accentInk)
                    .frame(width: 56, height: 56)
                    .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                        .fill(Palette.accent))
                Text(title)
                    .font(.footnote).foregroundStyle(.primary)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add a \(title.lowercased())")
    }

    // MARK: - State

    @State private var documentsSeen = 0
    /// Why THIS screen has no dashboard, if it has none. Nil means either not
    /// loaded yet or loaded fine — `data` says which. Cancellation leaves it
    /// nil, because a view being torn down has nothing to report.
    @State private var ownFailure: String?
    @State private var documents: [RegisteredDocument] = []
    @State private var expenses: [LandExpense] = []
    @State private var showAdd = false
    @State private var showAddPassbook = false
    @State private var showSearch = false
    @State private var showAccount = false
    @State private var showCustomise = false
    @State private var avatar: UIImage?
    @State private var reviewToAdd: ReviewQueue.Entry?

    /// Any LAND on file. Documents deliberately do not count: an account
    /// with vault papers but no holdings still needs to be shown the way in,
    /// not a dashboard of nothing.
    private var hasHoldings: Bool {
        let h = holdings
        return !(h?.parcels.isEmpty ?? true)
            || !(h?.properties.isEmpty ?? true)
            || !(h?.passbooks.isEmpty ?? true)
    }

    private var name: String { data?.me?.name ?? "" }

    private var firstName: String {
        name.split(separator: " ").first.map(String.init) ?? ""
    }

    private var initial: String {
        firstName.first.map { String($0).uppercased() } ?? "•"
    }

    /// Every holding as the list/map type — parcels joined to their passbooks.
    private var allHoldings: [Holding] {
        guard let h = holdings else { return [] }
        let parcels = h.parcels.map { p in Holding.parcel(p, h.passbooks.first { $0.id == p.passbookId }) }
        return parcels + h.properties.map { Holding.property($0) }
    }

    /// One chip in the welcome state, saying what already exists.
    private func shortcut(_ title: String, _ icon: String) -> some View {
        HStack(spacing: Space.sm) {
            Image(systemName: icon).font(.footnote).foregroundStyle(Color.accentColor)
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                .lineLimit(1)
        }
        .padding(.horizontal, Space.lg).padding(.vertical, Space.md)
        .background(Capsule().fill(Palette.card))
    }

    // MARK: - Money (M01 Worth card)

    private var worth: Double {
        guard let h = holdings else { return 0 }
        return h.parcels.reduce(0) { $0 + $1.marketValue }
            + h.properties.reduce(0) { $0 + $1.marketValue }
    }

    private var paid: Double {
        guard let h = holdings else { return 0 }
        return h.parcels.reduce(0) { $0 + $1.purchasePrice }
            + h.properties.reduce(0) { $0 + $1.purchasePrice }
    }

    /// Loans are recorded on parcels; a mortgaged flat has nowhere to say so
    /// yet, and inventing a field here would not make it true.
    private var loans: Double {
        holdings?.parcels.reduce(0) { $0 + $1.loanAmount } ?? 0
    }

    /// What the worth figure is made of, for the chip row.
    private var portfolioMix: [(kind: HoldingKind, count: Int, noun: String)] {
        categories.compactMap { total in
            guard total.count > 0 else { return nil }
            let noun: String = switch total.kind {
            case .farmland: total.count == 1 ? "farm parcel" : "farm parcels"
            case .plot: total.count == 1 ? "open plot" : "open plots"
            case .home: total.count == 1 ? "flat" : "flats"
            case .commercial: total.count == 1 ? "shop" : "shops"
            }
            return (total.kind, total.count, noun)
        }
    }

    // MARK: - Readiness-derived rows

    /// Each holding assessed against what a buyer's advocate would ask for —
    /// the same checks, fix sheets and copy the holding screens use; this is
    /// only their front door.
    ///
    /// The assessment itself lives in PattadarKit, because the Home Screen
    /// widget shows the same verdict and two copies of these rules would drift.
    private var assessed: [AssessedHolding] {
        guard let h = holdings else { return [] }
        return assessHoldings(parcels: h.parcels, properties: h.properties,
                              passbooks: h.passbooks, documents: documents,
                              favourites: app.favourites,
                              thisYear: Calendar.current.component(.year, from: Date()))
    }

    /// The dated obligations (M01 "Upcoming"): tax behind, EC stale. The
    /// sentences are the Readiness checks' own — no threshold lives here.
    private var upcomingRows: [UpcomingRow] {
        var rows: [UpcomingRow] = []
        for a in assessed {
            guard let holding = holding(forLineID: a.line.id) else { continue }
            for f in a.readiness.failures where !f.blocking && (f.id == "tax" || f.id == "ec") {
                rows.append(UpcomingRow(
                    id: a.line.id + ":" + f.id,
                    icon: f.id == "tax" ? "receipt" : "clock.arrow.circlepath",
                    title: f.problem,
                    subtitle: [a.line.name, a.line.place].filter { !$0.isEmpty }
                        .joined(separator: " · "),
                    holding: holding))
            }
        }
        return Array(rows.prefix(4))
    }

    /// The blocking failures (M01 "Needs attention") — what stops a sale.
    private var attentionRows: [UpcomingRow] {
        assessed.compactMap { a -> UpcomingRow? in
            guard let worst = a.readiness.blocking.first,
                  let holding = holding(forLineID: a.line.id) else { return nil }
            return UpcomingRow(
                id: a.line.id + ":blocked",
                icon: "exclamationmark.triangle.fill",
                title: a.line.name,
                subtitle: [worst.problem, a.line.place].filter { !$0.isEmpty }
                    .joined(separator: " · "),
                holding: holding)
        }
        .prefix(4).map { $0 }
    }

    /// `HoldingLine.id` is "parcel:<uuid>" / "property:<uuid>" — the same key
    /// favourites and widget deep links use. Resolved against the loaded list.
    private func holding(forLineID lineID: String) -> Holding? {
        let parts = lineID.split(separator: ":", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { return nil }
        return allHoldings.first { $0.entityType == parts[0] && $0.entityId == parts[1] }
    }

    /// The doors most recently walked through, resolved against what still
    /// exists — a deleted holding silently leaves the card.
    private var recentHoldings: [Holding] {
        app.recents.compactMap { key -> Holding? in
            let parts = key.split(separator: ":", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { return nil }
            return allHoldings.first { $0.entityType == parts[0] && $0.entityId == parts[1] }
        }
        .prefix(3).map { $0 }
    }

    /// This financial year's spend, for the worth card. April to March — the
    /// year every receipt and tax demand here runs on.
    private var spentThisFY: Double {
        let cal = Calendar.current
        let now = Date()
        let year = cal.component(.year, from: now)
        let fyStartYear = cal.component(.month, from: now) >= 4 ? year : year - 1
        let start = cal.date(from: DateComponents(year: fyStartYear, month: 4, day: 1))!
        return expenses.filter { e in
            guard let d = ISO8601DateFormatter().date(from: e.spentOn)
                    ?? parseAuditTime(e.spentOn) else { return false }
            return d >= start
        }.reduce(0) { $0 + $1.amount }
    }

    /// Totalled per kind, each in its own unit, with the passbooks they sit
    /// on. The rules are in PattadarKit so the widget totals the same way.
    private var categories: [KindTotal] {
        guard let h = holdings else { return [] }
        return landTotals(parcels: h.parcels, properties: h.properties,
                          passbooks: h.passbooks)
    }

    private func load() async {
        async let dash = app.fetch(Queries.dashboard, as: DashboardResponse.self)
        async let held = app.load(Queries.holdings, as: HoldingsResponse.self)
        async let docs = app.load(Queries.documents, as: DocumentsResponse.self)
        async let spend = app.load(Queries.landExpenses, as: LandExpensesResponse.self)
        let dashboard = await dash
        data = dashboard.value
        ownFailure = dashboard.failure
        holdings = await held
        documents = await docs?.registeredDocuments ?? []
        documentsSeen = documents.count
        expenses = (await spend)?.landExpenses ?? []
        await app.loadFavourites()
        // Keep the widgets in step with what the app just loaded. This is the
        // ONLY moment they learn anything: a widget has no credentials and no
        // time budget to fetch, so whatever is not written here cannot be
        // drawn on the Home Screen.
        if let d = data, let h = holdings {
            SharedSnapshot.write(.build(stats: d.dashboardStats, holdings: h,
                                        documents: documents,
                                        favourites: app.favourites,
                                        waiting: app.pendingReviews.count))
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
        HStack(alignment: .top, spacing: Space.md) {
            // The actor's face, with the severity marked on it by SHAPE as
            // well as colour — colour alone is invisible to a large minority.
            Avatar(name: actorName, size: 28, isSelf: true)
                .overlay(alignment: .bottomTrailing) {
                    Image(systemName: isDestructive(event.action) ? "minus.circle.fill" : "checkmark.circle.fill")
                        .font(.scaled(11))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, isDestructive(event.action) ? Palette.danger : Palette.success)
                        .offset(x: 3, y: 3)
                }
            VStack(alignment: .leading, spacing: Space.hair) {
                let entity = eventEntity(action: event.action, target: event.target, details: event.details)
                Text(actionLabel(event.action) + (entity.isEmpty ? "" : " · \(entity)"))
                    .font(.subheadline)
                Text(relativeTime(event.timestamp)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }
}
