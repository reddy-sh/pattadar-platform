import Foundation
import Testing

@testable import PattadarKit

/// Every create/update/delete path, against the running API.
///
/// Uses its OWN user, never u01 — earlier write tests ran as a real account and
/// left ten rows in an append-only audit log that had to be cleaned out of the
/// founder's activity feed by hand.
private let testUser = "ios.crud.test"

private func liveAPI() async -> PattadarAPI? {
    let base = URL(string: "http://127.0.0.1:8080")!
    var probe = URLRequest(url: base.appendingPathComponent("health"))
    probe.timeoutInterval = 2
    guard let (_, r) = try? await URLSession.shared.data(for: probe),
          (r as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return PattadarAPI(config: .init(baseURL: base, userID: testUser))
}

private struct MadeKhata: Decodable { let createPassbook: IDPayload? }
private struct EditedKhata: Decodable { let updatePassbook: IDPayload? }
private struct MadeParcel: Decodable { let createParcel: IDPayload? }
private struct EditedParcel: Decodable { let updateParcel: IDPayload? }
private struct MadeGroup: Decodable { let createGroup: IDPayload? }
private struct EditedGroup: Decodable { let updateGroup: IDPayload? }
private struct AddedMember: Decodable { let addMember: IDPayload? }
/// Deletes return a Boolean. Decoding into an empty struct accepted `false`
/// as success, so a delete that matched no rows passed silently. Each has its
/// own type and each is asserted.
private struct DeletedKhata: Decodable { let deletePassbook: Bool }
private struct DeletedParcel: Decodable { let deleteParcel: Bool }
private struct DeletedGroup: Decodable { let deleteGroup: Bool }
private struct RemovedMember: Decodable { let removeMember: Bool }

@Test("A khata can be created, corrected, and deleted")
func khataLifecycle() async throws {
    guard let api = await liveAPI() else { return }
    let made = try await api.query(Mutations.createPassbook, variables: [
        "pattadarNo": "CRUD-1", "state": "Andhra Pradesh", "district": "Prakasam",
        "mandal": "Konakanamitla", "village": "Katragunta",
        "ownerName": "Before Edit", "fatherHusbandName": "", "groupId": "",
    ], as: MadeKhata.self)
    let id = try #require(made.createPassbook?.id)

    // The whole point of update_passbook: a misread owner used to mean
    // deleting the khata, which takes its parcels with it.
    _ = try await api.query(Mutations.updatePassbook, variables: [
        "id": id, "pattadarNo": "CRUD-1", "ownerName": "After Edit",
        "fatherHusbandName": "", "state": "Andhra Pradesh",
        "district": "Prakasam", "mandal": "Konakanamitla", "village": "Katragunta",
    ], as: EditedKhata.self)

    let books = try await api.query(Queries.passbooks, as: PassbooksResponse.self)
    let found = try #require(books.passbooks.first { $0.id == id })
    #expect(found.ownerName == "After Edit")
    // A partial update must not blank the fields it did not mention.
    #expect(found.village == "Katragunta")
    #expect(found.district == "Prakasam")

    #expect(try await api.query(Mutations.deletePassbook, variables: ["id": id], as: DeletedKhata.self).deletePassbook)
}

@Test("A parcel can be edited without losing its khata, and deleted")
func parcelLifecycle() async throws {
    guard let api = await liveAPI() else { return }
    let khata = try await api.query(Mutations.createPassbook, variables: [
        "pattadarNo": "CRUD-2", "state": "AP", "district": "Prakasam", "mandal": "K",
        "village": "Katragunta", "ownerName": "Owner", "fatherHusbandName": "", "groupId": "",
    ], as: MadeKhata.self)
    let khataID = try #require(khata.createPassbook?.id)

    let made = try await api.query(Mutations.createParcel, variables: [
        "passbookId": khataID, "surveyNo": "99", "subdivision": "",
        "extent": toAcres(40, .gunta), "unit": UnitKey.gunta.label,
        "classification": "agri", "acquisitionSource": "", "parentParcelId": "", "source": "crud-test",
    ], as: MadeParcel.self)
    let parcelID = try #require(made.createParcel?.id)

    // Edit to 2 acres. The unit label rides along; the number is acres.
    _ = try await api.query(Mutations.updateParcel, variables: [
        "id": parcelID, "surveyNo": "99/A", "subdivision": "A",
        "extent": toAcres(2, .acre), "unit": UnitKey.acre.label, "classification": "non-agri",
    ], as: EditedParcel.self)

    let holdings = try await api.query(Queries.holdings, as: HoldingsResponse.self)
    let p = try #require(holdings.parcels.first { $0.id == parcelID })
    #expect(p.surveyNo == "99/A")
    #expect(abs(p.extent - 2.0) < 1e-9, "extent should be 2 acres, got \(p.extent)")
    #expect(p.passbookId == khataID, "an edit must not orphan the parcel from its khata")

    #expect(try await api.query(Mutations.deleteParcel, variables: ["id": parcelID], as: DeletedParcel.self).deleteParcel)
    #expect(try await api.query(Mutations.deletePassbook, variables: ["id": khataID], as: DeletedKhata.self).deletePassbook)
}

@Test("A group can be created, renamed, given a member, and deleted")
func groupLifecycle() async throws {
    guard let api = await liveAPI() else { return }
    let made = try await api.query(Mutations.createGroup,
                                   variables: ["t": "family", "n": "CRUD group", "d": "a note"],
                                   as: MadeGroup.self)
    let id = try #require(made.createGroup?.id)
    // Runs even when an assertion below throws. Without it, the first failing
    // run of this test left a group in the database.
    defer {
        Task { _ = try? await api.query(Mutations.deleteGroup, variables: ["id": id], as: DeletedGroup.self) }
    }

    // updateGroup takes name AND description positionally — sending only the
    // name would erase the note. Both are always sent.
    _ = try await api.query(Mutations.updateGroup,
                            variables: ["id": id, "n": "CRUD group renamed", "d": "a note"],
                            as: EditedGroup.self)

    let added = try await api.query(Mutations.addMember, variables: [
        "groupId": id, "name": "Test Heir", "relation": "son", "role": "Member",
        // A beneficiary must be reachable: the server refuses one that is not,
        // because an heir who cannot be contacted cannot confirm they accept.
        "gender": "", "dob": "", "phone": "9999900000", "email": "", "bio": "", "photo": "",
        "fatherId": "", "motherId": "", "spouseId": "",
        "isBeneficiary": true, "sharePct": 50.0, "kind": "", "parcelId": "",
        "presentAddress": "", "aadhaar": "", "guardianName": "", "guardianContact": "",
        "maritalStatus": "", "spouseName": "", "spouseContact": "", "spouseStatus": "",
    ], as: AddedMember.self)
    let memberID = try #require(added.addMember?.id)

    let groups = try await api.query(Queries.groups, as: GroupsResponse.self)
    let g = try #require(groups.groups.first { $0.id == id })
    #expect(g.name == "CRUD group renamed")
    #expect(g.description == "a note", "the note must survive a rename")

    #expect(try await api.query(Mutations.removeMember, variables: ["id": memberID], as: RemovedMember.self).removeMember)
    #expect(try await api.query(Mutations.deleteGroup, variables: ["id": id], as: DeletedGroup.self).deleteGroup)
}

private struct Toggled: Decodable { let toggleFavourite: Bool }

@Test("Starring is idempotent and survives a round trip")
func favouriteToggle() async throws {
    guard let api = await liveAPI() else { return }
    let id = "fav-test-\(UUID().uuidString)"

    // The mutation returns the state AFTER the toggle, so a caller never has
    // to guess — and a double tap cannot leave two rows.
    let on = try await api.query(Mutations.toggleFavourite,
                                 variables: ["type": "parcel", "id": id], as: Toggled.self)
    #expect(on.toggleFavourite, "first toggle should star it")

    let listed = try await api.query(Queries.favourites, as: FavouritesResponse.self)
    #expect(listed.favourites.contains { $0.entityId == id && $0.entityType == "parcel" })

    let off = try await api.query(Mutations.toggleFavourite,
                                  variables: ["type": "parcel", "id": id], as: Toggled.self)
    #expect(!off.toggleFavourite, "second toggle should unstar it")

    let after = try await api.query(Queries.favourites, as: FavouritesResponse.self)
    #expect(!after.favourites.contains { $0.entityId == id })
}
