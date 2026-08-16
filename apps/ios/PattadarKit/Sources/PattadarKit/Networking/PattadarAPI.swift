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
            // ALWAYS with a trailing slash, whatever the plist or the
            // environment said.
            //
            // Without it the server answers every request with a 307 to the
            // slashed path — and builds that redirect from the scheme it sees
            // behind the load balancer, which is http. curl follows the
            // downgrade and reaches the API; iOS does not. App Transport
            // Security blocks the cleartext hop, so on a phone every single
            // production request died on a redirect, and the screens sat
            // loading for ever. One character, and it is not the kind of
            // character anybody notices in a plist — so it is enforced here
            // rather than trusted there.
            let text = baseURL.absoluteString
            self.baseURL = text.hasSuffix("/")
                ? baseURL
                : (URL(string: text + "/") ?? baseURL)
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

        /// Put an error from URLSession into this app's vocabulary.
        ///
        /// The screen prints whatever it is handed, and `APIError` is
        /// `CustomStringConvertible` — so an error that arrives as one gets a
        /// plain sentence for free, and a raw `NSError` gets
        /// `Error Domain=NSURLErrorDomain Code=-999 … UserInfo={…}` in red
        /// across a farmer's screen instead. Both upload paths convert here so
        /// the foreground and the background cannot disagree about what a
        /// stopped read is: the background one used to hand the raw error
        /// straight out, and a tapped "Stop" was reported as a failure.
        public static func from(_ error: Error) -> PattadarAPI.APIError {
            if let already = error as? PattadarAPI.APIError { return already }
            if error is CancellationError { return .cancelled }
            guard let url = error as? URLError else {
                return .transport(sentence(error.localizedDescription))
            }
            return url.code == .cancelled ? .cancelled : .transport(describeTransport(url))
        }

        /// A sentence for a connection failure.
        ///
        /// The same rule `describeHTTP` follows for HTML: say what the
        /// situation IS rather than quoting the machinery.
        /// `localizedDescription` is usually a sentence, but an error carrying
        /// no localisation falls back to "The operation couldn't be completed.
        /// (NSURLErrorDomain error -1004.)", which is machine text wearing a
        /// full stop.
        static func describeTransport(_ url: URLError) -> String {
            switch url.code {
            case .notConnectedToInternet:
                "No internet connection."
            case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed,
                 .networkConnectionLost, .timedOut, .secureConnectionFailed:
                // The everyday one: the server named in the build is not
                // answering — a local stack that is not running, or no route
                // to it from where the phone is standing.
                "Couldn’t reach the server."
            default:
                sentence(url.localizedDescription)
            }
        }

        /// Machine text is never the message. Anything that still smells of an
        /// `NSError` is replaced rather than shown.
        static func sentence(_ text: String) -> String {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let mechanical = trimmed.isEmpty
                || trimmed.contains("NSURLErrorDomain")
                || trimmed.contains("UserInfo")
                || trimmed.contains("Code=")
                || trimmed.contains("error -")
            return mechanical ? "The connection failed." : trimmed
        }

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
    ///
    /// Extra `headers` ride on this one request — the write queue uses this
    /// to attach `x-idempotency-key` so a retried mutation can never land
    /// twice.
    public func query<T: Decodable>(
        _ document: String,
        variables: [String: any Sendable] = [:],
        as: T.Type = T.self,
        headers: [String: String] = [:]
    ) async throws -> T {
        let data = try await queryBody(document, variables: variables, headers: headers)
        let env = try JSONDecoder().decode(GraphQLEnvelope<T>.self, from: data)
        guard let payload = env.data else { throw APIError.graphQL(["no data returned"]) }
        return payload
    }

    /// The validated raw response body: status checked, `errors` empty, `data`
    /// present. Bytes rather than a decoded value so the response cache can
    /// keep the wire truth verbatim — the Decodable structs drop fields their
    /// screens do not read; the bytes drop nothing.
    public func queryBody(
        _ document: String,
        variables: [String: any Sendable] = [:],
        headers: [String: String] = [:]
    ) async throws -> Data {
        var r = request("graphql")
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (name, value) in headers {
            r.setValue(value, forHTTPHeaderField: name)
        }
        r.httpBody = try JSONSerialization.data(
            withJSONObject: ["query": document, "variables": variables]
        )

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: r)
        } catch {
            // Through the same converter the uploads use, so a query and an
            // upload describe one dead server with one sentence — and so the
            // screens can tell "never reached the server" from "the server
            // said no" without matching on NSError text.
            throw APIError.from(error)
        }
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw APIError.http(code, String(data: data, encoding: .utf8) ?? "")
        }

        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if let errors = obj?["errors"] as? [[String: Any]], !errors.isEmpty {
            throw APIError.graphQL(errors.compactMap { $0["message"] as? String })
        }
        guard obj?["data"] is [String: Any] else { throw APIError.graphQL(["no data returned"]) }
        return data
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
        } catch {
            throw APIError.from(error)
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
