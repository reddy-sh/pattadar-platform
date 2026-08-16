import Network
import PattadarKit
import SwiftUI

/// When the outbox gets pushed: the moment something is queued, the moment
/// the network comes back, the moment the app comes to the front, and on a
/// widening timer while anything is still waiting.
///
/// Walking away from the laptop's Wi-Fi does not always LOOK like going
/// offline — the phone may hop to another network that reaches the internet
/// but not the stack. So `waitsForConnectivity` is never the plan here:
/// connection-refused is weather, the queue backs off, and every one of the
/// triggers above gets another chance to land it. `NWPathMonitor` is used
/// only to seize the reconnect moment early — never to decide whether to try.
@MainActor
@Observable
final class SyncEngine {
    static let shared = SyncEngine()

    /// The signed-in user's queued filings, mirrored for screens. The truth
    /// lives in `WriteQueue`; this is a snapshot refreshed on every change.
    private(set) var pendingFilings: [WriteQueue.Entry] = []
    /// Bumps when a drain lands something, so an open screen can refetch and
    /// watch its "waiting" row become a real one.
    private(set) var drainedTick = 0

    /// Who is signed in right now — cheap, no token work. Set by AppModel.
    var userProvider: (@MainActor () -> String)?
    /// A freshened API client + the gateway root, for a drain. Set by AppModel.
    var apiProvider: (@MainActor () async -> (api: PattadarAPI, gatewayRoot: URL)?)?
    /// Best-effort extras after a filing lands (ground adoption). Set by AppModel.
    var postProcess: (@MainActor (WriteQueue.CompletedFiling) async -> Void)?

    private let monitor = NWPathMonitor()
    private var draining = false
    private var retryTask: Task<Void, Never>?

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor [weak self] in self?.kick(.networkReturned) }
        }
        monitor.start(queue: .global(qos: .utility))
        NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { _ in
            Task { @MainActor in SyncEngine.shared.kick(.foreground) }
        }
        Task {
            await WriteQueue.shared.setOnChange {
                Task { @MainActor in await SyncEngine.shared.refreshPending() }
            }
            await refreshPending()
        }
    }

    enum Reason: String { case launch, enqueued, networkReturned, foreground, timer, userPull }

    /// Fire-and-forget; drains are serialized inside.
    func kick(_ reason: Reason) {
        Task { await drain(reason) }
    }

    func refreshPending() async {
        guard let user = userProvider?() else { return }
        pendingFilings = await WriteQueue.shared.pending(for: user)
    }

    /// An entry the person gave up on — scoped to who is signed in, so a
    /// stale row can never delete another identity's queued filing.
    func discard(_ id: UUID) {
        guard let user = userProvider?() else { return }
        Task {
            await WriteQueue.shared.discard(id, for: user)
            await refreshPending()
        }
    }

    /// Identity changed: the mirror must not keep showing the previous
    /// user's queue while the next snapshot loads.
    func identityChanged() {
        pendingFilings = []
        retryTask?.cancel()
        Task { await refreshPending() }
    }

    private func drain(_ reason: Reason) async {
        guard !draining else { return }
        draining = true
        defer { draining = false }

        await refreshPending()
        guard pendingFilings.contains(where: { !$0.needsReview }) else { return }
        guard let (api, root) = await apiProvider?() else { return }

        let completed = await WriteQueue.shared.drain(api: api, gatewayRoot: root)
        for filing in completed {
            await postProcess?(filing)
            // Per filing, not per drain: the pending row disappears the
            // moment its entry completes, and the refetch this tick drives
            // is what makes the real row appear in its place.
            drainedTick += 1
        }
        await refreshPending()
        scheduleRetry()
    }

    /// While something still waits, come back — soon after the first failure,
    /// lazily after many. The queue's own per-entry backoff decides what is
    /// actually ready; this just makes sure someone asks.
    private func scheduleRetry() {
        retryTask?.cancel()
        let waiting = pendingFilings.filter { !$0.needsReview }
        guard !waiting.isEmpty else { return }
        let next = waiting.map(\.nextAttemptAt).min() ?? Date()
        let delay = min(max(next.timeIntervalSinceNow, 5), 3600)
        retryTask = Task { [delay] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            kick(.timer)
        }
    }
}
