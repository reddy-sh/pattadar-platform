import Foundation
import PattadarKit
import Testing

/// Each kind of paper is recognised by its own facts — pinned with the
/// founder's real documents.
struct VaultKeyInfoTests {
    @Test func saleDeedShowsNumberExtentAndNewOwner() {
        let line = vaultKeyInfo(
            docType: "Sale Deed", documentNo: "6337", regYear: "2024",
            village: "Mangalakunta", surveyNo: "1", extent: "25.00 acres",
            reading: ["parties": [
                ["role": "seller", "name": "Ravi Rathamma"],
                ["role": "buyer", "name": "Telukutla Sankara Reddy"],
            ]])
        #expect(line == "Doc 6337/2024 · 25.00 acres · Telukutla Sankara Reddy")
    }

    @Test func rorShowsKhataHolderVillage() {
        let line = vaultKeyInfo(
            docType: "ROR/Adangal", village: "Mangala Kunta",
            reading: ["pattadar_no": "567", "owner_name": "Telukutla Swetha"])
        #expect(line == "Khata 567 · Telukutla Swetha · Mangala Kunta")
    }

    @Test func fmbShowsVillageSurveyExtent() {
        let line = vaultKeyInfo(
            docType: "FMB", village: "Mangalakunta", surveyNo: "01",
            extent: "Ac 197-05 Cent")
        #expect(line == "Mangalakunta · Sy 01 · Ac 197-05 Cent")
    }

    @Test func aadhaarShowsNameAndDOB() {
        let line = vaultKeyInfo(docType: "Aadhaar",
                                reading: ["name": "Sankara Reddy", "dob": "1975-06-01"])
        #expect(line == "Sankara Reddy · 1975-06-01")
    }

    @Test func unknownKindFindsKeyFactsItself() {
        let line = vaultKeyInfo(
            docType: "Other", village: "Nallapadu", surveyNo: "563/5",
            extent: "418.5 sq. yd", reading: ["owner_name": "Ch. Sridevi"])
        // The first three identifying facts, never more.
        #expect(line == "Sy 563/5 · Ch. Sridevi · 418.5 sq. yd")
    }

    @Test func missingPiecesDropOutCleanly() {
        // A deed with no buyer read and no year still says what it can.
        #expect(vaultKeyInfo(docType: "Gift Deed", documentNo: "88", extent: "5 cents")
                == "Doc 88 · 5 cents")
        #expect(vaultKeyInfo(docType: "Sale Deed").isEmpty)
    }
}
