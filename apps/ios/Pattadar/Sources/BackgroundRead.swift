import Foundation
import PattadarKit
import UIKit
import UserNotifications

/// Reading a document in a session that survives the app being closed.
///
/// The scan card has been telling people "Sent. You can close this and carry on
/// — we'll tell you when it's read". That was false. The upload ran on a DEFAULT
/// `URLSession`, which iOS tears down as soon as the app leaves the foreground,
/// so leaving produced "The network connection was lost" ninety seconds into a
/// ninety-four-second read — and the document had to be scanned again.
///
/// Only a BACKGROUND session keeps going. It runs out of process, so the
/// transfer continues while the app is suspended or terminated, and iOS
/// relaunches the app to hand over the result. That is the whole reason for the
/// delegate-shaped code below: background sessions cannot use completion
/// handlers or `async` convenience methods.
///
/// Two details are load-bearing:
///
/// The multipart body is a file on disk, and it must SURVIVE the app. The old
/// code deleted it in a `defer` as soon as the upload call returned — correct
/// for an in-process upload, fatal here, because the system reads that file
/// after the process is gone.
///
/// The pending read is recorded in `UserDefaults`. After a relaunch there is no
/// memory of what was being read, and a result with no idea which document it
/// belongs to cannot be filed.
@MainActor
final class BackgroundRead: NSObject {
    static let shared = BackgroundRead()

    /// Fixed: a background session is identified across app launches by this
    /// string, and changing it orphans transfers already in flight.
    private static let identifier = "com.rfactory.pattadar.read"

    /// Set by the app delegate when iOS wakes us purely to deliver results;
    /// must be called once the session says it has finished.
    var systemCompletion: (() -> Void)?

    /// Reported to whoever is on screen. Nil when nobody is listening — the
    /// result is still recorded and notified.
    var onProgress: ((Double) -> Void)?
    var onFinished: ((Result<[String: Any], Error>) -> Void)?
    /// The review-queue entry the LAST finished read was filed under, so a
    /// flow that consumes the result live can clear that entry when it saves.
    /// Without this, every completed scan left a ghost on Home's "waiting for
    /// you" list — four documents the founder had already filed.
    private(set) var lastEnqueuedReviewID: String?

    private var session: URLSession!
    private var received: [Int: Data] = [:]

    private override init() {
        super.init()
        let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
        // The read is a single long request, not a background trickle: it should
        // start immediately rather than when the system finds it convenient.
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.timeoutIntervalForRequest = 300
        config.timeoutIntervalForResource = 900
        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }

    // MARK: - The pending read, across launches

    struct Pending: Codable {
        var endpointPath: String
        var originalName: String
        var documentPath: String
        var bodyPath: String
        var startedAt: Date
    }

    private static let pendingKey = "pattadar.pendingRead"

    private(set) var pending: Pending? {
        get {
            guard let data = UserDefaults.standard.data(forKey: Self.pendingKey) else { return nil }
            return try? JSONDecoder().decode(Pending.self, from: data)
        }
        set {
            if let newValue, let data = try? JSONEncoder().encode(newValue) {
                UserDefaults.standard.set(data, forKey: Self.pendingKey)
            } else {
                UserDefaults.standard.removeObject(forKey: Self.pendingKey)
            }
        }
    }

    /// Whether a read is still running somewhere out of process. Asked on launch,
    /// so a relaunched app shows "reading…" rather than an empty card.
    func resumeIfRunning() async -> Pending? {
        guard let p = pending else { return nil }
        let tasks = await session.allTasks
        guard !tasks.isEmpty else {
            // Nothing is running and no result arrived: the transfer died with
            // the process. Say so rather than leaving a spinner forever.
            pending = nil
            return nil
        }
        return p
    }

    // MARK: - Starting

    func start(endpoint: PattadarAPI.ExtractionEndpoint, config: PattadarAPI.Config,
               fileURL: URL, name: String) throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        let bodyURL = try Self.writeMultipart(fileURL: fileURL, boundary: boundary)

        var request = URLRequest(url: config.baseURL.appendingPathComponent(endpoint.requestPath))
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("1", forHTTPHeaderField: "Bypass-Tunnel-Reminder")
        request.setValue("1", forHTTPHeaderField: "ngrok-skip-browser-warning")
        if !config.userID.isEmpty {
            request.setValue(config.userID, forHTTPHeaderField: "x-user-id")
        }
        if !config.authorization.isEmpty {
            request.setValue("Bearer \(config.authorization)", forHTTPHeaderField: "Authorization")
        }

