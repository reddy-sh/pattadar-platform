# Pattadar iOS — offline architecture

*14 August 2026 · targets `apps/ios` (Swift/SwiftUI, deployment target iOS 17.0)*

Apple's recommendation for making an app work offline is one sentence: **the
local store is the source of truth and the network is a sync detail.** Every
API Apple ships for this — SwiftData, `CKSyncEngine`, background `URLSession`,
`BGTaskScheduler` — assumes the app reads from disk and writes to disk, and
that a server round trip is something that happens *afterwards*, possibly much
later, possibly on a different launch of the process.

This document applies that to Pattadar as it stands today.

---

## 1. Where the app is now

| | Today |
|---|---|
| Server records (parcels, passbooks, documents, members, requests) | **Not persisted.** Per-screen `@State`, refetched in full on every write. `HoldingsScreen.load()` refetches all parcels + properties + passbooks + favourites when you edit one parcel. |
| Writes | Fire mutation → discard result → refetch. No queue, no retry. Offline = the write is lost and the person sees an error. |
| Optimistic UI | Exactly one place: `AppModel.toggleFavourite`. |
| Document bytes | `LocalFiles` — a real local copy in `Documents/`, keyed by the **server-returned** document id, with a `local-files.json` index. This part is already right in spirit. |
| `fileRef` (the storage key) | Selected in `Queries.documents`, written as `""` by this client, **never read**. There is no download path at all — a document filed on another device, or after a reinstall, is a row with nothing to open. |
| Long AI reads | `BackgroundRead` — background `URLSession`, `Pending` persisted to `UserDefaults`, async job + poll. This is the pattern the rest of the app should copy. |
| `ReviewQueue` | Pending AI readings on disk with client-minted `UUID`s. Already an outbox in miniature. |

Two structural facts constrain everything below:

1. **Every record id is server-assigned.** The client never mints one. `createPassbook` must return an id before `createParcel` can reference it — which is why `AddPassbookScreen.save()` has that hand-rolled partial-failure loop.
2. **No model carries `updatedAt`, `rev` or an etag.** `createdAt` only. There is nothing to detect a conflict against, and nothing to build a delta sync on.

Both are solvable, and both need a small server change. They are called out in §7.

---

## 2. Target shape

```
        SwiftUI views
             │  @Query — never awaits the network
             ▼
     ┌───────────────────────┐
     │  SwiftData store      │  Cached* models + Outbox + FileRecord
     │  (the source of truth)│
     └───────┬───────────────┘
             │
     ┌───────▼───────────────┐      ┌──────────────────────┐
     │  SyncEngine (actor)   │◄────►│ DocumentStore        │
     │  pull: delta query    │      │ pinned / cached tiers│
     │  push: outbox drain   │      │ background transfers │
     └───────┬───────────────┘      └──────────┬───────────┘
             │                                  │
   URLSession(waitsForConnectivity)   URLSession.background(".files")
             │                                  │
             ▼                                  ▼
   api.pattadar.com/api/gateway/pattadar   /api/gateway/storage/files/{node}/content
```

Nothing in a view ever calls `PattadarAPI` directly. `AppModel.load` stops
being the read path and becomes a debugging tool.

### Why SwiftData and not Core Data + CloudKit

Apple's turnkey offline story is SwiftData/Core Data **mirrored to CloudKit**
(`NSPersistentCloudKitContainer`, or `ModelConfiguration(cloudKitDatabase:
.automatic)`). That is not available here: the records live in RDS behind a
FastAPI gateway in ap-south-1, shared with two web heads and an RN app, under
a Cognito identity. CloudKit would be a second, divergent copy of the land
register.

So take the half Apple gives you — the local store — and hand-build the sync
half, **modelled on `CKSyncEngine`'s shape** (serialized state, batches of
pending changes, event-driven send/fetch). That is the supported pattern for a
non-CloudKit backend, and it is what Apple's own guidance amounts to once you
strip out the CloudKit specifics.

SwiftData is available at your iOS 17 target. Note `#Index` is iOS 18-only;
`@Attribute(.unique)` is fine on 17.

---

## 3. The local store

Mirror the wire models rather than reusing them — the `PattadarKit` structs are
`Decodable`-only wire shapes and should stay that way. Put the SwiftData layer
in a new `PattadarKit/Sources/PattadarKit/Store/`.

