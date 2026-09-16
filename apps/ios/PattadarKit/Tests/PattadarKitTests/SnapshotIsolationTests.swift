import Foundation
import Testing
@testable import PattadarKit

@Test("Sign-out and account switching invalidate widget contents and late writes")
func widgetSnapshotsStayWithTheirSession() throws {
    let suite = "test.widget.\(UUID())"
    let defaults = try #require(UserDefaults(suiteName: suite))
    defer { defaults.removePersistentDomain(forName: suite) }
    let store = SnapshotStore(defaults: defaults)
    let snapshot = LandSnapshot(acres: 8, parcels: 1, passbooks: 1, unpinned: 0,
        documents: 1, waiting: 0, readiness: 100, attention: 0, blocking: 0,
        worst: "", kinds: [], holdings: [], updated: Date())
    let alice = store.activate(ownerID: "alice")
    #expect(store.write(snapshot, session: alice))
    #expect(store.read()?.acres == 8)
    _ = store.activate(ownerID: "")
    #expect(store.read() == nil)
    #expect(!store.write(snapshot, session: alice))
    let bob = store.activate(ownerID: "bob")
    #expect(!store.write(snapshot, session: alice))
    #expect(store.read() == nil)
    #expect(store.write(snapshot, session: bob))
    let aliceAgain = store.activate(ownerID: "alice")
    #expect(aliceAgain != alice)
    #expect(!store.write(snapshot, session: alice))
    #expect(!store.write(snapshot, session: bob))
    #expect(store.read() == nil)
}
