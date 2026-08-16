import PattadarKit
import SwiftUI
import UIKit
import UserNotifications

@main
struct PattadarApp: App {
    @State private var model = AppModel()
    @State private var showOnboarding = false
    // A background upload finishing while the app is dead RELAUNCHES it, and
    // iOS delivers the result only through the app delegate. Without this hook
    // the transfer completes and the answer is dropped on the floor — which is
    // indistinguishable, to the person waiting, from the failure this whole
    // change exists to fix.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            RootTabs()
                .environment(model)
                // A tap on a widget arrives here as a URL. Anything the widget
                // vocabulary does not recognise is left alone — the sign-in
                // callback uses this scheme too.
                .onOpenURL { model.open(WidgetLink($0)) }
                // A read that outlived the last launch is picked back up rather
                // than leaving an idle card over a running upload.
                .task { await model.adoptRunningRead() }
                .fullScreenCover(isPresented: $showOnboarding) {
                    OnboardingScreen().environment(model)
                }
                .task {
                    if !Onboarding.hasSeen { showOnboarding = true }
                }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        // Held until the session says it has handed everything over; calling it
        // late is a watchdog kill, and never calling it stops future launches.
        Task { @MainActor in
            BackgroundRead.shared.systemCompletion = completionHandler
        }
    }
}

/// Where the app points and who it believes it is.
///
/// `x-user-id` is the trust header the API still uses. It becomes a Cognito
/// Bearer token in the same change that adds one to the API — not before, or
/// this client locks itself out of a backend with no Cognito path yet.
/// Main-actor isolated, which it always was in practice: every property here is
/// read and written by views. Stating it lets the model talk to the background
/// reader without hopping actors on each call.
@MainActor
@Observable
final class AppModel {
    var api: PattadarAPI
    /// Set once and shared, so every screen reports the same failure rather
    /// than each inventing its own wording for the same dead server.
    var lastFailure: String?
    /// When the data on screen was stored, if it came from the offline cache
    /// rather than the wire. Nil means live. Drives one quiet "as of …" line —
    /// stale data is said plainly, never dressed up as fresh or as an error.
    private(set) var servedStaleAt: Date?

    // MARK: - Reading a document

    /// Where a document read has got to.
    ///
    /// Owned by the model, NOT by the view, so dismissing the sheet does not
    /// cancel it. The upload is quick; the model's read is thirty to ninety
    /// seconds, and holding someone on a screen for that is the wrong trade
    /// when the work is happening on a server anyway.
    enum ReadState: Equatable {
        case idle
        case sending(Double)
        case reading(Int)
        case done
        case failed(String)
    }

    var readState: ReadState = .idle
    /// The finished read, kept so returning to the form still finds it.
    var readResult: ScanResult?
    private var readTask: Task<Void, Never>?

    var isReading: Bool {
        if case .sending = readState { return true }
        if case .reading = readState { return true }
        return false
    }

    /// Who asked for the current read.
    ///
    /// The result lives on the model so that leaving a screen mid-scan does not
    /// cancel a 90-second upload. That made it ownerless: ANY scan card that
    /// appeared afterwards adopted the finished read and filled its form with
    /// last time's document, and the only escape was force-quitting the app.
    /// SwiftUI runs a child's `onAppear` before its parent's, so clearing it
    /// from the parent lost the race. A read is now claimed by the card that
    /// started it and is invisible to every other one.
    private(set) var readOwner: UUID?

