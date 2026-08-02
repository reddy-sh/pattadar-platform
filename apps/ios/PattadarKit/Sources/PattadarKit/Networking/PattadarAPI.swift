import Foundation

/// The same backend the React Native app and both web heads talk to.
///
/// Nothing server-side changes for this client: GraphQL at `/graphql`, the AI
/// extraction endpoints as multipart POSTs, `x-user-id` as the trust header
/// until Cognito Bearer tokens land. The wire is camelCase throughout —
/// Strawberry's `auto_camel_case` is on.
public struct PattadarAPI: Sendable {
    public struct Config: Sendable {
        public var baseURL: URL
        /// Trust header. Still sent because the dev API has no Cognito path —
        /// it is how this client is identified when talking straight to the
        /// API. The gateway STRIPS it from every request it proxies, so
        /// carrying both is safe: whichever service answers uses the identity
        /// it trusts.
        public var userID: String
        /// A Cognito access token, when someone has really signed in. Empty
        /// means none. Sent as `Authorization: Bearer` on every request, so
        /// pointing `baseURL` at the gateway is a config change, not a code
        /// change.
        public var authorization: String
        public init(baseURL: URL, userID: String, authorization: String = "") {
            self.baseURL = baseURL
            self.userID = userID
            self.authorization = authorization
        }
    }

    public var config: Config
    private let session: URLSession
    /// Streams uploads from disk and reports real byte progress.
    private let uploader = UploadClient()

    public init(config: Config, session: URLSession = .shared) {
        self.config = config
        self.session = session
    }

    // MARK: - Errors

    public enum APIError: Error, CustomStringConvertible {
        case transport(String)
        case http(Int, String)
        case graphQL([String])
        /// A read that produced no fields is a FAILURE, not an empty success.
        /// The API used to answer 200 with `{"fields":{}}`, so the form sat
        /// there looking untouched — indistinguishable from a dead button.
        case emptyExtraction(String)
        /// The person stopped it. Not a failure, and must not be reported as one.
        case cancelled

        public var description: String {
            switch self {
            case .transport(let m): m
            case .http(let code, let body): Self.describeHTTP(code, body)
            case .graphQL(let msgs): msgs.joined(separator: "; ")
            case .emptyExtraction(let what):
                "Nothing could be read from this \(what). Try a clearer copy, or enter the details by hand."
            case .cancelled: "Stopped."
            }
        }

        /// A human sentence for an HTTP failure.
        ///
        /// The tunnel and the gateway answer their own failures with full HTML
        /// pages, and the app was printing "<!DOCTYPE html><html class=…" in
        /// red across a farmer's screen. Markup is never a message: when the
        /// body is a web page, say what the situation IS — briefly down —
        /// rather than quoting the machinery.
        static func describeHTTP(_ code: Int, _ body: String) -> String {
            let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.hasPrefix("<") {
                return code == 502 || code == 503 || code == 504
                    ? "The server is briefly unavailable — it may be restarting. Pull to refresh in a moment."
                    : "The server answered \(code)."
            }
            return "The server answered \(code). \(text.prefix(160))"
        }
    }

    // MARK: - GraphQL

    private func request(_ path: String) -> URLRequest {
        var r = URLRequest(url: config.baseURL.appendingPathComponent(path))
        r.setValue("1", forHTTPHeaderField: "Bypass-Tunnel-Reminder")
        r.setValue("1", forHTTPHeaderField: "ngrok-skip-browser-warning")
        if !config.userID.isEmpty {
            r.setValue(config.userID, forHTTPHeaderField: "x-user-id")
        }
        if !config.authorization.isEmpty {
            r.setValue("Bearer \(config.authorization)", forHTTPHeaderField: "Authorization")
        }
        return r
    }

