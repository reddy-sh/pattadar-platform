import PattadarKit
import QuickLook
import SwiftUI
import UIKit

/// Open a stored document — PDFs, photos, multi-page scans — with pinch-zoom,
/// page thumbnails, Done and Share.
///
/// `QLPreviewController` only draws its own Done and Share buttons when UIKit
/// presents it. Handed to a SwiftUI `.sheet` it renders bare: a document opened
/// full-screen with no way out and no way to send it on. It is therefore
/// wrapped in a navigation controller that supplies both.
struct FileViewer: UIViewControllerRepresentable {
    let url: URL
    /// Shown as the title, so the sheet says which document this is.
    var title: String?
    /// What the outgoing COPY is called. Files are stored as `doc-<uuid>.pdf`
    /// because storage needs a key that cannot collide — but a share names the
    /// document to another person, and a UUID names nothing.
    var shareName: String?

    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UINavigationController {
        let preview = QLPreviewController()
        preview.dataSource = context.coordinator
        preview.delegate = context.coordinator
        preview.title = title ?? url.lastPathComponent
        // "Done", not a bare checkmark: a tick beside an unfamiliar document
        // reads as approval — as though tapping it accepts or verifies what is
        // on screen — when all it does is close the viewer.
        preview.navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Done", image: nil,
            primaryAction: UIAction { _ in context.coordinator.done() })
        preview.navigationItem.rightBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "square.and.arrow.up"),
            primaryAction: UIAction { [weak preview] _ in
                guard let preview else { return }
                context.coordinator.share(from: preview)
            })
        preview.navigationItem.rightBarButtonItem?.accessibilityLabel = "Share"
        let nav = UINavigationController(rootViewController: preview)
        nav.navigationBar.prefersLargeTitles = false
        return nav
    }

    func updateUIViewController(_: UINavigationController, context: Context) {
        context.coordinator.dismiss = { dismiss() }
        context.coordinator.shareName = shareName
    }

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
        let url: URL
        var dismiss: (() -> Void)?
        var shareName: String?
        init(url: URL) { self.url = url }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ c: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }

        func done() { dismiss?() }

        func share(from source: UIViewController) {
            let item = shareableCopy()
            let sheet = UIActivityViewController(activityItems: [item], applicationActivities: nil)
            // Required on iPad: an activity sheet with no anchor crashes there
            // rather than falling back to a centred popover.
            sheet.popoverPresentationController?.barButtonItem =
                source.navigationItem.rightBarButtonItem
            source.present(sheet, animated: true)
        }

        /// A copy under a readable name, in a folder of its own so the same
        /// document shared twice does not accumulate "file 2", "file 3".
        ///
        /// If anything goes wrong the ORIGINAL is shared: a document that
        /// arrives with an ugly name is a nuisance, one that fails to send is a
        /// broken feature.
        private func shareableCopy() -> URL {
            guard let name = shareName, !name.isEmpty else { return url }
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("Share",
                                                                                   isDirectory: true)
            let dest = dir.appendingPathComponent(name)
            do {
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                if FileManager.default.fileExists(atPath: dest.path) {
                    try FileManager.default.removeItem(at: dest)
                }
                try FileManager.default.copyItem(at: url, to: dest)
                return dest
            } catch {
                return url
            }
        }
    }
}
