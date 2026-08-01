import Foundation
import Testing

@testable import PattadarKit

/// Where the map opens. Each of these is a bug that put a holding in the wrong
/// part of the world.

@Test("The mandal is part of the address, not an optional extra")
func mandalIsIncluded() {
    // Village names repeat within a district; the mandal is what tells two
    // Katraguntas apart. Parcels were aimed on village + district alone.
    let q = placeQuery(["Mangala Kunta", "Tarlapadu", "Prakasam", "Andhra Pradesh"])
    #expect(q == "Mangala Kunta, Tarlapadu, Prakasam, Andhra Pradesh, India")
}

@Test("Smallest place first")
func orderIsSpecificToGeneral() {
    // "Andhra Pradesh, Prakasam, Tarlapadu, Mangala Kunta" resolves to the
    // state. The order is what makes the geocoder pick the village.
    let q = placeQuery(["Mangala Kunta", "Tarlapadu", "Prakasam"])
    #expect(q.hasPrefix("Mangala Kunta"))
    #expect(q.hasSuffix("India"))
}

@Test("A village named after its mandal is not said twice")
func duplicatesCollapse() {
    #expect(placeQuery(["Markapuram", "Markapuram", "Prakasam"])
            == "Markapuram, Prakasam, India")
    // Case and stray spacing are the same name.
    #expect(placeQuery(["Nallapadu", " nallapadu ", "Guntur"])
            == "Nallapadu, Guntur, India")
}

@Test("Blanks are dropped, never rendered as empty segments")
func blanksAreDropped() {
    #expect(placeQuery(["Nallapadu", "", nil, "Guntur"]) == "Nallapadu, Guntur, India")
    #expect(!placeQuery([nil, "Guntur"]).contains(", ,"))
}

@Test("Naming no place is distinguishable from naming the country")
func emptyMeansUnknown() {
    // The parcel screen collapsed to "India" whenever the passbook had not
    // loaded — and a map aimed at "India" does not move at all, so it sat on
    // whatever it showed last. On a fresh install that is California.
    #expect(placeQuery([nil, "", "  "]) == "")
    #expect(!canAimAt(placeQuery([])))
    #expect(canAimAt(placeQuery(["Nallapadu"])))
    // The country is never the only thing in the string.
    #expect(placeQuery(["", nil]) != "India")
}

@Test("A place that already names the country does not repeat it")
func countryIsNotDoubled() {
    let q = placeQuery(["Nallapadu", "Guntur", "India"])
    #expect(q == "Nallapadu, Guntur, India")
}
