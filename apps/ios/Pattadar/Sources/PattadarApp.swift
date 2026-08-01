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
            .requestAuthorization(options: [.alert, .sound]) }

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
        guard let p = await reader.resumeIfRunning() else { return }
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
        // signal still signs out.
        Task { await CognitoAuth.shared.signOut() }
        Identity.clear()
        favourites = []
        clearRead()
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
    }

    /// File a scanned document and attach it to what it describes.
    ///
    /// One place, because every add-flow needs the same four steps and the RN
    /// app grew three subtly different copies of them.
    func fileDocument(_ r: ScanResult, linkTo target: LinkTarget) async throws {
        await freshenAuth()
        struct Filed: Decodable { let createRegisteredDocument: IDPayload? }
        let payload = String(
            data: try JSONSerialization.data(withJSONObject: r.fields, options: [.sortedKeys]),
            encoding: .utf8) ?? "{}"
        // fileRef stays empty until this client has a Cognito token for the
        // storage gateway. The reading and every extracted field still persist,
        // and the bytes are kept locally so the document can still be opened.
        let filed = try await api.query(Mutations.createRegisteredDocument,
                                        variables: ["fileRef": "", "payload": payload],
                                        as: Filed.self)
        guard let docID = filed.createRegisteredDocument?.id else {
            throw PattadarAPI.APIError.graphQL(["the document was not created"])
        }
        switch target {
        case .property(let id):
            _ = try await api.query(Mutations.linkDocumentProperty,
                                    variables: ["id": docID, "prop": id], as: AnyMutationResult.self)
        case .parcel(let id):
            _ = try await api.query(Mutations.linkDocumentParcel,
                                    variables: ["id": docID, "parcel": id], as: AnyMutationResult.self)
        case .passbook(let id):
            _ = try await api.query(Mutations.linkDocumentPassbook,
                                    variables: ["id": docID, "pb": id], as: AnyMutationResult.self)
        case .none:
            break
        }
        let name = documentFileName(
            docType: r.fields["doc_type"] as? String ?? "",
            village: r.fields["village"] as? String ?? "",
            surveyNo: r.fields["survey_no"] as? String ?? "",
            originalName: r.originalName)
        try? LocalFiles.save(documentID: docID, from: r.fileURL, displayName: name)
    }

    /// Run a query, remembering the failure instead of throwing into a view.
    func load<T: Decodable & Sendable>(_ document: String, variables: [String: any Sendable] = [:], as: T.Type) async -> T? {
        await freshenAuth()
        do {
            let value = try await api.query(document, variables: variables, as: T.self)
            lastFailure = nil
            return value
        } catch {
            lastFailure = String(describing: error)
            return nil
        }
    }
}

struct RootTabs: View {
    @Environment(AppModel.self) private var app
    /// Changing this rebuilds the tab bar, which is the only way a tab item
    /// picks up a new image — SwiftUI does not re-evaluate one on its own.
    @State private var avatarVersion = UUID()
    @State private var filing = false

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
            HomeScreen().tabItem { Label("Home", systemImage: "house.fill") }
                .tag(AppModel.Tab.home)
            HoldingsScreen().tabItem { Label("Properties", systemImage: "building.2.fill") }
                .tag(AppModel.Tab.properties)
            // The centre slot is FILING, not a destination.
            //
            // Family was there, and a tab is for a place you return to — but
            // filing a paper is the thing people open this app to do, and it
            // was three taps deep behind a "+" in a corner. Family moves to the
            // You screen, which is where the people in your records live.
            Color.clear.tabItem {
                Image(uiImage: Self.filingIcon)
                Text("File")
            }
            .tag(AppModel.Tab.add)
            // "Documents" describes a folder. "Vault" says what it is for:
            // the papers that prove the land is yours, kept where they can be
            // found.
            DocumentsScreen().tabItem { Label("Vault", systemImage: "lock.doc.fill") }
                .tag(AppModel.Tab.documents)
            YouScreen().tabItem {
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
            guard now == .add else { return }
            // A tab that is really a button: it must not become the selected
            // tab, or dismissing the sheet would leave a blank screen behind.
            app.selectedTab = previous == .add ? .home : previous
            filing = true
        }
        .sheet(isPresented: $filing) {
            FilingSheet()
        }
        .id(avatarVersion)
        .onReceive(NotificationCenter.default.publisher(for: .avatarChanged)) { _ in
            avatarVersion = UUID()
        }
    }

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
    private static let filingIcon: UIImage = {
        let size: CGFloat = 30
        let rect = CGRect(x: 0, y: 0, width: size, height: size)
        return UIGraphicsImageRenderer(size: rect.size).image { _ in
            UIColor.systemBlue.setFill()
            UIBezierPath(ovalIn: rect).fill()
            // The plus: two rounded bars, sized like the symbol's own.
            let arm: CGFloat = size * 0.46
            let thick: CGFloat = size * 0.10
            UIColor.white.setFill()
            UIBezierPath(roundedRect: CGRect(x: (size - arm) / 2, y: (size - thick) / 2,
                                             width: arm, height: thick),
                         cornerRadius: thick / 2).fill()
            UIBezierPath(roundedRect: CGRect(x: (size - thick) / 2, y: (size - arm) / 2,
                                             width: thick, height: arm),
                         cornerRadius: thick / 2).fill()
        }.withRenderingMode(.alwaysOriginal)
    }()
}

extension Notification.Name {
    /// Posted when the account photo is set or removed.
    static let avatarChanged = Notification.Name("pattadar.avatarChanged")
}

/// One place to say a load failed, so the wording cannot drift per screen.
struct LoadFailure: View {
    let message: String?
    var body: some View {
        ContentUnavailableView(
            "Couldn’t load your records",
            systemImage: "exclamationmark.icloud",
            description: Text(message ?? "The server did not answer.")
        )
    }
}