    func startRead(_ endpoint: PattadarAPI.ExtractionEndpoint, fileURL: URL, name: String,
                   owner: UUID? = nil) {
        readOwner = owner
        readTask?.cancel()
        readResult = nil
        readState = .sending(0)
        // Asked at the one moment it is obviously useful: a wait long enough
        // that leaving is the reasonable thing to do.
        Task { _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge]) }

        let reader = BackgroundRead.shared
        reader.onProgress = { [weak self] fraction in
            guard let self else { return }
            if fraction >= 1 {
                if case .sending = self.readState { self.readState = .reading(0) }
            } else {
                self.readState = .sending(fraction)
            }
        }
        reader.onFinished = { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let fields):
                // This result was ALSO queued for review (in case nobody was
                // here). Somebody IS here — the flow that saves from this scan
                // completes that entry, so it never haunts Home afterwards.
                self.reviewInProgress = BackgroundRead.shared.lastEnqueuedReviewID
                self.readResult = ScanResult(fields: fields, fileURL: fileURL, originalName: name)
                self.readState = .done
            case .failure(let error):
                if case PattadarAPI.APIError.cancelled = error { self.readState = .idle }
                else { self.readState = .failed(String(describing: error)) }
            }
        }

        Task {
            // A fresh token before a long upload: the read may outlive this
            // process, and nobody will be around to answer a 401.
            await freshenAuth()
            do {
                try reader.start(endpoint: endpoint, config: api.config, fileURL: fileURL, name: name)
            } catch {
                readState = .failed("Couldn’t prepare the file — \(error.localizedDescription)")
            }
        }

        // The elapsed counter is the only part that has to live in this process;
        // the transfer itself now outlives it.
        readTask = Task {
            let began = Date()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                if case .reading = readState {
                    readState = .reading(Int(Date().timeIntervalSince(began)))
                }
            }
        }
    }

    /// A read that was still running when the app was last closed.
    ///
    /// Without this a relaunch shows an idle scan card while the upload is still
    /// going, and the person scans the same document a second time.
    func adoptRunningRead() async {
        guard readResult == nil, !isReading else { return }
        let reader = BackgroundRead.shared
        guard let p = await reader.resumeIfRunning(config: api.config) else { return }
        let file = URL(fileURLWithPath: p.documentPath)
        reader.onFinished = { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let fields):
                self.readResult = ScanResult(fields: fields, fileURL: file,
                                             originalName: p.originalName)
                self.readState = .done
            case .failure(let error):
                self.readState = .failed(String(describing: error))
            }
        }
        reader.onProgress = { [weak self] fraction in
            guard let self else { return }
            self.readState = fraction >= 1 ? .reading(0) : .sending(fraction)
        }
        readState = .reading(Int(Date().timeIntervalSince(p.startedAt)))
    }

    func cancelRead() {
        readTask?.cancel()
        readTask = nil
        // The transfer is out of process, so cancelling the Swift task alone
        // would leave it running and charge for a read nobody wanted.
        BackgroundRead.shared.cancelAll()
        readState = .idle
    }

    /// Which tab is showing.
    ///
    /// Held here so a figure on the dashboard can open the list it counts. A
    /// count you cannot tap is a dead end — the number tells you something is
    /// there and then refuses to show it to you.
    enum Tab: Hashable { case home, properties, add, family, documents, you }
    var selectedTab: Tab = .home
    /// A tab you LEFT starts over. Changing a tab's version rebuilds its
    /// screen — offscreen, while you are elsewhere — so coming back always
    /// lands on the tab's first page, never a detail from an earlier visit
    /// (the founder's rule, 10 Aug: tabs are places, and a place has a door).
    private(set) var tabVersions: [Tab: UUID] = [
        .home: UUID(), .properties: UUID(), .documents: UUID(), .you: UUID(),
    ]
    func restartTab(_ tab: Tab) { tabVersions[tab] = UUID() }

    /// What the Properties list should show when something else opens it.
    /// Consumed once, so returning to the tab later does not re-apply it.
    var holdingsFilter: HoldingFilter?

    /// Family lost its tab to the filing button. Anything that used to send
    /// somebody there now asks the You screen to present it, so heirs and
    /// invitations are still one tap from the card that names them.
    var openFamily = false

    /// Set by the introduction's last slide. Consumed once, for the same
    /// reason: an Add sheet that reopens every time you visit the tab is a
    /// trap, not a shortcut.
    var requestAddHolding = false

    /// The filing sheet, asked for from anywhere — the centre of the tab bar,
    /// a widget, or the Control Centre button on a locked phone. One flag, so
    /// a second door cannot open a second sheet.
    var requestFiling = false

    /// A holding a widget pointed at, waiting for the Properties list to have
    /// loaded enough to open it. Consumed once, like every request here.
    var pendingHolding: String?

    /// Where a tap on a widget lands.
    func open(_ link: WidgetLink?) {
        // Nil is not a failure: the Cognito sign-in callback comes back on this
        // same scheme and belongs to the auth session, not to this.
        guard let link else { return }
        switch link {
        case .home:
            selectedTab = .home
        case .vault:
            selectedTab = .documents
        case .file:
            requestFiling = true
        case .holdings(let filter):
            holdingsFilter = filter.appFilter
            selectedTab = .properties
        case .holding(let id):
            // The filter is cleared too. A holding opened by name must not
            // arrive hidden behind whichever filter was last in force.
            holdingsFilter = .all
            pendingHolding = id
            selectedTab = .properties
        }
    }

    /// Readings waiting for a person to accept them. Survives relaunch.
    var pendingReviews: [ReviewQueue.Entry] { ReviewQueue.shared.entries }

    /// The queued reading currently being turned into a record, so saving can
    /// take it off the list and cancelling can leave it there.
    var reviewInProgress: String?

    /// Write a corrected extent to whichever kind of holding this is.
    ///
    /// Returns a message on failure and nil on success, so the caller can say
    /// "the document was attached but the extent was not" — a partial result
    /// reported as a whole success is how a record quietly disagrees with its
    /// own paperwork.
    func updateExtent(_ target: LinkTarget, acres: Double, unit: UnitKey) async -> String? {
        switch target {
        case .parcel(let id):
            struct Ack: Decodable { let updateParcel: IDPayload? }
            let vars: [String: any Sendable] = [
                "id": id, "surveyNo": "", "subdivision": "",
                "extent": acres, "unit": unit.label, "classification": "",
            ]
            // Every argument the API declares is optional, and "" means "leave
            // it alone" — so only the extent and its provenance label move.
            return await load(Mutations.updateParcelExtent, variables: vars, as: Ack.self)?
                .updateParcel?.id == nil ? (lastFailure ?? "The parcel was not updated.") : nil
        case .property(let id):
            struct Ack: Decodable { let updateProperty: IDPayload? }
            let sqyd = fromAcres(acres, .sqyd)
            return await load(Mutations.updatePropertyArea,
                              variables: ["id": id, "landArea": sqyd, "landUnit": "Sq.yd"],
                              as: Ack.self)?.updateProperty?.id == nil
                ? (lastFailure ?? "The property was not updated.") : nil
        case .passbook, .none:
            return "There is nothing to update on a passbook."
        }
    }

    /// Saved — the proposal has become a record.
    func completeReview() {
        if let id = reviewInProgress { ReviewQueue.shared.remove(id) }
        reviewInProgress = nil
        clearRead()
    }

    /// Thrown away deliberately, which is different from walking away.
    func discardReview(_ id: String) {
        ReviewQueue.shared.remove(id)
        if reviewInProgress == id { reviewInProgress = nil }
    }

    func clearRead() {
        readState = .idle
        readResult = nil
        readOwner = nil
    }

    /// True only for the card that started the read in flight or on screen.
    func ownsRead(_ id: UUID) -> Bool { readOwner == id }

    /// Discard a FINISHED read, and leave a running one alone.
    ///
    /// The scan card tells people "Sent. You can close this and carry on — we'll
    /// tell you when it's read", which is the whole reason the read lives on the
    /// model instead of in the screen. Closing then called `clearRead()`, which
    /// threw the result away the moment it arrived: the upload kept running, the
    /// notification never had anything to show, and the only way to see the
    /// document again was to scan it a second time. The promise on screen was
    /// false.
    func clearReadIfSettled() {
        guard !isReading else { return }
        clearRead()
    }

    /// Only when the app is not in front of them — a banner about something
    /// already on screen is noise.
    private func notify(title: String, body: String) {
        guard UIApplication.shared.applicationState != .active else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = String(body.prefix(160))
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    /// "parcel:<id>" for everything starred. Held here so a star tapped on the
    /// list is already lit when the detail screen opens, with no round trip.
    var favourites: Set<String> = []

    /// Switch identity without rebuilding the client's other settings.
    func setUser(_ user: String) {
        api = PattadarAPI(config: .init(baseURL: api.config.baseURL, userID: user,
                                        authorization: api.config.authorization))
        favourites = []
        servedStaleAt = nil
        SyncEngine.shared.identityChanged()
    }

    /// Attach a live Cognito token to the client, refreshing it first if it
    /// is about to lapse. Called before requests rather than on a timer — a
    /// timer is one more thing that can be wrong while the phone sleeps.
    func freshenAuth() async {
        let token = await CognitoAuth.shared.validAccessToken() ?? ""
        if api.config.authorization != token {
            api = PattadarAPI(config: .init(baseURL: api.config.baseURL,
                                            userID: api.config.userID,
                                            authorization: token))
        }
    }

    func signOut() {
        // Revoke first, forget after — best-effort, so signing out with no
        // signal still signs out. The response cache goes too: a cache that
        // outlives the session is a copy of someone's land records left on a
        // shared phone.
        Task { await CognitoAuth.shared.signOut() }
        Task { await ResponseCache.shared.clear() }
        Identity.clear()
        favourites = []
        clearRead()
        servedStaleAt = nil
        // Queued filings stay on disk — they are the person's deeds, and the
        // promise is that they sync when THEIR identity is back. But the
        // mirror clears now, so the next person never sees them listed.
        SyncEngine.shared.identityChanged()
    }

    func isFavourite(_ type: String, _ id: String) -> Bool {
        favourites.contains("\(type):\(id)")
    }

    func loadFavourites() async {
        guard let r = await load(Queries.favourites, as: FavouritesResponse.self) else { return }
        favourites = Set(r.favourites.map { "\($0.entityType):\($0.entityId)" })
    }

    /// Optimistic: the star lights immediately and reverts only if the server
    /// disagrees. A star that waits on a round trip feels broken.
    func toggleFavourite(_ type: String, _ id: String) async {
        let key = "\(type):\(id)"
        let wasOn = favourites.contains(key)
        if wasOn { favourites.remove(key) } else { favourites.insert(key) }
        struct Ack: Decodable { let toggleFavourite: Bool }
        guard let ack = await load(Mutations.toggleFavourite,
                                   variables: ["type": type, "id": id], as: Ack.self) else {
            if wasOn { favourites.insert(key) } else { favourites.remove(key) }
            return
        }
        if ack.toggleFavourite { favourites.insert(key) } else { favourites.remove(key) }
    }

    init() {
        // Environment first so a scheme can override for development, then the
        // bundle — which is the ONLY source that survives being launched from
        // the home screen rather than from Xcode.
        func setting(_ env: String, _ plist: String) -> String? {
            if let v = ProcessInfo.processInfo.environment[env], !v.isEmpty { return v }
            if let v = Bundle.main.object(forInfoDictionaryKey: plist) as? String, !v.isEmpty { return v }
            return nil
        }
        let base = setting("PATTADAR_API_URL", "PattadarAPIURL")
            .flatMap(URL.init(string:)) ?? URL(string: "http://127.0.0.1:8080")!
        let fallback = setting("PATTADAR_USER", "PattadarUser") ?? "u01"
        api = PattadarAPI(config: .init(baseURL: base, userID: Identity.current(default: fallback)))

        // The sync engine works FOR this model: it borrows a freshened client
        // for each drain and hands back landed filings for the best-effort
        // extras. Wired here so a filing queued on a previous launch starts
        // moving the moment the app is back.
        SyncEngine.shared.userProvider = { [weak self] in self?.api.config.userID ?? "" }
        SyncEngine.shared.apiProvider = { [weak self] in
            guard let self else { return nil }
            await self.freshenAuth()
            guard let root = Self.gatewayRoot(of: self.api.config.baseURL) else { return nil }
            return (self.api, root)
        }
        SyncEngine.shared.postProcess = { [weak self] filing in
            guard let self else { return }
            let fields = (try? JSONSerialization.jsonObject(
                with: Data(filing.entry.fieldsJSON.utf8))) as? [String: Any] ?? [:]
            await self.adoptGround(from: fields, into: LinkTarget(filing.entry.link))
        }
        SyncEngine.shared.kick(.launch)
    }

    /// scheme://host:port with the proxy path dropped — the storage routes
    /// live at the gateway root, not under /api/gateway/pattadar.
    static func gatewayRoot(of base: URL) -> URL? {
        guard var parts = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return nil }
        parts.path = ""
        parts.query = nil
        return parts.url
    }

    /// File a scanned document and attach it to what it describes.
    ///
    /// One place, because every add-flow needs the same four steps and the RN
    /// app grew three subtly different copies of them.
    ///
    /// Durable first, network second: the filing lands in the outbox — bytes,
    /// fields, link — and this returns. In a field with no signal that IS the
    /// filing; the upload, the record, the link and the ground adoption all
    /// happen when the sync engine can reach the stack, and a retried
    /// mutation replays instead of duplicating (`x-idempotency-key`). Throws
    /// only when the phone's own disk refuses, which is a real failure.
    func fileDocument(_ r: ScanResult, linkTo target: LinkTarget) async throws {
        let payload = String(
            data: try JSONSerialization.data(withJSONObject: r.fields, options: [.sortedKeys]),
            encoding: .utf8) ?? "{}"
        let name = documentFileName(
            docType: r.fields["doc_type"] as? String ?? "",
            village: r.fields["village"] as? String ?? "",
            surveyNo: r.fields["survey_no"] as? String ?? "",
            originalName: r.originalName)
        try await WriteQueue.shared.enqueueFiling(
            user: api.config.userID,
            fieldsJSON: payload,
            fileURL: r.fileURL,
            originalName: r.originalName,
            displayName: name,
            link: target.filingLink)
        SyncEngine.shared.kick(.enqueued)
    }

    /// Keep a paper WITHOUT reading it.
    ///
    /// The counterpart of `fileDocument`. That one sends the file to the model
    /// and files what comes back; this one files the file. Until it existed
    /// the phone could only keep a document by paying to have it read, which
    /// is the wrong trade for a tax receipt, a photocopy, or the fourteenth
    /// page of something the person just wants somewhere safe.
    ///
    /// Same durability contract as every other filing: bytes into the outbox,
    /// entry on disk, then the network. Throws only when the phone's own disk
    /// refuses.
    func fileWithoutReading(url: URL, named displayName: String,
                            linkTo target: LinkTarget) async throws {
        try await WriteQueue.shared.enqueueFile(
            user: api.config.userID,
            fileURL: url,
            displayName: displayName,
            link: target.filingLink)
        SyncEngine.shared.kick(.enqueued)
    }

    /// Adopt a filed document's ground facts into the holding it was filed
    /// against. The FMB point table (`boundary_points`) becomes the drawn
    /// boundary; a deed's schedule (`boundaries`) becomes the four sides on a
    /// parcel. Empty fields only, silent on failure.
    private func adoptGround(from fields: [String: Any], into target: LinkTarget) async {
        let corners = boundaryPointsText(fields["boundary_points"])
        let schedule = fields["boundaries"] as? [String: Any] ?? [:]
        func side(_ key: String) -> String {
            (schedule[key] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let sides = (n: side("north"), s: side("south"), e: side("east"), w: side("west"))
        let hasSides = ![sides.n, sides.s, sides.e, sides.w].allSatisfy(\.isEmpty)
        guard !corners.isEmpty || hasSides else { return }

        switch target {
        case .parcel(let id):
            struct One: Decodable { let parcel: Ground? }
            struct Ground: Decodable {
                let boundary: String
                let boundaryNorth, boundarySouth, boundaryEast, boundaryWest: String
            }
            guard let current = (await load(Queries.parcelGround,
                                            variables: ["id": id], as: One.self))?.parcel
            else { return }
            if !corners.isEmpty, current.boundary.isEmpty {
                _ = await load(Queries.updateParcelBoundary,
                               variables: ["id": id, "boundary": corners],
                               as: AnyMutationResult.self)
            }
            if hasSides, allBlank(current.boundaryNorth, current.boundarySouth,
                                  current.boundaryEast, current.boundaryWest) {
                _ = await load(Queries.updateParcelSides,
                               variables: ["id": id, "north": sides.n, "south": sides.s,
                                           "east": sides.e, "west": sides.w],
                               as: AnyMutationResult.self)
            }
        case .property(let id):
            // A property's deed schedule already lives in its attributes blob;
            // only the drawn boundary is adopted here.
            struct One: Decodable { let property: Ground? }
            struct Ground: Decodable { let boundary: String }
            guard !corners.isEmpty,
                  let current = (await load(Queries.propertyGround,
                                            variables: ["id": id], as: One.self))?.property,
                  current.boundary.isEmpty
            else { return }
            _ = await load(Queries.updatePropertyBoundary,
                           variables: ["id": id, "boundary": corners],
                           as: AnyMutationResult.self)
        case .passbook, .none:
            // A passbook is a bundle of parcels; there is no single ground to
            // give the corners to.
            break
        }
    }

    /// Run a query, remembering the failure instead of throwing into a view.
    ///
    /// Offline-first: a fresh answer refreshes the cache; when the network is
    /// weather, the last good answer renders instead — with `servedStaleAt`
    /// carrying its age so screens can say so. A screen only sees a failure
    /// when there is neither network nor history.
    /// One query's own outcome, told to the caller instead of to a field the
    /// whole app shares.
    ///
    /// `lastFailure` is a single string that every concurrent query writes.
    /// A screen fires three or four loads at once, so whichever finished last
    /// decided what every screen believed: a sibling succeeding from the
    /// offline cache erased the failure that mattered, and a cancellation from
    /// an ordinary tab switch overwrote a real one. Three separate bugs came
    /// out of that field in one day. A screen that needs to be right about its
    /// own primary query asks for the answer AND the failure together.
    ///
    /// `failure` is nil when the load was cancelled — a view being torn down
    /// is not a failure, and there is nobody left to tell.
    func fetch<T: Decodable & Sendable>(
        _ document: String, variables: [String: any Sendable] = [:], as: T.Type
    ) async -> (value: T?, failure: String?) {
        await freshenAuth()
        do {
            let answer = try await api.queryCached(document, variables: variables, as: T.self)
            lastFailure = nil
            if let asOf = answer.asOf {
                servedStaleAt = min(servedStaleAt ?? asOf, asOf)
            } else {
                servedStaleAt = nil
            }
            return (answer.value, nil)
        } catch {
            if case PattadarAPI.APIError.cancelled = error { return (nil, nil) }
            if error is CancellationError { return (nil, nil) }
            let described = String(describing: error)
            lastFailure = described
            return (nil, described)
        }
    }

    func load<T: Decodable & Sendable>(_ document: String, variables: [String: any Sendable] = [:], as: T.Type) async -> T? {
        await freshenAuth()
        do {
            let answer = try await api.queryCached(document, variables: variables, as: T.self)
            lastFailure = nil
            // A screen fires several loads at once; the banner shows the
            // OLDEST stale answer among them, and any fresh answer clears
            // it — offline, everything is stale, so the clear never races
            // the set; online, everything is fresh, so it never shows.
            if let asOf = answer.asOf {
                servedStaleAt = min(servedStaleAt ?? asOf, asOf)
            } else {
                servedStaleAt = nil
            }
            return answer.value
        } catch {
            // A CANCELLED load is not a failure and must never be shown as
            // one. SwiftUI cancels a `.task` when its view goes away, and this
            // app rebuilds a tab whenever you leave it (`restartTab`), so
            // every tab switch cancels whatever was in flight. Reported, that
            // turned an ordinary tab switch into "Couldn't load your records —
            // Stopped." on a screen whose fresh copy was already loading.
            if case PattadarAPI.APIError.cancelled = error { return nil }
            lastFailure = String(describing: error)
            return nil
        }
    }
}

extension WidgetLink.Filter {
    /// The list's own filter. The mapping lives here rather than in the Kit
    /// because `HoldingFilter`'s raw values are the words printed on the
    /// filter chips, and a widget's URL must not depend on a display string.
    var appFilter: HoldingFilter {
        switch self {
        case .all: .all
        case .agricultural: .agricultural
        case .plots: .plots
        case .attention: .needsAttention
        case .favourites: .favourites
        }
    }
}

/// The durable twin of `LinkTarget` (PattadarKit cannot see app types, and an
/// outbox entry outlives the process). Conversions live here so the two can
/// never drift silently — a new case fails to compile on both sides.
extension LinkTarget {
    init(_ link: FilingLink) {
        switch link {
        case .none: self = .none
        case .parcel(let id): self = .parcel(id)
        case .passbook(let id): self = .passbook(id)
        case .property(let id): self = .property(id)
        }
    }

    var filingLink: FilingLink {
        switch self {
        case .none: .none
        case .parcel(let id): .parcel(id)
        case .passbook(let id): .passbook(id)
        case .property(let id): .property(id)
        }
    }
}

struct RootTabs: View {
    @Environment(AppModel.self) private var app
    /// Changing this rebuilds the tab bar, which is the only way a tab item
    /// picks up a new image — SwiftUI does not re-evaluate one on its own.
    @State private var avatarVersion = UUID()
    @Environment(\.scenePhase) private var scenePhase
    /// Read so the filing icon is redrawn when the phone changes appearance —
    /// an `.alwaysOriginal` image keeps whatever colours it was drawn with.
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        // The `Tab` builder is iOS 18+; the deployment target is 17 so that
        // the app runs on phones people actually still carry.
        //
        // Passbooks no longer have a tab of their own. A passbook is not a
        // thing you own — it is how farmland is FILED — so it belongs as a
        // grouping of the Properties list, reachable by tapping the group
        // header, rather than as a second list of the same land.
        TabView(selection: Binding(get: { app.selectedTab },
                                  set: { app.selectedTab = $0 })) {
            HomeScreen().id(app.tabVersions[.home])
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(AppModel.Tab.home)
            HoldingsScreen().id(app.tabVersions[.properties])
                .tabItem { Label("Properties", systemImage: "building.2.fill") }
                .tag(AppModel.Tab.properties)
            // The centre slot is FILING, not a destination.
            //
            // Family was there, and a tab is for a place you return to — but
            // filing a paper is the thing people open this app to do, and it
            // was three taps deep behind a "+" in a corner. Family moves to the
            // You screen, which is where the people in your records live.
            Color.clear.tabItem {
                Image(uiImage: Self.filingIcon(for: scheme))
                Text("File")
            }
            .tag(AppModel.Tab.add)
            // It is drawn as a button and it behaves as one; VoiceOver was
            // still announcing "File, tab 3 of 5" — an action described as a
            // place. Said plainly instead.
            .accessibilityLabel("File a document")
            .accessibilityHint("Opens the filing sheet")
            .accessibilityAddTraits(.isButton)
            // "Documents" describes a folder. "Vault" says what it is for:
            // the papers that prove the land is yours, kept where they can be
            // found.
            DocumentsScreen().id(app.tabVersions[.documents])
                .tabItem { Label("Vault", systemImage: "lock.doc.fill") }
                .tag(AppModel.Tab.documents)
            YouScreen().id(app.tabVersions[.you])
                .tabItem {
                // Your own face on your own tab. Falls back to the symbol
                // until a photo is chosen.
                if let avatar = Identity.tabAvatar() {
                    Image(uiImage: avatar)
                } else {
                    Image(systemName: "person.crop.circle.fill")
                }
                Text("You")
            }
            .tag(AppModel.Tab.you)
        }
        .onChange(of: app.selectedTab) { previous, now in
            if now == .add {
                // A tab that is really a button: it must not become the selected
                // tab, or dismissing the sheet would leave a blank screen behind.
                app.selectedTab = previous == .add ? .home : previous
                app.requestFiling = true
                return
            }
            // The tab being left resets to its first page while offscreen.
            // (previous == .add is the filing bounce above, not a real leave —
            // resetting then would restart the tab under the open sheet.)
            if previous != .add, previous != now {
                app.restartTab(previous)
            }
        }
        .sheet(isPresented: Binding(get: { app.requestFiling },
                                    set: { app.requestFiling = $0 })) {
            FilingSheet()
        }
        // Filing asked for from OUTSIDE the app — the Control Centre button, a
        // widget, the Lock Screen. Two doors, because the intent runs in
        // whichever process the system chooses: in this one the notification is
        // heard at once, and from the extension the note left in the App Group
        // is still waiting when the app comes to the front. Both are taken
        // once, so neither can reopen the sheet on the next launch.
        .onReceive(NotificationCenter.default.publisher(for: .pattadarOpenFiling)) { _ in
            app.requestFiling = true
        }
        .task {
            if SharedSnapshot.takeFilingRequest() { app.requestFiling = true }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, SharedSnapshot.takeFilingRequest() {
                app.requestFiling = true
            }
        }
        // The offline truth, said once and quietly: what is on screen is real
        // data as of a moment, not an error and not a pretence of freshness.
        // Disappears the instant a live answer lands.
        .overlay(alignment: .top) {
            if let asOf = app.servedStaleAt {
                Text("As of \(Self.staleStamp.string(from: asOf))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, Space.md)
                    .padding(.vertical, Space.xs)
                    .background(.thinMaterial, in: Capsule())
                    .padding(.top, Space.xs)
                    .transition(.opacity)
            }
        }
        .id(avatarVersion)
        .onReceive(NotificationCenter.default.publisher(for: .avatarChanged)) { _ in
            avatarVersion = UUID()
        }
    }

    /// DD/MM/YYYY — the platform's date order, everywhere, always. Locale
    /// and calendar pinned: a device set to a non-Gregorian calendar would
    /// otherwise stamp the wrong year on the staleness line.
    static let staleStamp: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_IN")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "dd/MM/yyyy, h:mm a"
        return f
    }()

    /// The one ACTION on the tab bar, drawn as one.
    ///
    /// A tab item renders its image as a template in the bar's grey, which
    /// dressed the filing button as a fifth destination — four places to go
    /// and a button, all in the same voice. Filling the circle and leaving
    /// the plus white is what says "this one does something".
    ///
    /// Drawn by hand rather than via an SF Symbol palette: `.alwaysOriginal`
    /// is the only way a tab item keeps its own colours, and the beta's
    /// symbol renderer recoloured the palette version green on the bar.
    /// Plain fills cannot be reinterpreted.
    /// Drawn per appearance rather than once at launch: `.alwaysOriginal`
    /// bakes the bitmap, so a single static image would keep the colours it
    /// was born with when the phone switches between light and dark. The
    /// circle was also a hardcoded `systemBlue` — the one place in the app
    /// still painting the stock iOS tint after the brand amber landed.
    private static func filingIcon(for scheme: ColorScheme) -> UIImage {
        let traits = UITraitCollection(userInterfaceStyle: scheme == .dark ? .dark : .light)
        let fill = UIColor(Palette.accent).resolvedColor(with: traits)
        let mark = UIColor(Palette.accentInk).resolvedColor(with: traits)
        let size: CGFloat = 30
        let rect = CGRect(x: 0, y: 0, width: size, height: size)
        return UIGraphicsImageRenderer(size: rect.size).image { _ in
            fill.setFill()
            UIBezierPath(ovalIn: rect).fill()
            // The plus: two rounded bars, sized like the symbol's own.
            let arm: CGFloat = size * 0.46
            let thick: CGFloat = size * 0.10
            mark.setFill()
            UIBezierPath(roundedRect: CGRect(x: (size - arm) / 2, y: (size - thick) / 2,
                                             width: arm, height: thick),
                         cornerRadius: thick / 2).fill()
            UIBezierPath(roundedRect: CGRect(x: (size - thick) / 2, y: (size - arm) / 2,
                                             width: thick, height: arm),
                         cornerRadius: thick / 2).fill()
        }.withRenderingMode(.alwaysOriginal)
    }
}

