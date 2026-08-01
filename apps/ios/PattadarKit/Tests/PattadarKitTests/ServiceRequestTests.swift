import Foundation
import Testing

@testable import PattadarKit

/// A request that stalls is invisible until somebody asks, and by then the
/// deadline has moved. These rules decide what the badge says.

@Test("Each kind of work has its own steps, not a generic pending/done")
func stagesAreNamedPerKind() {
    // "Papers sent" and "opinion drafted" are different problems: one waits on
    // the advocate, the other waits on you.
    #expect(RequestKind.legal.stages == ["Asked", "Papers sent", "Opinion drafted", "Signed"])
    #expect(RequestKind.survey.stages == ["Asked", "Accepted", "Measured", "Report"])
    for kind in RequestKind.allCases {
        #expect(kind.stages.count >= 3, "\(kind.rawValue) needs steps worth tracking")
        #expect(kind.stages.first == "Asked")
    }
}

@Test("Waiting on YOU outranks whatever stage it reached")
func needsYouWinsTheBadge() {
    // A request waiting on the owner looks identical to one moving along, and
    // only one of them will stall for a month.
    let p = requestProgress(kind: .legal, stage: 2, needsYou: true, closed: false)
    #expect(p.status == "Needs you")
    #expect(p.stageName == "Opinion drafted")

    let moving = requestProgress(kind: .legal, stage: 2, needsYou: false, closed: false)
    #expect(moving.status == "Opinion drafted")
}

@Test("Closed reads as done regardless of the stage it stopped at")
func closedIsDone() {
    let abandoned = requestProgress(kind: .survey, stage: 1, needsYou: true, closed: true)
    #expect(abandoned.status == "Done")
    #expect(abandoned.isDone)
}

@Test("The last stage counts as finished")
func lastStageIsFinished() {
    #expect(requestProgress(kind: .photos, stage: 3, needsYou: false, closed: false).isDone)
    #expect(!requestProgress(kind: .photos, stage: 2, needsYou: false, closed: false).isDone)
}

@Test("A stage index out of range never crashes or names a phantom step")
func stageIndexIsClamped() {
    let over = requestProgress(kind: .errand, stage: 99, needsYou: false, closed: false)
    #expect(over.stageName == "Updated")
    #expect(over.isDone)
    let under = requestProgress(kind: .errand, stage: -5, needsYou: false, closed: false)
    #expect(under.stageName == "Asked")
}

@Test("The Home chip says how much is open and what is on you")
func homeChipCounts() {
    #expect(openRequestSummary([]) == "Get it done")
    // Closed work is not outstanding.
    #expect(openRequestSummary([(false, true), (false, true)]) == "Get it done")
    #expect(openRequestSummary([(false, false), (false, false)]) == "Get it done · 2")
    // The part waiting on YOU is the part that will not move by itself.
    #expect(openRequestSummary([(true, false), (false, false), (false, true)])
            == "Get it done · 2, 1 on you")
}

@Test("Prices are stated as guides, never as quotes")
func pricesAreIndicative() {
    // Nobody here is contracted to do this work, so a firm figure would be an
    // invention.
    for kind in RequestKind.allCases {
        #expect(kind.priceHint.contains("usually"), "\(kind.rawValue) quotes a firm price")
    }
}