```swift
import SwiftData

@Model
public final class CachedParcel {
    @Attribute(.unique) public var id: String        // server id, or "local:<uuid>" until confirmed
    public var passbookID: String
    public var surveyNo: String
    public var subdivision: String
    public var extent: Double                        // canonical decimal acres — see §8
    public var unit: String
    public var classification: String
    public var createdAt: String                     // wire format, unparsed

    /// Server's last-modified stamp. Nil until the API grows one (§7).
    public var serverUpdatedAt: Date?
    /// When this row was last confirmed against the server — drives the
    /// "as of" line in the UI.
    public var syncedAt: Date
    /// True while an outbox entry still references this row.
    public var hasPendingChanges: Bool
    /// Soft tombstone: hidden from lists, kept until the delete is confirmed.
    public var deletedLocally: Bool

    public init(id: String, passbookID: String, /* … */ syncedAt: Date = .now) { /* … */ }
}
```

Same treatment for `CachedPassbook`, `CachedProperty`, `CachedDocument`,
`CachedMember`, `CachedFamilyGroup`, `CachedWorkRequest`, `CachedLandExpense`.
Dossier-level data (`parcelDossier`, notes, audit events) can stay
fetch-on-demand with a cached-last-response fallback — it is per-record and
rarely the thing someone needs in a field with no signal.

Container setup, in `PattadarApp`:

```swift
let schema = Schema([
    CachedParcel.self, CachedPassbook.self, CachedProperty.self,
    CachedDocument.self, CachedMember.self, CachedFamilyGroup.self,
    CachedWorkRequest.self, CachedLandExpense.self,
    PendingMutation.self, FileRecord.self, SyncState.self,
])

let container = try ModelContainer(
    for: schema,
    configurations: ModelConfiguration(
        schema: schema,
        // Land records are personal data under DPDP. The store must not be
        // readable while the phone is locked.
        // (Set via the container's file protection — see §6.)
        url: Self.storeURL))
```

Views become:

```swift
struct HoldingsScreen: View {
    @Query(filter: #Predicate<CachedParcel> { !$0.deletedLocally },
           sort: \.createdAt, order: .reverse)
    private var parcels: [CachedParcel]

    var body: some View {
        List(parcels) { ParcelRow(parcel: $0) }
            .refreshable { await SyncEngine.shared.syncNow(reason: .userPull) }
            .task { await SyncEngine.shared.syncIfStale() }
    }
}
```

The list renders from disk on the first frame, with no spinner, on a phone in
airplane mode in a field in Guntur. That is the entire point.

---

## 4. Writes: the outbox

Every mutation becomes a durable row first and a network call second.

```swift
@Model
public final class PendingMutation {
    @Attribute(.unique) public var id: UUID          // also the idempotency key (§7)
    public var operation: String                     // "createParcel", "updatePassbook", …
    public var variablesJSON: Data                   // the GraphQL variables, verbatim
    public var targetLocalID: String                 // the Cached* row this write belongs to
    public var dependsOn: UUID?                      // ordering: parcel waits on its passbook
    public var createdAt: Date
    public var attempts: Int
    public var nextAttemptAt: Date
    public var lastError: String?
    /// Set when the server has answered but the answer was a permanent
    /// rejection — needs a human, not a retry.
    public var needsReview: Bool
}
```

**Local ids.** Because the server assigns ids, a record created offline needs a
placeholder. Mint `"local:\(UUID().uuidString)"`, store it as the
`CachedParcel.id`, and keep a mapping table. When the create is confirmed, the
engine rewrites the row's id and every reference to it — including the
`variablesJSON` of dependent outbox entries.

```swift
func confirmCreate(local: String, server: String, in ctx: ModelContext) throws {
    // 1. the row itself
    if let row = try ctx.fetch(FetchDescriptor<CachedParcel>(
        predicate: #Predicate { $0.id == local })).first {
        row.id = server
        row.hasPendingChanges = false
    }
    // 2. anything queued that still names the placeholder
    for pending in try ctx.fetch(FetchDescriptor<PendingMutation>()) {
        guard var vars = try? JSONSerialization.jsonObject(with: pending.variablesJSON)
                as? [String: Any] else { continue }
        var touched = false
        for (k, v) in vars where (v as? String) == local { vars[k] = server; touched = true }
        if touched { pending.variablesJSON = try JSONSerialization.data(withJSONObject: vars) }
    }
    try ctx.save()
}
```