extension Notification.Name {
    /// Posted when the account photo is set or removed.
    static let avatarChanged = Notification.Name("pattadar.avatarChanged")
}

/// One place to say a load failed, so the wording cannot drift per screen.
/// When loading fails, say so — and when the CAUSE is a missing sign-in,
/// offer the door instead of describing the wall. The sign-in sheet only
/// ever appeared on first launch, so a phone signed out mid-session was
/// stranded on every tab with a raw 401 and no way back in.
struct LoadFailure: View {
    let message: String?
    @State private var showSignIn = false

    private var needsSignIn: Bool {
        !CognitoAuth.shared.isSignedIn
            || (message?.contains("401") ?? false)
            || (message?.localizedCaseInsensitiveContains("bearer") ?? false)
    }

    /// The server was never reached, as opposed to reached and unhappy. The
    /// upload paths now speak in `APIError`, so a connection failure arrives
    /// as one of these sentences rather than as an NSError dump.
    private var offline: Bool {
        guard let message else { return false }
        return message.contains("Couldn’t reach the server")
            || message.contains("No internet connection")
            || message.contains("The connection failed")
    }

    var body: some View {
        if needsSignIn {
            ContentUnavailableView {
                Label("Signed out", systemImage: "person.crop.circle.badge.exclamationmark")
            } description: {
                Text("Your session ended. Sign in and your records are right where you left them.")
            } actions: {
                Button("Sign in") { showSignIn = true }
                    .buttonStyle(.borderedProminent)
            }
            .sheet(isPresented: $showSignIn) { SignInScreen() }
        } else if offline {
            // Offline is not a fault, and it is not the same as a broken
            // server — but it is only half a promise. The app keeps the last
            // good answer for every screen you have opened while connected;
            // a screen you have never opened on this account has nothing to
            // keep, and saying "the server did not answer" there sends
            // somebody hunting for a problem that is not theirs.
            ContentUnavailableView {
                Label("Nothing saved for this yet", systemImage: "icloud.slash")
            } description: {
                Text("You are offline. Pattadar shows the last answer it received, and it has not seen this screen on this account yet. Open it once with a connection and it will be here offline afterwards.")
            }
        } else {
            ContentUnavailableView(
                "Couldn’t load your records",
                systemImage: "exclamationmark.icloud",
                description: Text(message ?? "The server did not answer.")
            )
        }
    }
}
