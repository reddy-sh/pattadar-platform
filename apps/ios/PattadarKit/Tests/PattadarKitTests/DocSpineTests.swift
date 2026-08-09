import Foundation
import PattadarKit
import Testing

/// The spine and the normalisation rules, pinned with the founder's real
/// documents — the spec's own instruction: tests from real documents, not
/// synthetic ones.
struct DocSpineTests {
    // The 6337/2024 deed, as its legacy reading stands in the vault today.
    let deedReading: [String: Any] = [
        "parties": [
            ["role": "seller", "name": "Ravi Rathamma"],
            ["role": "buyer", "name": "Telukutla Sankara Reddy"],
        ],
        "caveats": ["Read as Ravi Rathamma transferring to Telukutla Sankara Reddy — check this against the original."],
    ]

    @Test func legacyDeedSynthesisesAFullSpine() {
        let s = docSpine(docType: "Sale Deed", documentNo: "6337", regYear: "2024",
                         village: "Mangalakunta", surveyNo: "1",
                         extent: "25.00 acres", consideration: 5_000_000,
                         reading: deedReading)
        #expect(s.family == "title")
        #expect(s.identityLabel == "6337 / 2024")
        #expect(s.placeLine == "Mangalakunta · Sy 1")
        #expect(s.partiesLine == "Ravi Rathamma → Telukutla Sankara Reddy")
        #expect(s.primaryPerson == "Telukutla Sankara Reddy")
        #expect(s.quantumLine == "25.00 acres · ₹50,00,000")
        #expect(s.review.count == 1 && s.review[0].severity == "medium")
    }

    @Test func readerSpineWinsOverLegacyColumns() {
        let reading: [String: Any] = [
            "family": "revenue",
            "spine": [
                "identity": ["label": "Khata 567"],
                "place": ["village": "Mangala Kunta",
                          "survey": [["no": "1", "sub": "C1B"]]],
                "quantum": ["extent_ac": 5.0],
            ],
            "owner_name": "Telukutla Swetha",
            "review": [["code": "stale_extract", "severity": "low",
                        "text": "Extract older than 12 months.", "page": 1]],
        ]
        let s = docSpine(docType: "ROR/Adangal", village: "IGNORED", reading: reading)
        #expect(s.identityLabel == "Khata 567")
        #expect(s.placeLine == "Mangala Kunta · Sy 1/C1B")
        #expect(s.partiesLine == "Telukutla Swetha")
        #expect(s.quantumLine == "5 ac")
        #expect(s.review.first?.code == "stale_extract")
    }

    @Test func familiesFollowTheTwelveTypes() {
        #expect(documentFamily("Gift Deed") == "title")
        #expect(documentFamily("Pattadar Passbook") == "revenue")
        #expect(documentFamily("FMB") == "map")
        #expect(documentFamily("Aadhaar") == "identity")
        #expect(documentFamily("Encumbrance Certificate") == "search")
        #expect(documentFamily("Tax Receipt") == "search")
    }

    @Test func surveyNumbersAreNeverPlainStrings() {
        #expect(surveyParts("128/1A") == ("128", "1A"))
        #expect(surveyParts("1") == ("1", ""))
        #expect(surveyParts("183-3") == ("183", "3"))
    }

    @Test func fasliAndNamesNormalise() {
        // 1434 F → 2024–25, the founder's own deed year.
        #expect(fasliToGregorian(1434) == "2024–25")
        // Surname order and honorifics never break a match; S/o is relation.
        #expect(nameKey("Telukutla Sankara Reddy") == nameKey("Sankara Reddy Telukutla"))
        #expect(nameKey("Sri Sankara Reddy S/o Venkata Reddy") == nameKey("Sankara Reddy"))
        #expect(nameKey("Ravi Rathamma") != nameKey("Ravi Ramesh Reddy"))
    }

    @Test func theStandardExtentFailureIsCaught() {
        // 25 acres vs 10.00 ha: agree (10 ha = 24.71 ac, within 2%).
        #expect(extentsAgree(acres: 25.0, hectares: 10.0))
        // 25 CENTS (0.25 ac) vs 10 ha: the classic misread — flagged.
        #expect(!extentsAgree(acres: 0.25, hectares: 10.0))
        // One unit missing: nothing to reconcile, nothing to flag.
        #expect(extentsAgree(acres: 25, hectares: 0))
    }

    @Test func theUnitConflictReachesTheReview() {
        // The reconciliation is not advice — a disagreeing pair of units must
        // surface as a high-severity review item even when the reader missed it.
        let misread: [String: Any] = [
            "spine": ["quantum": ["extent_ac": 0.25, "extent_ha": 10.0]],
        ]
        let s = docSpine(docType: "Sale Deed", reading: misread)
        #expect(s.review.contains { $0.code == "unit_conflict" && $0.severity == "high" })

        // A reader that already flagged it is not flagged twice.
        let flagged: [String: Any] = [
            "spine": ["quantum": ["extent_ac": 0.25, "extent_ha": 10.0]],
            "review": [["code": "unit_conflict", "severity": "high",
                        "text": "Schedule says cents; the hectare figure means acres.",
                        "page": 5]],
        ]
        #expect(docSpine(docType: "Sale Deed", reading: flagged).review.count == 1)
    }

    @Test func unknownPapersAdmitIt() {
        // Defaulting to "title" would dress any unread scrap in deed blue.
        #expect(documentFamily("Panchanama") == "unsorted")
        #expect(documentFamily("Household survey") == "unsorted")
        // "old" alone never matches — but the real old records do.
        #expect(documentFamily("Sethwar") == "old_record")
        #expect(documentFamily("Re-settlement register") == "old_record")
        // Mutation is a revenue proceeding, not a deed.
        #expect(documentFamily("Mutation / ROR proceeding") == "revenue")
    }

    @Test func everyFamilyDressesItsOwnWay() {
        let families = ["title", "revenue", "map", "identity", "search", "old_record"]
        // Six families, six distinct colours — and the unknown wears grey.
        #expect(Set(families.map(familyTint)).count == families.count)
        #expect(familyTint("unsorted") == "gray")
        #expect(familyLabel("search") == "Search & tax")
        #expect(familyLabel("unsorted") == "Unsorted")
    }

    @Test func theTileLettersFollowTheKind() {
        #expect(documentMono("Sale Deed") == "SD")
        #expect(documentMono("GPA deed") == "GP")          // GPA beats "deed"
        #expect(documentMono("ROR/Adangal") == "AD")
        #expect(documentMono("Pattadar Passbook") == "1B")
        #expect(documentMono("Encumbrance Certificate") == "EC")
        #expect(documentMono("Kist receipt") == "₹")
        #expect(documentMono("FMB") == "FM")
        #expect(documentMono("Aadhaar") == "AA")
        #expect(documentMono("Sethwar") == "SE")
    }

    @Test func reviewIdentityIsStable() {
        // Spines are recomputed on every refresh; the rows must not churn.
        let a = docSpine(docType: "Sale Deed", reading: deedReading)
        let b = docSpine(docType: "Sale Deed", reading: deedReading)
        #expect(a.review.map(\.id) == b.review.map(\.id))
    }
}
