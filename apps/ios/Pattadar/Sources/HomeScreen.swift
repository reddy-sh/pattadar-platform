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
                VStack(spacing: Space.lg) {
                    if data != nil && !hasHoldings {
                        // No land on file — a beginning, not a fault. But the
                        // beginning must not HIDE what does exist: readings
                        // waiting for review and documents already in the
                        // vault survive an emptied portfolio, and a screen
                        // that pretends otherwise looks broken.
                        greeting
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
                        greeting

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
                        // The land first. These are the numbers the app exists
                        // to tell you, and they were sitting below a row of
                        // navigation chips — the answer below the menu. Full
                        // width and equal weight; none is subordinate.
                        // Each card is the door to its own list: the acres
                        // open Properties filtered to agricultural, the sites
                        // to plots. A summary you cannot open is a dead end.
                        ForEach(categories) { c in
                            Button {
                                app.holdingsFilter = c.kind == .farmland ? .agricultural : .plots
                                app.selectedTab = .properties
                            } label: {
                                KindCard(kind: c.kind, amount: c.amount,
                                         count: c.count, passbooks: c.passbooks)
                            }
                            .buttonStyle(.plain)
                        }

                        // What the holdings NEED, after what they are — the
                        // top-level door to the fix sheets that live on each
                        // holding. Hidden when every check passes: a green
                        // card saying "all fine" is noise.
                        if readinessItems.contains(where: { !$0.readiness.isReady }) {
                            RecordReadyCard(score: overallReadiness,
                                            blurb: readinessBlurb(readinessItems),
                                            blockingCount: readinessItems.filter { !$0.readiness.blocking.isEmpty }.count,
                                            verdict: overallVerdict) {
                                app.holdingsFilter = .needsAttention
                                app.selectedTab = .properties
                            }
                        }

                        // All of it, on one map — pins and surveyed outlines
                        // together. For a land app this is the most glanceable
                        // card Home can carry, and it was three taps deep.
                        HomeMapCard(holdings: allHoldings)

                        // The shortcut row, after the facts.
                        //
                        // These are doors, not answers — where are my papers,
                        // who is in the family record, who holds what, what has
                        // this cost. Scrolls horizontally so adding a seventh
                        // does not shrink the others into unreadable chips.
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Space.md) {
                                Button { app.selectedTab = .documents } label: {
                                    shortcut("Documents", "doc.text.fill",
                                             note: data.map { "\(documentCount($0))" } ?? "")
                                }
                                Button { app.openFamily = true; app.selectedTab = .you } label: {
                                    shortcut("Family", "person.2.fill",
                                             note: (data?.dashboardStats.totalGroups).map { "\($0)" } ?? "")
                                }
                                NavigationLink { HoldersScreen(holdings: holdings) } label: {
                                    shortcut("Who holds what", "person.text.rectangle.fill")
                                }
                                NavigationLink { SpendScreen() } label: {
                                    // This financial year's total, answered on
                                    // the chip like Documents and Timeline.
                                    shortcut("Spend", "indianrupeesign.circle.fill",
                                             note: spentThisFY > 0 ? compactRupees(spentThisFY) : "")
                                }
                                // The activity feed lives entirely behind this
                                // chip; what the old card on Home was good for —
                                // "has anything happened" — is the age of the
                                // newest entry, kept here.
                                NavigationLink { ActivityScreen() } label: {
                                    shortcut("Timeline", "clock.arrow.circlepath", note: latestActivity)
                                }
                            }
                            .padding(.horizontal, Space.hair)
                        }

                        if !starred.isEmpty {
                            FavouritesCard(items: starred)
                        }
                        // Nothing else. The document and family counts moved
                        // into the shortcut row; the village chart went the way
                        // of the readiness ring and the attention list — Home
                        // states what you have, and everything past the two
                        // cards was a second screen's worth of restating it.
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
    /// Why THIS screen has no dashboard, if it has none. Nil means either not
    /// loaded yet or loaded fine — `data` says which. Cancellation leaves it
    /// nil, because a view being torn down has nothing to report.
    @State private var ownFailure: String?
    @State private var documents: [RegisteredDocument] = []
    @State private var expenses: [LandExpense] = []
    @State private var showAdd = false
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

    private var firstName: String {
        name.split(separator: " ").first.map(String.init) ?? ""
    }

    /// Every holding as the list/map type — parcels joined to their passbooks.
    private var allHoldings: [Holding] {
        guard let h = holdings else { return [] }
        let parcels = h.parcels.map { p in Holding.parcel(p, h.passbooks.first { $0.id == p.passbookId }) }
        return parcels + h.properties.map { Holding.property($0) }
    }

    /// What you starred, at the top of Home — the point of starring is that
    /// these are the ones you come back to.
    private var starred: [Holding] {
        allHoldings.filter { app.isFavourite($0.entityType, $0.entityId) }
    }

    /// 🙏 Namaste — the greeting people here actually use, and the emoji that
    /// carries it. Time-of-day so opening the app twice in a day is not the
    /// same sentence twice.
    /// One chip in the shortcut row, with an optional second phrase set quieter
    /// — used where the chip can say something about what is behind it.
    private func shortcut(_ title: String, _ icon: String, note: String = "") -> some View {
        HStack(spacing: Space.sm) {
            Image(systemName: icon).font(.footnote).foregroundStyle(Color.accentColor)
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                .lineLimit(1)
            if !note.isEmpty {
                Text(note).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
        }
        .padding(.horizontal, Space.lg).padding(.vertical, Space.md)
        .background(Capsule().fill(Palette.card))
    }

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

    private var readinessItems: [(name: String, readiness: Readiness)] {
        assessed.map { (name: $0.line.name, readiness: $0.readiness) }
    }

    /// The worst verdict across the portfolio, by the same rule one holding
    /// uses. A single blocked holding blocks the whole card: an amber
    /// dashboard over a field that cannot be sold is a comfortable lie.
    private var overallVerdict: ReadinessVerdict {
        if readinessItems.contains(where: { $0.readiness.verdict == .blocked }) { return .blocked }
        return readinessItems.allSatisfy(\.readiness.isReady) ? .ready : .untidy
    }

    /// The share of ALL checks across ALL holdings, not an average of
    /// averages — one perfect parcel must not paper over four broken ones.
    private var overallReadiness: Int {
        let checks = assessed.reduce(0) { $0 + $1.line.checks }
        let passed = assessed.reduce(0) { $0 + $1.line.passed }
        guard checks > 0 else { return 0 }
        return Int((Double(passed) / Double(checks)) * 100)
    }

    /// This financial year's spend, for the chip. April to March — the year
    /// every receipt and tax demand here runs on.
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

    /// How long ago the last thing happened. Empty on an account where nothing
    /// has, rather than a chip that says "never".
    private var latestActivity: String {
        guard let newest = data?.recentAuditEvents.first else { return "" }
        return relativeTime(newest.timestamp)
    }

    /// The top of the screen: the date in small type, the greeting in serif,
    /// and your own face on the right — which is the way to the account.
    ///
    /// The face is the point. The account had sunk to the last tab, and every
    /// app this person already uses puts *them* in the top corner; a person
    /// looking for "me" looks there first. The Telugu line went in the same
    /// pass — it said "good afternoon" directly beneath "Good afternoon",
    /// the same greeting twice in two scripts — and the date took its place,
    /// which at least says something the greeting does not.
    private var greeting: some View {
        HStack(alignment: .center, spacing: Space.md) {
            VStack(alignment: .leading, spacing: Space.hair) {
                Text(dateLine)
                    .font(.footnote).foregroundStyle(.secondary)
                Text(name.isEmpty ? "\(timeOfDay)." : "\(timeOfDay), \(callingName).")
                    // Serif, like every headline in the design language — the
                    // register of a printed record, not an app's chrome.
                    .font(.scaled(30, weight: .semibold, design: .serif))
                    .minimumScaleFactor(0.75)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Button {
                app.selectedTab = .you
            } label: {
                Avatar(name: name, size: 42, isSelf: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Your account")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Space.xs)
    }

    /// "Saturday, 1 August" — the one line of the header that changes daily.
    private var dateLine: String {
        let f = DateFormatter()
        f.dateFormat = "EEEE, d MMMM"
        return f.string(from: Date())
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

    private var timeOfDay: String {
        switch Calendar.current.component(.hour, from: Date()) {
        case 4..<12: "Good morning"
        case 12..<17: "Good afternoon"
        case 17..<21: "Good evening"
        default: "Working late"
        }
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
            // Destructive rows differ by SHAPE as well as colour — colour alone
            // is invisible to a large minority of people.
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
