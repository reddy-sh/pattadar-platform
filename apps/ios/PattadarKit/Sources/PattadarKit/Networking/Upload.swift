import Foundation

/// Streamed multipart upload with real byte progress.
///
/// The body is written to a temporary FILE and handed to `URLSession.upload
/// (for:fromFile:)`, so a 14 MB scanned deed is never materialised in memory.
/// The React Native client had to be rewritten for exactly this: it loaded the
/// document into a JavaScript Blob, announced a 14 MB Content-Length, and then
/// died mid-body while the app blamed the network.
///
/// Progress is genuine — reported by the OS as bytes leave — because a spinner
/// with no number is indistinguishable from a frozen app during the ninety
/// seconds one of these takes.
public actor UploadClient: NSObject {
    public struct Progress: Sendable {
        public let sent: Int64
        public let total: Int64
        public var fraction: Double { total > 0 ? Double(sent) / Double(total) : 0 }
    }

    private var session: URLSession!
    private var observers: [Int: @Sendable (Progress) -> Void] = [:]

    public override init() {
        super.init()
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 240
        config.timeoutIntervalForResource = 600
        session = URLSession(configuration: config, delegate: Proxy(owner: self), delegateQueue: nil)
    }

    fileprivate func report(task: Int, sent: Int64, total: Int64) {
        observers[task]?(Progress(sent: sent, total: total))
    }

    /// POST a file as `multipart/form-data` under the field name `file`.
    public func upload(
        fileURL: URL,
        to url: URL,
        headers: [String: String],
        fieldName: String = "file",
        mimeType: String? = nil,
        onProgress: (@Sendable (Progress) -> Void)? = nil
    ) async throws -> (status: Int, body: Data) {
        let boundary = "Boundary-\(UUID().uuidString)"
        let name = fileURL.lastPathComponent
        let mime = mimeType ?? PattadarAPI.mimeType(for: fileURL)

        // Build the envelope on disk; never in RAM.
        let bodyURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).tmp")
        FileManager.default.createFile(atPath: bodyURL.path, contents: nil)
        let handle = try FileHandle(forWritingTo: bodyURL)
        defer {
            try? handle.close()
            try? FileManager.default.removeItem(at: bodyURL)
        }
        func write(_ s: String) throws { try handle.write(contentsOf: Data(s.utf8)) }
        try write("--\(boundary)\r\n")
        try write("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(name)\"\r\n")
        try write("Content-Type: \(mime)\r\n\r\n")
        let reader = try FileHandle(forReadingFrom: fileURL)
        while let chunk = try reader.read(upToCount: 1 << 20), !chunk.isEmpty {
            try handle.write(contentsOf: chunk)
        }
        try reader.close()
        try write("\r\n--\(boundary)--\r\n")
        try handle.synchronize()

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }

        let task = session.uploadTask(with: request, fromFile: bodyURL)
        if let onProgress { observers[task.taskIdentifier] = onProgress }
        defer { observers[task.taskIdentifier] = nil }

        // Cancelling the Swift task must actually stop the transfer. Without
        // this the await returns but the upload keeps running, and a 14 MB
        // file goes on climbing after the user has walked away from it.
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let delegate = CompletionProxy { result in continuation.resume(with: result) }
                task.delegate = delegate
                // Held until the task completes; URLSession keeps only a weak ref.
                objc_setAssociatedObject(task, Unmanaged.passUnretained(self).toOpaque(),
                                         delegate, .OBJC_ASSOCIATION_RETAIN)
                task.resume()
            }
        } onCancel: {
            task.cancel()
        }
    }
}

/// Forwards session-level byte counts into the actor.
private final class Proxy: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private weak var owner: UploadClient?
    init(owner: UploadClient) { self.owner = owner }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    didSendBodyData bytesSent: Int64, totalBytesSent: Int64,
                    totalBytesExpectedToSend: Int64) {
        let id = task.taskIdentifier
        Task { [owner] in
            await owner?.report(task: id, sent: totalBytesSent, total: totalBytesExpectedToSend)
        }
    }
}

/// Per-task completion, so several uploads can run without racing.
private final class CompletionProxy: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private var buffer = Data()
    private let finish: (Result<(status: Int, body: Data), Error>) -> Void
    private var done = false

    init(finish: @escaping (Result<(status: Int, body: Data), Error>) -> Void) {
        self.finish = finish
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        buffer.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard !done else { return }
        done = true
        if let error {
            finish(.failure(error))
        } else {
            let code = (task.response as? HTTPURLResponse)?.statusCode ?? 0
            finish(.success((code, buffer)))
        }
    }
}