    /// Execute a GraphQL document and decode `data` into `T`.
    ///
    /// GraphQL answers 200 with an `errors` array, so a status check alone
    /// reports success for a failed query. Both are checked.
    public func query<T: Decodable>(
        _ document: String,
        variables: [String: any Sendable] = [:],
        as: T.Type = T.self
    ) async throws -> T {
        var r = request("graphql")
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(
            withJSONObject: ["query": document, "variables": variables]
        )

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: r)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw APIError.http(code, String(data: data, encoding: .utf8) ?? "")
        }

        let env = try JSONDecoder().decode(GraphQLEnvelope<T>.self, from: data)
        if let errors = env.errors, !errors.isEmpty {
            throw APIError.graphQL(errors.map(\.message))
        }
        guard let payload = env.data else { throw APIError.graphQL(["no data returned"]) }
        return payload
    }

    // MARK: - AI extraction

    /// Read a deed, passbook or Aadhaar by uploading it to the API.
    ///
    /// Streamed from disk by `URLSession` rather than read into memory. The RN
    /// client had to be rewritten for exactly this: a 14 MB scanned deed loaded
    /// into a JavaScript Blob announced its Content-Length and then died
    /// mid-body, and the app blamed the network. On this platform it is simply
    /// how uploads work.
    public func extract(
        _ endpoint: ExtractionEndpoint,
        fileURL: URL,
        mimeType: String? = nil,
        onProgress: (@Sendable (UploadClient.Progress) -> Void)? = nil
    ) async throws -> [String: Any] {
        var headers = ["Bypass-Tunnel-Reminder": "1", "ngrok-skip-browser-warning": "1"]
        if !config.userID.isEmpty { headers["x-user-id"] = config.userID }
        if !config.authorization.isEmpty { headers["Authorization"] = "Bearer \(config.authorization)" }

        let (status, data): (Int, Data)
        do {
            (status, data) = try await uploader.upload(
                fileURL: fileURL,
                to: config.baseURL.appendingPathComponent(endpoint.path),
                headers: headers,
                mimeType: mimeType,
                onProgress: onProgress)
        } catch is CancellationError {
            throw APIError.cancelled
        } catch let e as URLError where e.code == .cancelled {
            throw APIError.cancelled
        } catch {
            throw APIError.transport(error.localizedDescription)
        }

        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        // The API answers a failed read with {"error": "..."} and a 502; that
        // message names the actual cause and must not be replaced by a generic
        // one.
        if let error = json["error"] as? String { throw APIError.http(status, error) }
        guard (200..<300).contains(status) else {
            throw APIError.http(status, String(data: data, encoding: .utf8) ?? "")
        }
        let fields = json["fields"] as? [String: Any] ?? [:]
        // A read that produced no fields is a FAILURE, not an empty success.
        guard !fields.isEmpty else { throw APIError.emptyExtraction(endpoint.subject) }
        return fields
    }

    public enum ExtractionEndpoint: Sendable {
        case registeredDocument, passbook, property, aadhaar

        /// The background uploader builds its own request and needs this.
        public var requestPath: String { path }

        var path: String {
            switch self {
            case .registeredDocument: "import-registered-document"
            case .passbook: "import-passbook"
            case .property: "extract-property"
            case .aadhaar: "extract-aadhaar"
            }
        }
        /// Used in the failure message, so it names what the person handed over.
        var subject: String {
            switch self {
            case .registeredDocument, .property: "document"
            case .passbook: "passbook"
            case .aadhaar: "Aadhaar"
            }
        }
    }

    /// Public so the background uploader — which builds its own request, out of
    /// necessity — cannot disagree with this one about content types.
    public static func mimeTypeForSharing(_ url: URL) -> String { mimeType(for: url) }

    static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf": "application/pdf"
        case "png": "image/png"
        case "heic": "image/heic"
        default: "image/jpeg"
        }
    }
}


/// GraphQL answers 200 with an `errors` array, so a status check alone reports
/// success for a failed query. Both halves are inspected in `query`.
///
/// File scope rather than nested: Swift 6 does not allow a generic type inside
/// a generic function.
struct GraphQLEnvelope<D: Decodable>: Decodable {
    let data: D?
    let errors: [GQLError]?
    struct GQLError: Decodable { let message: String }
}
