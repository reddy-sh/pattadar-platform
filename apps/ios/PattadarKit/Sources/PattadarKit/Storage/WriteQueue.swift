import Foundation

/// What a queued filing is attached to. `LinkTarget` lives in the app target;
/// this is its durable twin — an outbox entry outlives the process and must
/// carry its own copy.
public enum FilingLink: Codable, Sendable, Equatable {
    case none
    case parcel(String)
    case passbook(String)
    case property(String)
}

/// The outbox: a filed document is a durable row first and a network call
/// second.
///
/// A scan taken in a field with no signal lands here — bytes copied out of
/// tmp, fields serialized — and the app treats the filing as done, because
/// from the person's point of view it IS done: the deed is in their hand and
/// in their phone. Everything after is catch-up, driven by `drain`:
///
///   upload bytes → storage node id → createRegisteredDocument(fileRef:) →
///   link to its holding → LocalFiles keeps the bytes under the server id
///
/// Every mutation carries `x-idempotency-key`, so a retry whose first answer
/// was lost replays the server's original response instead of creating a
/// duplicate — the reason a queue may retry at all against a land register.
///
/// Failures split two ways, the same split the review queue taught: weather
/// (no signal, 5xx, an expired token) backs off and retries forever; a
/// permanent rejection parks the entry with `needsReview` for a human. A
/// queue that cannot tell these apart becomes either a poison pill or a
/// silent data loss, so the split is the most-tested code in this file.
public actor WriteQueue {
    public static let shared = WriteQueue()

    /// What makes an outbox entry a PHOTOGRAPH rather than a document filing:
    /// the holding it evidences and the capture metadata that makes it
    /// evidence. Optional on Entry, so every outbox written before photos
    /// existed still decodes — and drains — unchanged.
    public struct PhotoDetails: Codable, Sendable, Equatable {
        public let target: FilingLink
        public let category: String
        public let caption: String
        public let latitude: Double?
        public let longitude: Double?
        public let heading: Double?
        public let capturedAt: String

        public init(target: FilingLink, category: String = "general", caption: String = "",
                    latitude: Double? = nil, longitude: Double? = nil,
                    heading: Double? = nil, capturedAt: String = "") {
            self.target = target
            self.category = category
            self.caption = caption
            self.latitude = latitude
            self.longitude = longitude
            self.heading = heading
            self.capturedAt = capturedAt
        }
    }

    public struct Entry: Codable, Sendable, Identifiable {
        public let id: UUID
        /// Whose filing this is. Entries drain only under the identity that
        /// made them — u01's scan must never file under another signed-in user.
        public let user: String
        public let fieldsJSON: String
        /// Filename inside the outbox directory — relative, never absolute:
        /// the container path changes between launches and an absolute path
        /// saved today is a dead file next month.
        public let storedFile: String
        public let originalName: String
        public let displayName: String
        public let link: FilingLink
        public let createdAt: Date
        public var attempts: Int = 0
        public var nextAttemptAt: Date = .distantPast
        public var lastError: String?
        /// The server answered and the answer was no. A human decides next;
        /// retrying forever is how a queue becomes a poison pill.
        public var needsReview: Bool = false
        /// Set the moment the storage upload succeeds, so a crash between
        /// upload and record creation re-uses the node instead of re-uploading.
        public var uploadedNodeID: String?
        /// Present on photo entries only; nil means a document filing.
        public var photo: PhotoDetails?
        /// A file filed WITHOUT a reading — no model ran, no credit was spent.
        /// It drains to `createDocument` rather than `createRegisteredDocument`.
        ///
        /// OPTIONAL, and that is load-bearing: the synthesized decoder demands
        /// a key for every non-optional property, default value or not, so a
        /// plain `Bool = false` makes every outbox written before today fail
        /// to decode — which is to say, silently drops filings people are
        /// waiting on. Optional decodes as nil, and nil means "a scan", which
        /// is what those entries were.
        public var fileOnly: Bool?
        /// The file's own facts, carried so the vault row can state them
        /// without asking the storage gateway what its own file weighs.
        /// Optional for the same reason as `fileOnly`.
        public var sizeBytes: Int?
        public var mimeType: String?

        public var isPhoto: Bool { photo != nil }
        public var isFileOnly: Bool { fileOnly == true }
    }

    /// A filing the server has now confirmed — handed back so the app side
    /// can run its best-effort extras (ground adoption) and refresh screens.
    public struct CompletedFiling: Sendable {
        public let entry: Entry
        public let documentID: String
    }

    /// Weather retries; rejection parks. The whole queue's safety hinges here.
    enum FailureAction: Equatable {
        case retry(after: TimeInterval)
        case park(String)
    }

    private let indexURL: URL
    private let bytesDir: URL
    private var entries: [Entry] = []
    private var loaded = false
    private var draining = false
    /// The app side observes the queue through this; set once at startup.
    private var onChange: (@Sendable () -> Void)?

    public init(directory: URL? = nil) {
        let root = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        indexURL = root.appendingPathComponent("outbox.json")
        bytesDir = root.appendingPathComponent("Outbox", isDirectory: true)
    }

    public func setOnChange(_ handler: @escaping @Sendable () -> Void) {
        onChange = handler
    }

    // MARK: - Persistence

    private func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        guard let data = try? Data(contentsOf: indexURL),
              let stored = try? JSONDecoder().decode([Entry].self, from: data) else { return }
        // An entry whose bytes vanished cannot be filed; dropping it beats
        // filing a document that can never be opened.
        entries = stored.filter {
            FileManager.default.fileExists(atPath: bytesDir.appendingPathComponent($0.storedFile).path)
        }
    }

    /// Best-effort persist for state transitions mid-drain; the entry list in
    /// memory stays authoritative until the next successful write.
    private func save() {
        try? persist()
        onChange?()
    }

    private func persist() throws {
        try FileManager.default.createDirectory(at: bytesDir, withIntermediateDirectories: true)
        #if os(iOS)
        // Deed scans and extracted fields (Aadhaar included) sit in this
        // directory until they sync; they must not be readable off a locked
        // phone. `completeUnlessOpen` rather than `complete` so a drain that
        // began before the lock can finish its upload.
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUnlessOpen],
            ofItemAtPath: bytesDir.path)
        #endif
        try JSONEncoder().encode(entries).write(to: indexURL, options: .atomic)
    }

    // MARK: - Reading

    public func snapshot() -> [Entry] {
        loadIfNeeded()
        return entries
    }

    public func pending(for user: String) -> [Entry] {
        loadIfNeeded()
        return entries.filter { $0.user == user }
    }

    /// Absolute location of an entry's bytes, for preview before sync.
    public func documentURL(for entry: Entry) -> URL {
        bytesDir.appendingPathComponent(entry.storedFile)
    }

    // MARK: - Writing

    /// Durable first: bytes copied out of tmp, entry on disk, THEN the
    /// network gets a chance. Throws only on local disk failure.
    @discardableResult
    public func enqueueFiling(user: String, fieldsJSON: String, fileURL: URL,
                              originalName: String, displayName: String,
                              link: FilingLink) throws -> Entry {
        loadIfNeeded()
        let id = UUID()
        let stored = "\(id.uuidString)-\(fileURL.lastPathComponent)"
        try FileManager.default.createDirectory(at: bytesDir, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: fileURL,
                                         to: bytesDir.appendingPathComponent(stored))
        let entry = Entry(id: id, user: user, fieldsJSON: fieldsJSON, storedFile: stored,
                          originalName: originalName, displayName: displayName,
                          link: link, createdAt: Date())
        entries.append(entry)
        do {
            // Durable means DURABLE: if the index cannot be written, the
            // filing did not happen — reporting success on a full disk loses
            // a deed the person believes is filed.
            try persist()
        } catch {
            entries.removeAll { $0.id == id }
            try? FileManager.default.removeItem(at: bytesDir.appendingPathComponent(stored))
            throw error
        }
        onChange?()
        return entry
    }

    /// A file into the outbox with NO reading attached — durable first, like
    /// every filing.
    ///
    /// The counterpart of `enqueueFiling`: that one carries an AI extraction
    /// and costs a credit to produce; this one carries only the bytes. A
    /// person who wants a paper kept, and does not want it read, has had no
    /// way to say so on the phone until now.
    @discardableResult
    public func enqueueFile(user: String, fileURL: URL, displayName: String,
                            link: FilingLink) throws -> Entry {
        loadIfNeeded()
        let id = UUID()
        let stored = "\(id.uuidString)-\(fileURL.lastPathComponent)"
        try FileManager.default.createDirectory(at: bytesDir, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: fileURL,
                                         to: bytesDir.appendingPathComponent(stored))
        var entry = Entry(id: id, user: user, fieldsJSON: "", storedFile: stored,
                          originalName: fileURL.lastPathComponent, displayName: displayName,
                          link: link, createdAt: Date())
        entry.fileOnly = true
        entry.mimeType = PattadarAPI.mimeType(for: fileURL)
        let storedPath = bytesDir.appendingPathComponent(stored).path
        let attrs = try? FileManager.default.attributesOfItem(atPath: storedPath)
        entry.sizeBytes = (attrs?[.size] as? Int) ?? 0
        entries.append(entry)
        do {
            try persist()
        } catch {
            entries.removeAll { $0.id == id }
            try? FileManager.default.removeItem(at: bytesDir.appendingPathComponent(stored))
            throw error
        }
        onChange?()
        return entry
    }

    /// A photograph into the outbox — durable first, like every filing. The
    /// bytes are copied out of tmp and the entry persisted before any network
    /// is attempted; a photo taken in a field with no signal IS taken.
    @discardableResult
    public func enqueuePhoto(user: String, fileURL: URL, details: PhotoDetails,
                             displayName: String) throws -> Entry {
        loadIfNeeded()
        let id = UUID()
        let stored = "\(id.uuidString)-\(fileURL.lastPathComponent)"
        try FileManager.default.createDirectory(at: bytesDir, withIntermediateDirectories: true)
        try FileManager.default.copyItem(at: fileURL,
                                         to: bytesDir.appendingPathComponent(stored))
        var entry = Entry(id: id, user: user, fieldsJSON: "", storedFile: stored,
                          originalName: fileURL.lastPathComponent, displayName: displayName,
                          link: details.target, createdAt: Date())
        entry.photo = details
        entries.append(entry)
        do {
            try persist()
        } catch {
            entries.removeAll { $0.id == id }
            try? FileManager.default.removeItem(at: bytesDir.appendingPathComponent(stored))
            throw error
        }
        onChange?()
        return entry
    }

    /// Give up on an entry. Its bytes go too — the person said no. Scoped to
    /// the signed-in user so a stale row rendered across an identity switch
    /// can never delete someone else's queued filing.
    public func discard(_ id: UUID, for user: String) {
        loadIfNeeded()
        guard let entry = entries.first(where: { $0.id == id && $0.user == user }) else { return }
        try? FileManager.default.removeItem(at: documentURL(for: entry))
        entries.removeAll { $0.id == id }
        save()
    }

    // MARK: - Draining

    /// Push every ready entry for the signed-in user. Serialized: a second
    /// drain while one runs returns immediately — two drains racing the same
    /// entry is exactly the duplicate the queue exists to prevent.
    public func drain(api: PattadarAPI, gatewayRoot: URL) async -> [CompletedFiling] {
        loadIfNeeded()
        guard !draining else { return [] }
        draining = true
        defer { draining = false }

        var completed: [CompletedFiling] = []
        while let entry = nextReady(for: api.config.userID) {
            do {
                let filing = try await process(entry, api: api, gatewayRoot: gatewayRoot)
                entries.removeAll { $0.id == entry.id }
                try? FileManager.default.removeItem(at: documentURL(for: entry))
                save()
                completed.append(filing)
            } catch {
                record(Self.classify(error, attempts: entry.attempts + 1), for: entry.id, error: error)
            }
        }
        return completed
    }

    private func nextReady(for user: String) -> Entry? {
        let now = Date()
        return entries.first {
            $0.user == user && !$0.needsReview && $0.nextAttemptAt <= now
        }
    }

    private func record(_ action: FailureAction, for id: UUID, error: Error) {
        guard let i = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[i].attempts += 1
        entries[i].lastError = String(describing: error)
        switch action {
        case .retry(let after): entries[i].nextAttemptAt = Date().addingTimeInterval(after)
        case .park: entries[i].needsReview = true
        }
        save()
    }

    private func process(_ entry: Entry, api: PattadarAPI,
                         gatewayRoot: URL) async throws -> CompletedFiling {
        if let photo = entry.photo {
            return try await processPhoto(entry, photo, api: api, gatewayRoot: gatewayRoot)
        }
        if entry.isFileOnly {
            return try await processFile(entry, api: api, gatewayRoot: gatewayRoot)
        }
        let bytes = documentURL(for: entry)

        // 1. Bytes to the storage gateway (checkpointed on the entry). The
        //    storage routes demand a Bearer token; with none (the bare dev
        //    API, no gateway anywhere) this is today's fileRef:"" world —
        //    file without a ref rather than queue forever. WITH a token, a
        //    404 is never "no storage": it is a dead ingress answering for a
        //    live stack, and it retries like any other weather.
        var nodeID = entry.uploadedNodeID
        if nodeID == nil, !api.config.authorization.isEmpty {
            nodeID = try await uploadBytes(entry, from: bytes, api: api, gatewayRoot: gatewayRoot)
            if let i = entries.firstIndex(where: { $0.id == entry.id }) {
                entries[i].uploadedNodeID = nodeID
                save()
            }
        }

        // 2. The document row. The idempotency key makes this replay-safe:
        //    a retry whose earlier answer was lost gets the SAME document id
        //    back, which also makes the link step below safely re-runnable.
        struct Filed: Decodable { let createRegisteredDocument: IDPayload? }
        let filed = try await api.query(
            Mutations.createRegisteredDocument,
            variables: ["fileRef": nodeID ?? "", "payload": entry.fieldsJSON],
            as: Filed.self,
            headers: ["x-idempotency-key": "\(entry.id.uuidString)-create"])
        guard let docID = filed.createRegisteredDocument?.id else {
            throw PattadarAPI.APIError.graphQL(["the document was not created"])
        }

        // 3. The bytes stay on this phone under the server's id, exactly as
        //    an online filing keeps them. A thrown save retries the whole
        //    entry (the create replays to the same id), because completing
        //    here and then deleting the outbox copy would leave the deed
        //    with no openable file anywhere on the device.
        try await LocalFiles.save(documentID: docID, from: bytes, displayName: entry.displayName)

        // 4. Attach it to what it describes. Weather retries the entry (the
        //    idempotent create makes that safe); a semantic refusal — the
        //    parcel was deleted while this waited — must not park a filing
        //    whose document EXISTS. The document lands unlinked, like a
        //    vault-only filing, and the person can attach it from the app.
        do {
            switch entry.link {
            case .property(let id):
                _ = try await api.query(Mutations.linkDocumentProperty,
                                        variables: ["id": docID, "prop": id],
                                        as: AnyMutationResult.self,
                                        headers: ["x-idempotency-key": "\(entry.id.uuidString)-link"])
            case .parcel(let id):
                _ = try await api.query(Mutations.linkDocumentParcel,
                                        variables: ["id": docID, "parcel": id],
                                        as: AnyMutationResult.self,
                                        headers: ["x-idempotency-key": "\(entry.id.uuidString)-link"])
            case .passbook(let id):
                _ = try await api.query(Mutations.linkDocumentPassbook,
                                        variables: ["id": docID, "pb": id],
                                        as: AnyMutationResult.self,
                                        headers: ["x-idempotency-key": "\(entry.id.uuidString)-link"])
            case .none:
                break
            }
        } catch PattadarAPI.APIError.graphQL {
            // Filed, not attached — the lesser loss, taken deliberately.
        }

        return CompletedFiling(entry: entry, documentID: docID)
    }

    /// A file filed with no reading: bytes → storage node → `createDocument`.
    ///
    /// Deliberately the same four steps as a scan filing, minus the model. The
    /// document lands typed "other" — honest, because nothing has looked at it
    /// — and can be read later from the vault if its owner ever wants that.
    private func processFile(_ entry: Entry, api: PattadarAPI,
                             gatewayRoot: URL) async throws -> CompletedFiling {
        let bytes = documentURL(for: entry)

        // 1. Bytes to storage, checkpointed exactly as a scan filing is: a
        //    crash between upload and row creation re-uses the node.
        var nodeID = entry.uploadedNodeID
        if nodeID == nil, !api.config.authorization.isEmpty {
            nodeID = try await uploadBytes(entry, from: bytes, api: api, gatewayRoot: gatewayRoot)
            if let i = entries.firstIndex(where: { $0.id == entry.id }) {
                entries[i].uploadedNodeID = nodeID
                save()
            }
        }

        // 2. The vault row. Replay-safe under the entry's key, like every
        //    other write here.
        struct Filed: Decodable { let createDocument: IDPayload? }
        let filed = try await api.query(
            Mutations.createDocument,
            variables: ["docType": "other", "fileRef": nodeID ?? "",
                        "name": entry.displayName, "sizeBytes": entry.sizeBytes ?? 0,
                        "mimeType": entry.mimeType ?? "", "source": "upload"],
            as: Filed.self,
            headers: ["x-idempotency-key": "\(entry.id.uuidString)-create"])
        guard let docID = filed.createDocument?.id else {
            throw PattadarAPI.APIError.graphQL(["the document was not created"])
        }

        // 3. The bytes stay on this phone under the server's id — opening a
        //    filed paper must never depend on the network.
        try await LocalFiles.save(documentID: docID, from: bytes, displayName: entry.displayName)

        // 4. Attach it, if it was filed against something. A semantic refusal
        //    leaves it unattached rather than parking a filing whose document
        //    already exists — the same trade the scan path makes.
        do {
            let ids: (parcel: String, pb: String, prop: String) = switch entry.link {
            case .parcel(let id): (id, "", "")
            case .passbook(let id): ("", id, "")
            case .property(let id): ("", "", id)
            case .none: ("", "", "")
            }
            if !(ids.parcel.isEmpty && ids.pb.isEmpty && ids.prop.isEmpty) {
                _ = try await api.query(
                    Mutations.updateDocumentLink,
                    variables: ["id": docID, "parcel": ids.parcel, "pb": ids.pb, "prop": ids.prop],
                    as: AnyMutationResult.self,
                    headers: ["x-idempotency-key": "\(entry.id.uuidString)-link"])
            }
        } catch PattadarAPI.APIError.graphQL {
            // Filed, not attached — the lesser loss, taken deliberately.
        }

        return CompletedFiling(entry: entry, documentID: docID)
    }

    /// A photo entry's catch-up: bytes → storage node → the add-photo
    /// mutation, replay-safe under the entry's idempotency key.
    ///
    /// Unlike a document filing there is no fileRef:"" fallback — a photo row
    /// without its image is nothing, so no Bearer token (the bare dev API,
    /// no storage anywhere) parks the entry for a human instead of filing an
    /// empty frame.
    private func processPhoto(_ entry: Entry, _ photo: PhotoDetails, api: PattadarAPI,
                              gatewayRoot: URL) async throws -> CompletedFiling {
        guard !api.config.authorization.isEmpty else {
            throw PattadarAPI.APIError.graphQL(
                ["Photos need the storage gateway — this stack has none."])
        }
        let bytes = documentURL(for: entry)

        var nodeID = entry.uploadedNodeID
        if nodeID == nil {
            nodeID = try await uploadBytes(entry, from: bytes, api: api, gatewayRoot: gatewayRoot)
            if let i = entries.firstIndex(where: { $0.id == entry.id }) {
                entries[i].uploadedNodeID = nodeID
                save()
            }
        }
        guard let fileRef = nodeID, !fileRef.isEmpty else {
            throw PattadarAPI.APIError.graphQL(["storage answered without a node id"])
        }

        var variables: [String: any Sendable] = [
            "fileRef": fileRef,
            "category": photo.category,
            "caption": photo.caption,
            "capturedAt": photo.capturedAt,
        ]
        // Optional coordinates travel only when known — an absent key reaches
        // the server as null, never as 0,0.
        if let lat = photo.latitude { variables["latitude"] = lat }
        if let lon = photo.longitude { variables["longitude"] = lon }
        if let heading = photo.heading { variables["heading"] = heading }

        struct AddedParcel: Decodable { let addParcelPhoto: IDPayload? }
        struct AddedProperty: Decodable { let addPropertyPhoto: IDPayload? }
        let photoID: String?
        switch photo.target {
        case .parcel(let id):
            variables["parcelId"] = id
            photoID = (try await api.query(
                Mutations.addParcelPhoto, variables: variables, as: AddedParcel.self,
                headers: ["x-idempotency-key": "\(entry.id.uuidString)-photo"]
            )).addParcelPhoto?.id
        case .property(let id):
            variables["propertyId"] = id
            photoID = (try await api.query(
                Mutations.addPropertyPhoto, variables: variables, as: AddedProperty.self,
                headers: ["x-idempotency-key": "\(entry.id.uuidString)-photo"]
            )).addPropertyPhoto?.id
        case .passbook, .none:
            // Unreachable by construction — the UI only offers parcels and
            // properties — but an impossible target must park, not retry.
            throw PattadarAPI.APIError.graphQL(["a photo must belong to a parcel or a property"])
        }
        guard let photoID else {
            throw PattadarAPI.APIError.graphQL(["the photo was not recorded"])
        }

        // The bytes stay on this phone under the photo's server id, so the
        // gallery renders it with no download — same rule as filed documents.
        try await LocalFiles.save(documentID: photoID, from: bytes, displayName: entry.displayName)

        return CompletedFiling(entry: entry, documentID: photoID)
    }

    private func uploadBytes(_ entry: Entry, from bytes: URL, api: PattadarAPI,
                             gatewayRoot: URL) async throws -> String? {
        var components = URLComponents(
            url: gatewayRoot.appendingPathComponent("api/gateway/storage/files"),
            resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "appId", value: "pattadar")]

        var headers: [String: String] = [:]
        if !api.config.authorization.isEmpty {
            headers["Authorization"] = "Bearer \(api.config.authorization)"
        }

        // A same-name file in the same folder becomes a VERSION of the
        // existing node, so two distinct scans must never share a name —
        // the entry id keeps every upload distinct.
        let suffix = entry.id.uuidString.prefix(6).lowercased()
        let ext = (entry.displayName as NSString).pathExtension
        let base = (entry.displayName as NSString).deletingPathExtension
        let uploadName = ext.isEmpty ? "\(base) [\(suffix)]" : "\(base) [\(suffix)].\(ext)"

        let uploader = UploadClient()
        let (status, body) = try await uploader.upload(
            fileURL: bytes, to: components.url!, headers: headers,
            mimeType: PattadarAPI.mimeTypeForSharing(bytes), fileName: uploadName)

        guard (200..<300).contains(status) else {
            throw PattadarAPI.APIError.http(status, String(data: body, encoding: .utf8) ?? "")
        }
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        guard let id = json?["id"] as? String, !id.isEmpty else {
            throw PattadarAPI.APIError.graphQL(["storage answered without a node id"])
        }
        return id
    }

    /// Weather retries with widening gaps; a rejection parks. 401/403 are
    /// weather here — a token that expired while the phone was offline is
    /// cured by the next sign-in, not by a human reviewing the entry. So is
    /// 404: /graphql and the storage routes always exist on a live stack, so
    /// a 404 is a dead tunnel or ingress answering in the stack's place. 409
    /// is the idempotency layer saying "in flight"; 410 is it saying "landed
    /// once, answer gone" — the one code that must reach a human.
    static func classify(_ error: Error, attempts: Int) -> FailureAction {
        let backoff: [TimeInterval] = [2, 8, 30, 120, 600, 3600]
        let wait = backoff[min(max(attempts - 1, 0), backoff.count - 1)]
        switch error {
        case PattadarAPI.APIError.http(let code, _):
            switch code {
            case 401, 403, 404, 408, 409, 425, 429: return .retry(after: wait)
            case 400..<500: return .park("The server refused this (\(code)).")
            default: return .retry(after: wait)
            }
        case PattadarAPI.APIError.graphQL(let messages):
            return .park(messages.joined(separator: "; "))
        case PattadarAPI.APIError.transport:
            return .retry(after: wait)
        default:
            return .retry(after: wait)
        }
    }
}