This is what makes `AddPassbookScreen` honest. Today it does
`createPassbook` → loop of `createParcel` → tally which survey numbers failed →
show "the passbook was saved, but none of its 6 survey numbers could be added".
With an outbox: one passbook row and six parcel rows appear locally and
immediately, six queue entries each `dependsOn` the passbook's, and the loop's
failure branch disappears. A partial save stops being possible because the
save is local and atomic.

**The drain**, modelled on `CKSyncEngine`'s send loop:

```swift
actor SyncEngine {
    func drainOutbox() async {
        let batch = pendingReady(limit: 20)      // ordered by dependsOn then createdAt
        for entry in batch {
            do {
                let result = try await api.query(document(for: entry.operation),
                                                 variables: entry.variables,
                                                 as: IDPayload.self)
                await confirm(entry, serverID: result.id)
            } catch PattadarAPI.APIError.http(let code, _) where (400..<500).contains(code)
                     && code != 408 && code != 429 {
                // A permanent rejection. Retrying forever is how a queue
                // becomes a poison pill — park it for a human.
                await park(entry)
            } catch {
                await backoff(entry)              // 2s, 8s, 30s, 2m, 10m, 1h, capped
            }
        }
    }
}
```

**Conflicts.** With no `updatedAt` on the wire there is nothing to compare, so
until §7 lands the safe policy is: *the client only ever pushes fields the
person actually edited*, and never blind-overwrites a whole record. That maps
onto the narrow mutations that already exist for exactly this reason
(`updateParcelExtent`, `updatePropertyArea`) — and it is the same instinct as
`parcelGround`'s read-before-write, which exists so an AI reading cannot
clobber a human entry. Extend that instinct to the sync layer rather than
inventing a second philosophy.

Once the server carries `updatedAt`, the rule becomes: push with the
`updatedAt` you last saw; a `409` means someone else changed it; surface it in
the existing review-queue UI rather than merging silently. Land records are not
a place for last-writer-wins.

---

## 5. Files: documents, scans, photos

This is the heaviest part for you — multi-MB scanned deeds plus photo sets per
parcel — and it needs a different mechanism from the record sync.

### Two tiers, two directories

Apple's directory contract is not decoration; the system enforces it.

| Tier | Location | Backed up | System may delete | Used for |
|---|---|---|---|---|
| **Pinned** — "keep offline" | `Documents/` | yes | no | Documents the person filed or explicitly pinned. What `LocalFiles` does today. |
| **Cached** — opportunistic | `Caches/` | no | **yes, under disk pressure** | Prefetched deeds, full-size parcel photos, anything re-downloadable. |
| **Thumbnails** | `Caches/thumbs/` | no | yes | Grid tiles via the gateway's existing `?thumb=<px>`. |

The index moves from `local-files.json` into SwiftData so it can be queried and
kept consistent with the record rows:

```swift
@Model
public final class FileRecord {
    @Attribute(.unique) public var id: String     // document id, or photo id
    public var fileRef: String                    // storage node id — the S3 key's {node}
    public var version: String?                   // {version} — the third key segment
    public var displayName: String
    public var byteSize: Int64
    public var relativePath: String               // relative to its tier's root
    public var tier: String                       // "pinned" | "cached"
    public var lastOpenedAt: Date?                // LRU
    public var downloadState: String              // "absent" | "downloading" | "ready" | "failed"
    public var resumeData: Data?                  // URLSessionDownloadTask resume payload
}
```

**Store paths relative, never absolute.** The container path changes between
launches and OS updates; an absolute URL saved today is a dead file next month.
This is the single most common way a document cache silently empties itself.

### Downloading

Large files go on a **background** `URLSession` — a second one alongside
`BackgroundRead`'s, with its own identifier:

```swift
let config = URLSessionConfiguration.background(withIdentifier: "com.rfactory.pattadar.files")
config.sessionSendsLaunchEvents = true
// Prefetch is a courtesy, not an errand. Let the system pick the moment,
// and stay off the person's mobile data — this app ships to rural AP where
// that data is metered and expensive.
config.isDiscretionary = true
config.allowsExpensiveNetworkAccess = false     // no cellular for prefetch
config.allowsConstrainedNetworkAccess = false   // honour Low Data Mode
```

For a file the person is *waiting on*, use a foreground download with
`waitsForConnectivity` instead, and flip `allowsExpensiveNetworkAccess = true`
— an explicit tap is not a courtesy.

`URLSessionDownloadTask` writes straight to a temp file (never through memory,
same discipline `UploadClient` already applies to uploads) and gives you resume
data for free:

