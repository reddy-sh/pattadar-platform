import Testing

@testable import PattadarKit

// The same cases as packages/core/src/land/units.test.ts, so the two
// implementations of "a unit named for a quantity" cannot drift apart.

@Test("One of a unit is singular")
func oneOfAUnitIsSingular() {
    #expect(UnitKey.acre.label(for: 1) == "Acre")
    #expect(UnitKey.cent.label(for: 1) == "Cent")
    #expect(UnitKey.gunta.label(for: 1) == "Gunta")
    #expect(UnitKey.sqyd.label(for: 1) == "Sq. yard")
    #expect(UnitKey.sqft.label(for: 1) == "Sq. foot")
    #expect(UnitKey.sqm.label(for: 1) == "Sq. metre")
    #expect(UnitKey.hectare.label(for: 1) == "Hectare")
    #expect(UnitKey.ankanam.label(for: 1) == "Ankanam")
}

@Test("Every other count, zero and fractions included, is the plural the picker shows")
func otherCountsArePlural() {
    for unit in UnitKey.allCases {
        for count in [0, 0.5, 1.5, 2, 100] {
            #expect(unit.label(for: count) == unit.label, "\(unit.rawValue) × \(count)")
        }
    }
}

@Test("The stored provenance label is untouched")
func provenanceLabelIsUnchanged() {
    // `label` is what the API stores as a parcel's unit; the singular is only
    // ever for display.
    #expect(UnitKey.acre.label == "Acres")
    #expect(UnitKey.sqyd.label == "Sq. yards")
}