        pending = Pending(endpointPath: endpoint.requestPath, originalName: name,
                          documentPath: fileURL.path, bodyPath: bodyURL.path,
                          startedAt: Date())
        let task = session.uploadTask(with: request, fromFile: bodyURL)
        task.resume()
    }

    func cancelAll() {
        // The TASKS are cancelled, not the session.
        //
        // `invalidateAndCancel()` kills the session for good, and this object is
        // a singleton that creates its session once — so tapping Stop would have
        // left every later scan failing until the app was restarted, with no
        // sign of why.
        session.getAllTasks { tasks in tasks.forEach { $0.cancel() } }
        cleanUp()
    }

    private func cleanUp() {
        if let p = pending {
            try? FileManager.default.removeItem(atPath: p.bodyPath)
        }
        pending = nil
    }

    /// The multipart envelope, streamed to disk so a 14 MB deed is never held in
    /// memory — and so the system can read it after the app is gone.
    private static func writeMultipart(fileURL: URL, boundary: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("Uploads", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let bodyURL = dir.appendingPathComponent("read-\(UUID().uuidString).tmp")

        FileManager.default.createFile(atPath: bodyURL.path, contents: nil)
        let handle = try FileHandle(forWritingTo: bodyURL)
        defer { try? handle.close() }

        let mime = PattadarAPI.mimeTypeForSharing(fileURL)
        func write(_ s: String) throws { try handle.write(contentsOf: Data(s.utf8)) }
        try write("--\(boundary)\r\n")
        try write("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileURL.lastPathComponent)\"\r\n")
        try write("Content-Type: \(mime)\r\n\r\n")
        let reader = try FileHandle(forReadingFrom: fileURL)
        while let chunk = try reader.read(upToCount: 1 << 20), !chunk.isEmpty {
            try handle.write(contentsOf: chunk)
        }
        try reader.close()
        try write("\r\n--\(boundary)--\r\n")
        try handle.synchronize()
        return bodyURL
    }
}

// MARK: - Delegate

extension BackgroundRead: URLSessionDataDelegate {
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
                                didSendBodyData bytesSent: Int64, totalBytesSent: Int64,
                                totalBytesExpectedToSend total: Int64) {
        let fraction = total > 0 ? Double(totalBytesSent) / Double(total) : 0
        Task { @MainActor in self.onProgress?(fraction) }
    }

    nonisolated func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                                didReceive data: Data) {
        let id = dataTask.taskIdentifier
        Task { @MainActor in self.received[id, default: Data()].append(data) }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
                                didCompleteWithError error: Error?) {
        let id = task.taskIdentifier
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0
        Task { @MainActor in
            let body = self.received.removeValue(forKey: id) ?? Data()
            defer { self.cleanUp() }

            if let error {
                self.onFinished?(.failure(error))
                let n = readFailedNotification(error.localizedDescription)
                self.notify(title: n.title, body: n.body)
                return
            }
            let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
            if let message = json["error"] as? String {
                self.onFinished?(.failure(PattadarAPI.APIError.http(status, message)))
                let n = readFailedNotification(message)
                self.notify(title: n.title, body: n.body)
                return
            }
            guard (200..<300).contains(status) else {
                self.onFinished?(.failure(PattadarAPI.APIError.http(
                    status, String(data: body, encoding: .utf8) ?? "")))
                let n = readFailedNotification("The server answered \(status).")
                self.notify(title: n.title, body: n.body)
                return
            }
            let fields = json["fields"] as? [String: Any] ?? [:]
            guard !fields.isEmpty else {
                self.onFinished?(.failure(PattadarAPI.APIError.emptyExtraction("document")))
                let n = readFailedNotification(
                    "Nothing could be read from it — try a clearer copy.")
                self.notify(title: n.title, body: n.body)
                return
            }
            // Written to disk BEFORE anything else, and before `pending` is
            // cleared by the deferred clean-up. The app may have been relaunched
            // purely to receive this and may be closed again a second later; a
            // result held only in memory is the reason a read finished and the
            // property was not there afterwards.
            if let p = self.pending {
                self.lastEnqueuedReviewID = ReviewQueue.shared.add(
                    fields: fields, documentPath: p.documentPath,
                    originalName: p.originalName)
            }
            self.onFinished?(.success(fields))
            let n = readReadyNotification(fields)
            self.notify(title: n.title, body: n.body)
        }
    }

    nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        Task { @MainActor in
            // iOS woke the app only to hand these over, and holds it awake until
            // this is called back.
            self.systemCompletion?()
            self.systemCompletion = nil
        }
    }

    /// Notifies whether or not anything is on screen — the point of a background
    /// read is that the person has walked away.
    private func notify(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = String(body.prefix(160))
        content.sound = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }
}
