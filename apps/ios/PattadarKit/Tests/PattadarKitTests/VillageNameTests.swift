import Foundation
import Testing

@testable import PattadarKit

/// Whether two spellings are one village. Ported from
/// `packages/core/src/land/villages.ts` and holding the same line: near-misses
/// merge, genuinely different places never do.

@Test("The same village spelled two ways is one village")
func nearSpellingsMatch() {
    // The pair this logic exists for: the owner writes one, the revenue
    // record writes the other.
    #expect(villageNamesMatch("Katragunta", "Katraguntla"))
    #expect(villageNamesMatch("Mahrajapuram", "Markapuram"))
    #expect(villageNamesMatch("Nallapadu", "nallapadu"))
    // Spacing is not a spelling difference.
    #expect(villageNamesMatch("Mangala Kunta", "Mangalakunta"))
    #expect(villageNamesMatch("Mangalakunta", "Mangala  Kunta"))
}

@Test("Different places never merge")
func differentPlacesDoNotMatch() {
    // Four edits apart, and two different districts. Merging these would put
    // one man's land in another town.
    #expect(!villageNamesMatch("Guntur", "Guntakal"))
    #expect(!villageNamesMatch("Tarlapadu", "Nallapadu"))
    // Short names tolerate NO edits — they differ meaningfully.
    #expect(!villageNamesMatch("Kota", "Kada"))
    #expect(!villageNamesMatch("", "Nallapadu"))
    #expect(!villageNamesMatch("Nallapadu", ""))
}

@Test("The threshold scales with length, and short names never merge")
func thresholdIsScaled() {
    #expect(nameMergeThreshold(4) == 0)
    #expect(nameMergeThreshold(9) == 2)
    #expect(nameMergeThreshold(12) == 3)
}

@Test("A geocoder result is checked against every field that could hold the village")
func candidateFieldsAreAllConsidered() {
    // A revenue village arrives as `subLocality` under a town, or as
    // `locality` in its own right, or only in `name`. Checking one field is
    // how the map decided it had found the place when it had not.
    #expect(matchesRequestedVillage("Katragunta",
                                    candidates: [nil, "Katraguntla", "Prakasam"]))
    #expect(matchesRequestedVillage("Mangala Kunta",
                                    candidates: ["Mangalakunta", nil, nil]))
    #expect(!matchesRequestedVillage("Mangala Kunta",
                                     candidates: ["Sunnyvale", "Santa Clara", "California"]))
    #expect(!matchesRequestedVillage("", candidates: ["Anything"]))
}

@Test("Edit distance is symmetric and zero for equal strings")
func levenshteinBasics() {
    #expect(levenshtein("abc", "abc") == 0)
    #expect(levenshtein("abc", "abd") == 1)
    #expect(levenshtein("", "abc") == 3)
    #expect(levenshtein("katragunta", "katraguntla")
            == levenshtein("katraguntla", "katragunta"))
}
