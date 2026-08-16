import SwiftUI
import WidgetKit

/// Everything Pattadar puts outside the app.
///
/// Three widgets and one control, which between them cover the four surfaces
/// iOS offers: the Home Screen (and StandBy, which draws the small one), the
/// Lock Screen, Control Centre, and the strip that appears under the app icon
/// when it is held down — that strip is simply this bundle, so an app with one
/// family in it has one thing to offer there and an app with five has five.
@main
struct PattadarWidgets: WidgetBundle {
    var body: some Widget {
        LandWidget()
        AttentionWidget()
        HoldingWidget()
        // Controls arrived in iOS 18; the app still runs on 17.
        if #available(iOS 18.0, *) {
            FilingControl()
        }
    }
}

/// The Control Centre and Lock Screen button.
///
/// Filing a paper is the thing people open this app to do, and it was behind
/// unlocking the phone, finding the icon and tapping the centre of the tab
/// bar. From here it is one press from a locked screen.
@available(iOS 18.0, *)
struct FilingControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.rfactory.pattadar.control.file") {
            ControlWidgetButton(action: FileAPaperIntent()) {
                Label("File a paper", systemImage: "doc.viewfinder")
            }
        }
        .displayName("File a paper")
        .description("Photograph a deed or passbook straight into your vault.")
    }
}
