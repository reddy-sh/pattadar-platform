import XCTest

/// Walks every reachable screen and photographs it.
///
/// Written because "BUILD SUCCEEDED" says nothing about what a screen looks
/// like, and this Mac runs its simulators headless — there is no window to
/// eyeball. `xcodebuild test` + `xcresulttool export attachments` is the
/// only pair of eyes available, so it is made a good one. Screens that need
/// live records still need the local stack; everything below renders without.
final class ScreenshotTour: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    func testTour() throws {
        let app = XCUIApplication()
        app.launch()
        pause()
        snap(app, "01-home-signed-out")

        // The four destinations on the bar.
        for name in ["Properties", "Papers", "More"] {
            let tab = app.tabBars.buttons[name]
            if tab.waitForExistence(timeout: 5) {
                tab.tap(); pause()
                snap(app, "02-tab-\(name.lowercased())")
            }
        }

        // Everything under More that renders without a server.
        visit(app, row: "Services", shot: "10-services") { a in
            let order = a.staticTexts["Sy 214/2 · August visit"]
            if order.waitForExistence(timeout: 3) {
                order.tap(); self.pause()
                self.snap(a, "11-order-detail")
                self.goBack(a)
            }
        }
        visit(app, row: "Wallet", shot: "12-wallet")
        visit(app, row: "Tools", shot: "13-tools")
        visit(app, row: "Customise tabs", shot: "14-customise-tabs")
        visit(app, row: "Account", shot: "15-account")

        // The centre button is an action wearing a tab's clothes.
        let file = app.tabBars.buttons["File a document"]
        if file.waitForExistence(timeout: 3) {
            file.tap(); pause()
            snap(app, "16-filing-sheet")
            app.swipeDown(velocity: .fast)
        }
    }

    /// Push a More row, photograph it, run any extra steps, come back.
    private func visit(_ app: XCUIApplication, row: String, shot: String,
                       then extra: ((XCUIApplication) -> Void)? = nil) {
        let more = app.tabBars.buttons["More"]
        if more.exists { more.tap(); pause() }
        let cell = app.buttons[row].firstMatch.exists
            ? app.buttons[row].firstMatch
            : app.staticTexts[row].firstMatch
        guard cell.waitForExistence(timeout: 4) else {
            snap(app, "\(shot)-MISSING-ROW")
            return
        }
        cell.tap(); pause()
        snap(app, shot)
        extra?(app)
        goBack(app)
    }

    private func goBack(_ app: XCUIApplication) {
        let back = app.navigationBars.buttons.element(boundBy: 0)
        if back.exists { back.tap(); pause() }
    }

    private func pause() { Thread.sleep(forTimeInterval: 1.2) }

    private func snap(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
