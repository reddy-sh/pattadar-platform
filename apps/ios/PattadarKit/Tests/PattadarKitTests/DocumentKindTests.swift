import Foundation
import Testing

@testable import PattadarKit

/// The icon a document gets is a claim about what it proves. Two of these
/// rules exist only because the obvious matching order gets them wrong.

@Test("The same paper under any of its names gets one icon")
func passbookSynonyms() {
    for name in ["Pattadar Passbook", "ROR/Adangal", "1-B Register", "Adangal", "Pahani", "ror"] {
        #expect(documentKind(name) == .passbook, "\"\(name)\" is a passbook")
    }
}

@Test("A GPA is not a sale deed")
func gpaBeatsDeed() {
    // Written "GPA deed" on half the papers in Guntur. Matching "deed" first
    // would badge an authorisation to act as a transfer of title — the single
    // most consequential thing this icon can get wrong.
    #expect(documentKind("GPA deed") == .powerOfAttorney)
    #expect(documentKind("General Power of Attorney") == .powerOfAttorney)
    #expect(documentKind("Special power of attorney (SPA)") == .powerOfAttorney)
}

@Test("A gift is not a purchase")
func giftBeatsDeed() {
    // "Gift Settlement Deed" contains "deed"; it is not a sale, and the way
    // land was acquired changes what it costs to sell it.
    #expect(documentKind("Gift Settlement Deed") == .giftDeed)
    #expect(documentKind("Settlement deed") == .giftDeed)
    #expect(documentKind("Partition deed") == .partition)
    #expect(documentKind("Will / testament") == .will)
}

@Test("Ordinary transfers and records land on their own kinds")
func theRestClassify() {
    #expect(documentKind("Sale Deed") == .saleDeed)
    #expect(documentKind("SALE DEED (ABSOLUTE)") == .saleDeed)
    #expect(documentKind("Deed of Conveyance") == .saleDeed)
    #expect(documentKind("Encumbrance Certificate") == .encumbrance)
    #expect(documentKind("Mutation order") == .mutation)
    #expect(documentKind("Property tax receipt") == .taxReceipt)
    #expect(documentKind("Aadhaar card") == .identity)
    #expect(documentKind("") == .other)
    #expect(documentKind("something nobody anticipated") == .other)
}

@Test("Every kind has an icon and a tint")
func everyKindIsDrawable() {
    for kind in DocumentKind.allCases {
        #expect(!kind.icon.isEmpty)
        #expect(!kind.tint.isEmpty)
        #expect(!kind.label.isEmpty)
    }
}
