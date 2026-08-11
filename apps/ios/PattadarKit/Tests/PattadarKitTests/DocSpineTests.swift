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

    @Test func theFMBSheetIsNamedByItsSurvey() {
        // The founder's real FMB, as its legacy reading stands: no document
        // number, no extent column — only the sheet's own derived geometry.
        // A sheet with no registrar's number is known as "the Sy. 1 sheet",
        // and what it measures is the area its ring actually maps.
        let reading: [String: Any] = [
            "survey_no": "01",
            "geometry": ["area_ac": 59.899999999999999],
        ]
        let s = docSpine(docType: "FMB", village: "Mangalakunta",
                         surveyNo: "01", reading: reading)
        #expect(s.family == "map")
        #expect(s.identityLabel == "Sy. 1 sheet")
        #expect(s.quantumLine == "59.9 ac mapped")
    }

    @Test func aNewSpecSheetKeepsItsSubdivisionsAndMappedArea() {
        // A reading under the extraction spec: the spine names every
        // subdivision and the quantum carries the mapped extent.
        let reading: [String: Any] = [
            "family": "map",
            "spine": [
                "place": ["village": "Mangalakunta",
                          "survey": [["no": "1", "sub": "1"], ["no": "1", "sub": "2"],
                                     ["no": "1", "sub": "3"], ["no": "1", "sub": "4"]]],
                "quantum": ["extent_ac": 197.05],
            ],
        ]
        let s = docSpine(docType: "FMB", reading: reading)
        #expect(s.identityLabel == "Sy. 1 sheet")
        #expect(s.surveys == ["1/1", "1/2", "1/3", "1/4"])
        #expect(s.quantumLine == "197.05 ac mapped")
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

    @Test func legacyCaveatsStayQuietInTheList() {
        // The caveat itemises on the document page (review.count == 1) but
        // never badges a row or inflates the banner (actionable is empty).
        let s = docSpine(docType: "Sale Deed", reading: deedReading)
        #expect(s.review.count == 1)
        #expect(s.actionable.isEmpty)
        // watch_out is the one legacy line that KEEPS its voice: high, first,
        // and loud enough for the banner.
        var withWatch = deedReading
        withWatch["watch_out"] = "The GPA behind this sale is not attached."
        let w = docSpine(docType: "Sale Deed", reading: withWatch)
        #expect(w.review.count == 2)
        #expect(w.review.first?.code == "watch_out" && w.review.first?.severity == "high")
        #expect(w.actionable.count == 1)
        // A reader-emitted item is loud in both places.
        let read: [String: Any] = [
            "review": [["code": "stale_extract", "severity": "low",
                        "text": "Extract older than 12 months.", "page": 1]],
        ]
        #expect(docSpine(docType: "1B", reading: read).actionable.count == 1)
    }

    @Test func theSpineItselfMasksASensitiveIdentity() {
        // An Aadhaar whose own number reaches the identity slot — via a
        // reader spine label or the documentNo column — is masked AT the
        // spine, so every downstream row, tile and title inherits the safe
        // form without knowing the rule.
        let viaSpine: [String: Any] = [
            "spine": ["identity": ["label": "4821 9930 8412"]],
        ]
        #expect(docSpine(docType: "Aadhaar", reading: viaSpine).identityLabel == "×××× ×××× 8412")
        let viaColumn = docSpine(docType: "Aadhaar", documentNo: "482199308412")
        #expect(!viaColumn.identityLabel.contains("482199308412"))
    }

    @Test func numericSubdivisionsSurviveTheReaderSpine() throws {
        // JSON numbers arrive as NSNumber — {"no": 128, "sub": 1} must yield
        // 128/1, not 128. Built via JSONSerialization to match production.
        let json = #"{"spine": {"place": {"village": "Mangalakunta", "survey": [{"no": 128, "sub": 1}]}}}"#
        let reading = try #require(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        let s = docSpine(docType: "Sale Deed", reading: reading)
        #expect(s.surveys == ["128/1"])
        #expect(s.placeLine == "Mangalakunta · Sy 128/1")
    }

    @Test func anIdentityCardSpinesAsAPerson() {
        // The reader emits the number pre-masked, the holder in owner_name,
        // the DOB in dob — and the spine's quantum slot carries the DOB, the
        // way the founder's own spine table writes an Aadhaar.
        let reading: [String: Any] = [
            "owner_name": "Sankara Reddy Telukutla",
            "dob": "1981-04-02",
        ]
        let s = docSpine(docType: "Aadhaar", documentNo: "XXXX XXXX 8203", reading: reading)
        #expect(s.family == "identity")
        #expect(s.partiesLine == "Sankara Reddy Telukutla")
        #expect(s.primaryPerson == "Sankara Reddy Telukutla")
        #expect(s.quantumLine == "DOB 2 April 1981")
    }

    @Test func theNumberReadsBackOffTheLocalCard() {
        // The founder's own e-Aadhaar text layer, as PDFKit extracts it.
        let cardText = "మీ ఆధార్ సంఖ్య / Your Aadhaar No. :\n5499 8605 8203\nనా ఆధార్, నా గుర్తింపు"
        #expect(firstIdentityNumber(in: cardText) == "5499 8605 8203")
        #expect(firstIdentityNumber(in: "PAN: ABCDE1234F") == "ABCDE1234F")
        #expect(firstIdentityNumber(in: "549986058203") == "5499 8605 8203")
        // Enrolment numbers, phones, PINs and dates never read as the number.
        #expect(firstIdentityNumber(in: "Enrolment No.: 2052/31604/73664 · 9866424000 · 523246 · 02/04/1981") == nil)
    }

    @Test func proseNeverCarriesAnOpenIdentityNumber() {
        // The founder's own Aadhaar upload: the reader wrote the number into
        // a key point. Whatever the reader emits, the screen masks.
        #expect(maskSensitiveText("Aadhaar number: 5499 8605 8203")
                == "Aadhaar number: ×××× ×××× 8203")
        #expect(maskSensitiveText("PAN ABCDE1234F is linked") == "PAN ××××××234F is linked")
        #expect(maskSensitiveText("number 549986058203 on file")
                == "number ××××××××8203 on file")
        // A caveat built from that prose is masked at the spine too.
        let reading: [String: Any] = ["caveats": ["Aadhaar 5499 8605 8203 read from page 1."]]
        let s = docSpine(docType: "Aadhaar", reading: reading)
        #expect(s.review.first?.text.contains("5499") == false)
        // Land-record prose is untouched: doc numbers, khatas, years, extents.
        let deed = "Sale Deed 6337/2024 for 25.00 acres under Khata 397"
        #expect(maskSensitiveText(deed) == deed)
    }

    @Test func identityNumbersNeverSitOpen() {
        #expect(isSensitiveIdentityValue("4821 9930 8412"))
        #expect(isSensitiveIdentityValue("482199308412"))
        #expect(isSensitiveIdentityValue("ABCDE1234F"))
        // A document number, a year, a khata — not identity numbers.
        #expect(!isSensitiveIdentityValue("6337 / 2024"))
        #expect(!isSensitiveIdentityValue("Khata 397"))
        #expect(maskedIdentity("4821 9930 8412") == "×××× ×××× 8412")
        #expect(maskedIdentity("ABCDE1234F") == "××××××234F")
    }

    @Test func reviewIdentityIsStable() {
        // Spines are recomputed on every refresh; the rows must not churn.
        let a = docSpine(docType: "Sale Deed", reading: deedReading)
        let b = docSpine(docType: "Sale Deed", reading: deedReading)
        #expect(a.review.map(\.id) == b.review.map(\.id))
    }
}
