import AppIntents
import Foundation
import PattadarKit

/// "File a paper" — the app's one verb, reachable without the app.
///
/// Compiled into BOTH the app and the widget extension (see `project.yml`).
/// An intent with `openAppWhenRun` is performed in the APP's process after the
/// system launches it, so a copy that exists only in the extension would be
/// asked for and not found. PattadarKit would be the tidier home, but app
/// intents inside a Swift package need their own export ceremony to be
/// discovered; one file in two targets is the version that simply works.
struct FileAPaperIntent: AppIntent {
    static let title: LocalizedStringResource = "File a paper"
    static let description = IntentDescription(
        "Open Pattadar ready to photograph a deed or a passbook.")

    /// The whole point is to arrive at the camera, so the app comes up.
    static let openAppWhenRun = true

    init() {}

    @MainActor
    func perform() async throws -> some IntentResult {
        // Said two ways because the process this runs in is not guaranteed.
        // In the app, the notification is heard immediately by whatever is on
        // screen; from anywhere else, the note in the App Group is still there
        // when the app next comes to the front. Both are consumed once.
        SharedSnapshot.requestFiling()
        NotificationCenter.default.post(name: .pattadarOpenFiling, object: nil)
        return .result()
    }
}

extension Notification.Name {
    /// Posted when something outside the app has asked for the filing sheet.
    static let pattadarOpenFiling = Notification.Name("pattadar.openFiling")
}