```swift
func urlSession(_ s: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let error else { return }
    let resume = (error as NSError)
        .userInfo[NSURLSessionDownloadTaskResumeData] as? Data
    Task { @MainActor in record.resumeData = resume; record.downloadState = "failed" }
}

// Later, on any launch:
let task = resume.map { session.downloadTask(withResumeData: $0) }
        ?? session.downloadTask(with: contentURL(for: record))
```

A 14 MB deed on a 2G-ish link survives the app being backgrounded, the screen
locking, and the process being killed. Without this it restarts from zero every
time, which on that link means it never finishes.

Register the completion handler in the app delegate — you already have the hook
for `BackgroundRead`; it must now route by session identifier:

```swift
func application(_ app: UIApplication,
                 handleEventsForBackgroundURLSession id: String,
                 completionHandler: @escaping () -> Void) {
    switch id {
    case "com.rfactory.pattadar.read":  BackgroundRead.shared.systemCompletion = completionHandler
    case "com.rfactory.pattadar.files": DocumentStore.shared.systemCompletion = completionHandler
    default: completionHandler()
    }
}
```

### Eviction

Cached tier gets a budget (~500 MB is reasonable for a documents app; make it
visible in Settings). Evict least-recently-opened first, never touch pinned,
never evict a file with a pending upload:

```swift
func enforceBudget(_ budget: Int64) throws {
    var records = try ctx.fetch(FetchDescriptor<FileRecord>(
        predicate: #Predicate { $0.tier == "cached" && $0.downloadState == "ready" },
        sortBy: [SortDescriptor(\.lastOpenedAt, order: .forward)]))
    var total = records.reduce(0) { $0 + $1.byteSize }
    while total > budget, let victim = records.first {
        try FileManager.default.removeItem(at: url(for: victim))
        total -= victim.byteSize
        victim.downloadState = "absent"          // the row survives; the bytes go
        records.removeFirst()
    }
    try ctx.save()
}
```

Also mark cached files `URLResourceValues.isExcludedFromBackup = true` so a
250 MB deed cache does not blow up the person's iCloud backup. Pinned documents
stay backed up — they are the ones that may not be re-downloadable.

### The `fileRef` gap

Right now `fileDocument` posts `fileRef: ""` and keeps the bytes only on the
device that did the scan. Closing this is a prerequisite for real offline, not
an extra: without it "offline" means "the one phone that scanned it".

The plumbing already exists on both ends, and the web app already uses it
(`apps/web/src/pages/documents/storage.ts` uploads and files the returned node
id) — `POST /api/gateway/storage/files?appId=pattadar` returns a node, and
`GET /api/gateway/storage/files/{node_id}/content` serves the bytes with the
`{owner}/{node}/{version}` key untouched. What is missing is the iOS side
passing the returned node id into `createRegisteredDocument(fileRef:)` and a
download path that reads it back. Do that upload as an **outbox entry with an
attached file**, so a scan taken with no signal uploads itself later:

```
scan → bytes into Documents/ (pinned) immediately
     → CachedDocument row appears, marked hasPendingChanges
     → outbox: uploadFile(localPath) → createRegisteredDocument(fileRef: <node>)
     → the AI read (BackgroundRead) runs when the upload lands
```

The document is openable from the moment it is scanned. Everything else is
catch-up.

---

## 6. The plumbing Apple expects you to use

**Do not preflight with a reachability check.** Apple has said this for a
decade: `NWPathMonitor` is for telling the *person* what is going on, not for
deciding whether to make a request.

```swift
// GraphQL session, in PattadarAPI
let config = URLSessionConfiguration.default
config.waitsForConnectivity = true          // park the task, don't fail it
config.timeoutIntervalForRequest = 240      // your AI budget already needs this
config.timeoutIntervalForResource = 900
```

Note `waitsForConnectivity` is ignored by **background** sessions — they always
wait for connectivity — so `BackgroundRead` already gets this behaviour for
free.

**Background scheduling.** Register two tasks:

```swift
// Info.plist — add via project.yml (neither key is there today; background
// URLSession needs no UIBackgroundMode, but BGTaskScheduler needs both):
//   UIBackgroundModes: [fetch, processing]
//   BGTaskSchedulerPermittedIdentifiers: [com.rfactory.pattadar.refresh,
//                                         com.rfactory.pattadar.sync]

BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.rfactory.pattadar.refresh",
                                using: nil) { task in
    Task {
        await SyncEngine.shared.pullDelta()
        SharedSnapshot.write(...)            // the widget gets fresh numbers for free
        task.setTaskCompleted(success: true)
    }
    task.expirationHandler = { SyncEngine.shared.cancelCurrent() }
}

BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.rfactory.pattadar.sync",
                                using: nil) { task in           // BGProcessingTask
    Task {
        await SyncEngine.shared.drainOutbox()
        await DocumentStore.shared.prefetchPinned()
        task.setTaskCompleted(success: true)
    }
}
```

