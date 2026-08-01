import Foundation
import Testing

@testable import PattadarKit

/// "Would your papers stand up if a bank asked today?" A score that cannot say
/// why it is 79% gets ignored the second time somebody sees it.

private func complete() -> ReadinessInput {
    ReadinessInput(hasTitleDocument: true, hasLocation: true, hasRegistrationNumber: true,
                   mutationStatus: "Completed", ecStatus: "Nil encumbrance",
                   taxPaidUpto: "FY 2025-26", litigation: false)
}

@Test("A complete holding scores 100 and lists nothing")
func completeHoldingIsReady() {
    let r = assessReadiness(complete(), thisYear: 2026)
    #expect(r.score == 100)
    #expect(r.isReady)
    #expect(r.failures.isEmpty)
}

@Test("Every failure carries the sentence a person would say about it")
func failuresAreStatedInWords() {
    var input = complete()
    input.mutationStatus = "Pending on Dharani"
    let r = assessReadiness(input, thisYear: 2026)
    #expect(r.failures.map(\.problem) == ["Mutation still pending"])
    // Unmutated land is still the seller's on the revenue record, whatever the
    // deed says — that is not a tidiness problem.
    #expect(r.blocking.count == 1)
    #expect(r.score < 100)
}

@Test("A missing title deed is blocking, a missing pin is not")
func blockingIsDistinguishedFromUntidy() {
    var noTitle = complete(); noTitle.hasTitleDocument = false
    #expect(assessReadiness(noTitle, thisYear: 2026).blocking.map(\.id) == ["title"])

    var noPin = complete(); noPin.hasLocation = false
    let pinned = assessReadiness(noPin, thisYear: 2026)
    #expect(pinned.blocking.isEmpty)
    #expect(pinned.failures.map(\.id) == ["location"])
}

@Test("Litigation is a check, not a footnote somewhere else")
func litigationCountsAgainstTheScore() {
    var input = complete(); input.litigation = true
    let r = assessReadiness(input, thisYear: 2026)
    #expect(r.blocking.map(\.id) == ["litigation"])
    #expect(!r.isReady)
}

@Test("Tax is current for this year and last, stale before that")
func taxCurrency() {
    #expect(taxIsCurrent("FY 2025-26", thisYear: 2026))
    #expect(taxIsCurrent("2026-27", thisYear: 2026))
    #expect(!taxIsCurrent("FY 2021-22", thisYear: 2026))
    // Nothing on file is not the same as paid.
    #expect(!taxIsCurrent("", thisYear: 2026))
    #expect(!taxIsCurrent("paid", thisYear: 2026))
}

@Test("The score never rounds up to a comforting number")
func scoreRoundsDown() {
    var input = complete(); input.hasLocation = false
    let r = assessReadiness(input, thisYear: 2026)
    // Six of seven is 85.7 — shown as 85, because 86 reads as nearly done.
    #expect(r.score == 85)
}

@Test("The dashboard line names holdings rather than counting them")
func blurbNamesTheProblem() {
    var pending = complete(); pending.mutationStatus = "Pending"
    let line = readinessBlurb([
        ("Kondapur field", assessReadiness(pending, thisYear: 2026)),
        ("Nallapadu plot", assessReadiness(complete(), thisYear: 2026)),
    ])
    // "Three parcels need attention" sends somebody hunting.
    #expect(line.contains("Kondapur field — mutation still pending"))
    #expect(!line.contains("Nallapadu"))
    #expect(line.hasPrefix("1 holding"))
}

@Test("Nothing wrong, and nothing at all, read differently")
func emptyAndPerfectAreNotTheSame() {
    #expect(readinessBlurb([]) == "Nothing recorded yet.")
    let allGood = readinessBlurb([("A", assessReadiness(complete(), thisYear: 2026))])
    #expect(allGood.contains("stand up to scrutiny"))
}

@Test("Only the worst three are named, and the rest are counted")
func blurbIsBounded() {
    var bad = complete(); bad.hasTitleDocument = false
    let items = (1...5).map { ("Parcel \($0)", assessReadiness(bad, thisYear: 2026)) }
    let line = readinessBlurb(items)
    #expect(line.contains("and 2 more"))
    #expect(!line.contains("Parcel 4"))
}