The processing task should set `requiresNetworkConnectivity = true` and
`requiresExternalPower = true` for the prefetch pass. Reschedule on every
`scenePhase == .background`.

**Data protection.** Land records, Aadhaar extractions and scanned deeds are
personal data — the repo already carries DPDP and SOC 2 docs, and an offline
cache moves that data onto a device.

```swift
try FileManager.default.setAttributes(
    [.protectionKey: FileProtectionType.completeUnlessOpen],
    ofItemAtPath: documentsRoot.path)
```

`.completeUnlessOpen` rather than `.complete`, because a background download
must be able to finish writing while the phone is locked. Apply the same to the
SwiftData store file. The Cognito refresh token belongs in the Keychain with
`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` — a sync that runs in the
background needs the token after first unlock, and it must not migrate to a new
device in a backup.

**Offline UX** (the HIG half):

- Launch straight into cached content. No blocking "connecting…" screen, ever.
- One quiet, persistent staleness line — "as of 12/08/2026, 6:40 pm" — rather
  than an error banner. DD/MM/YYYY, per the platform invariant.
- Pending writes get a visible but undramatic marker (the same treatment the
  review queue already has), and a single "3 changes waiting to sync" row in
  You / Settings that can be tapped to see them.
- Never a dead-end modal. The one screen that genuinely cannot work offline is
  the AI read — say "we'll read this when you're back online", queue it, and
  notify on completion. `BackgroundRead` already does the notify half.
- Errors that are just "no network" should not be shown as failures at all. A
  queued write is a success from the person's point of view.

---

## 7. What the server needs to add

Three changes. None is large; all three are load-bearing.

**1. Idempotency keys.** The outbox retries. `createParcel` is not idempotent.
Retry a create whose response was lost and you get a duplicate survey number in
someone's land register — the worst possible failure for this product. Every
mutation takes a `clientRequestId: String!`; the API stores it with a unique
constraint and returns the original result on a repeat. This is the single most
important item in this document.

**2. `updatedAt` (and ideally `rev`) on every type.** Without it there is no
conflict detection and no delta sync. Add it to `Parcel`, `Property`,
`PassbookDetail`, `RegisteredDocument`, `Member`, `FamilyGroup`, `WorkRequest`,
`LandExpense`. Mutations then accept the client's last-seen `updatedAt` and
answer `409` on a mismatch.

**3. A delta query.** `Queries.holdings` returns everything, every time. Add
`holdings(since: DateTime)` returning changed rows plus a tombstone list of
deleted ids. Full fetch stays as the first-run and repair path. This is what
lets a background refresh cost a few KB instead of the whole register.

Two smaller ones on the storage route
(`services/gateway/app/routes_storage.py`):

- `GET /files/{node}/content` returns the whole body with no `ETag`,
  `Last-Modified`, or `Accept-Ranges`. Add them, and honour `Range` — that is
  what makes an interrupted 14 MB deed resumable rather than restartable.
- It also reads the whole object into memory (`svc.read_content` → `Response
  (content=data)`), as does the upload path (`data = await file.read()`, capped
  by `MAX_UPLOAD_BYTES`). Presigned S3 URLs for GET, and presigned PUT for
  upload, would take the gateway out of the byte path entirely and give you
  Range and resumption from S3 for free.

---

## 8. Two things not to break

**Land arithmetic.** `CachedParcel.extent` stores canonical decimal acres, the
same as `Parcel.extent`, and `unit` stays a provenance label. Do not let a
SwiftData migration or a sync merge become a third place where an extent is
converted. The vectors in `packages/core/vectors/*.json` are the contract; if
the store touches extents at all, the `swift test` vector suite must cover it.

**Storage object keys.** `{owner}/{node}/{version}` is migrated verbatim and
metadata rows never change. `FileRecord.fileRef` + `version` mirror the second
and third segments and must never be reconstructed client-side — always carry
what the server gave you.

---

## 9. Suggested order

| # | Step | Unlocks |
|---|---|---|
| 1 | `clientRequestId` on every mutation (server) | Safe retries. Everything else depends on it. |
| 2 | SwiftData store + `Cached*` models; `HoldingsScreen`, `PassbooksScreen`, `DocumentsScreen` read from `@Query`; sync writes through on every fetch | Instant launch, full read-only offline. Biggest visible win, no write risk. |
| 3 | `FileRecord` + `DocumentStore`, absorbing `LocalFiles`; pinned/cached tiers; background download session | Documents survive reinstall and open on a second device. |
| 4 | `fileRef` actually populated on upload (§5) | Offline stops meaning "the one phone that scanned it". |
| 5 | Outbox for writes, starting with the narrow ones (`updateParcelExtent`, `toggleFavourite`, `addNote`, `addLandExpense`) | Offline edits. |
| 6 | Outbox for creates, with local ids — `AddPassbookScreen` first | Kills the partial-save branch. |
| 7 | `updatedAt` + `409` + delta query (server), conflict review UI | Correct multi-device behaviour. |
| 8 | `BGTaskScheduler` refresh + processing, eviction budget, Low Data Mode | Fresh on launch, bounded disk, no surprise data bills. |

Steps 1–4 are worth doing on their own even if the outbox never ships: they are
the difference between an app that needs a signal and an app that prefers one.

---

## Implementation log

**14 Aug 2026 — first slice shipped** (scenario: file documents offline
against the phone-local stack, auto-sync on reconnect). Two deliberate
deviations from the letter of this document, both evidence-driven:

- **§3's `Cached*` SwiftData mirror models became a raw-wire-bytes
  `ResponseCache`** (`PattadarKit/Storage/ResponseCache.swift`), keyed by
  (user, document, canonical variables), replayed through the same
  `GraphQLEnvelope` decode as the network path. Reason: every wire struct is
  Decodable-only, and the selection sets already carry fields the structs
  drop (`Passbook.groupId`, `RegisteredDocument.fileRef`) — a struct-shaped
  cache silently loses data the app will want later; the bytes lose nothing.
  The fallback hangs off `AppModel.load` / `PattadarAPI.queryCached`, so
  every screen (including the add-flows' duplicate detectors) reads offline
  with zero screen rewrites. The SwiftData store of §3 remains the target
  for per-record queries; this cache is step 2's engine, not its enemy.
- **§7's `clientRequestId: String!` mutation argument became the
  `x-idempotency-key` HTTP header**, enforced by a pure-ASGI middleware on
  POST /graphql (services/api/src/main.py, `idempotency_keys` table,
  claim-INSERT-first on the autocommit pool, stored-response replay,
  409 on in-flight duplicates, 5-minute stale-claim takeover, 7-day sweep).
  Reason: one choke point covers all 81 mutations — including `create_user`,
  which never sees resolver args — with zero GraphQL schema churn, and the
  gateway already forwards the header.

Landed: `WriteQueue` (durable filing outbox: bytes copied at enqueue,
upload → `uploadedNodeID` checkpoint → `createRegisteredDocument(fileRef:)`
with `<uuid>-create` key → link with `<uuid>-link` key → `LocalFiles` under
the server id), `SyncEngine` (drains on enqueue / network-return /
foreground / widening timer; `NWPathMonitor` triggers only, never gates),
the **fileRef gap closed** (§5 — uploads land in storage with unique names
so the same-name-versioning quirk can't merge two scans), weather-vs-
rejection failure split with parked entries surfaced in the Vault's
"Waiting to sync" section, and the quiet "As of DD/MM/YYYY" staleness line.

Hardened by a 42-agent adversarial review the same day (33 confirmed
findings fixed): mutations can never be served from or stored into the read
cache; 401/403 surface instead of masking a dead session; `LocalFiles` is
main-actor-isolated (the index write raced the queue's executor); the cache
carries a session epoch so an in-flight read cannot resurrect a signed-out
user's records; stale idempotency claims **seal to 410** instead of
re-executing (the client parks 410, retries 409); `create_registered_document`
runs in a real transaction so claim-release-on-error is sound; link failures
after a successful create complete the filing unlinked instead of parking it.

Still open from §9: outbox for non-filing writes (step 5 beyond filings),
creates with local ids (step 6), `updatedAt`/409/delta (step 7),
BGTaskScheduler + eviction budgets (step 8), ETag/Range on the storage GET.
Known residual: the "as of" line is a single app-global stamp (per-screen
staleness is step-2 work), and outbox entries deliberately survive sign-out
so a returning identity's filings still sync — bytes are protected
`completeUnlessOpen` and the UI never shows them to another identity.
