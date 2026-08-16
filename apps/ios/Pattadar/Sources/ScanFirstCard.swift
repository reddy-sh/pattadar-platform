import PattadarKit
import PhotosUI
import SwiftUI
import VisionKit

/// What a read produced, handed back so the caller can file the document.
struct ScanResult {
    let fields: [String: Any]
    let fileURL: URL
    let originalName: String
    var headline: String { fields["headline"] as? String ?? "" }
    var summary: String { fields["summary"] as? String ?? "" }
    var caveats: [String] { fields["caveats"] as? [String] ?? [] }
}

/// Reading the paper is the point; typing is the fallback — and a fallback is
/// only a fallback if it stays out of the way until it is needed.
///
/// Three states, which is where every scan-first flow lands:
///   idle    — the scan owns the screen; hand entry is one quiet link
///   reading — real byte progress while sending, then an honest counter
///   failed  — the scan collapses to one retry, and the form opens itself,
///             because when the automatic path breaks the manual one must
///             already be in front of you
struct ScanFirstCard: View {
    @Environment(AppModel.self) private var app

    let title: String
    let body_: String
    let endpoint: PattadarAPI.ExtractionEndpoint
    @Binding var manualOpen: Bool
    /// Owned by the caller, because the caller owns the form this filled and
    /// therefore owns when it is thrown away.
    @Binding var result: ScanResult?
    let onResult: (ScanResult) -> Void

    /// Identity of THIS card, so a read started elsewhere — or in a previous
    /// visit to this screen — is never adopted here.
    @State private var id = UUID()
    @State private var showCamera = false
    @State private var showFiles = false
    @State private var photoItem: PhotosPickerItem?

    /// What THIS card is doing. A read belonging to another card — or to a
    /// finished visit — leaves this one idle, showing its pickers, rather than
    /// displaying someone else's progress bar or result.
    private var state: AppModel.ReadState {
        app.ownsRead(id) ? app.readState : .idle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            switch state {
            case .idle:
                pickers
                if !manualOpen {
                    Button("Enter the details by hand instead") { manualOpen = true }
                        .font(.footnote)
                }
            case .sending, .reading:
                progress
            case .failed(let message):
                failureView(message)
            case .done:
                if let r = result {
                    summaryCard(r)
                } else {
                    pickers
                }
            }
        }
        .sheet(isPresented: $showCamera) {
            DocumentCamera { url in app.startRead(endpoint, fileURL: url, name: url.lastPathComponent, owner: id) }
                .ignoresSafeArea()
        }
        .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .image]) { res in
            guard case .success(let url) = res else { return }
            startSecurityScoped(url)
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            startPhoto(item)
        }
        // The read lives in the model, so a finished one is picked up whether
        // this view was on screen when it landed or not.
        .onChange(of: app.readState) { _, now in
            if now == .done, app.ownsRead(id), let r = app.readResult,
               result?.originalName != r.originalName {
                result = r
                manualOpen = true
                onResult(r)
            }
        }
        .onAppear {
            // Only a read this card is still waiting on — one it started before
            // the person navigated away and came back.
            if state == .done, let r = app.readResult, result == nil {
                result = r
                manualOpen = true
                onResult(r)
            }
        }
    }

    /// The whole area, while it is working. No ghost buttons behind it.
    private var progress: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            HStack(spacing: Space.md) {
                ProgressView()
                VStack(alignment: .leading, spacing: Space.hair) {
                    switch state {
                    case .sending(let fraction):
                        Text("Sending the document… \(Int(fraction * 100))%")
                            .font(.subheadline.weight(.medium))
                        Text("Keep the app open until this finishes.")
                            .font(.caption).foregroundStyle(.secondary)
                    case .reading(let seconds):
                        Text("Reading the document… \(seconds)s")
                            .font(.subheadline.weight(.medium))
                        // The upload is done; the rest is on the server. There
                        // is no reason to hold anyone here for another minute.
                        Text("Sent. You can close this and carry on — we’ll tell you when it’s read.")
                            .font(.caption).foregroundStyle(.secondary)
                    default: EmptyView()
                    }
                }
                Spacer()
            }
            if case .sending(let fraction) = state {
                ProgressView(value: fraction).tint(.accentColor)
            }
            Button(role: .cancel) { app.cancelRead() } label: {
                Text("Stop").font(.footnote)
            }
        }
        .padding(Space.md)
        .background(RoundedRectangle(cornerRadius: Radius.control).fill(Color(.secondarySystemFill)))
    }

    private func failureView(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Label("The document couldn’t be read", systemImage: "exclamationmark.circle")
                .foregroundStyle(Palette.danger).font(.subheadline.weight(.semibold))
            Text(message).font(.caption).foregroundStyle(.secondary)
            HStack(spacing: Space.md) {
                Button { app.clearRead() } label: {
                    Label("Try again", systemImage: "arrow.clockwise").font(.footnote)
                }
                Button("Enter by hand") { manualOpen = true; app.clearRead() }
                    .font(.footnote)
            }
        }
        .padding(Space.md)
        .background(RoundedRectangle(cornerRadius: Radius.control).fill(Palette.danger.opacity(0.08)))
    }

    /// Full-width labelled rows, the way every messaging app offers an
    /// attachment.
    ///
    /// These were three bordered chips reading "Scan", "Photos", "Files" —
    /// truncating on a narrow phone, and naming a SOURCE rather than an action.
    /// A row with an icon, a verb and a line of explanation is both bigger to
    /// hit and says what will happen.
    private var pickers: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            Text(title).font(.headline)
            Text(body_).font(.caption).foregroundStyle(.secondary)

            VStack(spacing: 0) {
                // Photographing the paper is the common case for someone
                // holding a deed, so it leads.
                pickerRow("doc.viewfinder", "Scan the document",
                          "Use the camera — several pages become one file") {
                    showCamera = true
                }
                Divider().padding(.leading, 52)
                PhotosPicker(selection: $photoItem, matching: .images) {
                    pickerLabel("photo.on.rectangle.angled", "Choose a photo",
                                "A picture you have already taken")
                }
                .buttonStyle(.plain)
                Divider().padding(.leading, 52)
                pickerRow("folder", "Choose from files",
                          "A PDF or image from Files, iCloud or Drive") {
                    showFiles = true
                }
            }
            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
    }

    private func pickerRow(_ icon: String, _ title: String, _ note: String,
                           action: @escaping () -> Void) -> some View {
        Button(action: action) { pickerLabel(icon, title, note) }
            .buttonStyle(.plain)
    }

    private func pickerLabel(_ icon: String, _ title: String, _ note: String) -> some View {
        HStack(spacing: Space.lg) {
            Image(systemName: icon)
                .font(.scaled(19))
                .frame(width: 24)
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: Space.hair) {
                Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                Text(note).font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, Space.lg)
        .padding(.vertical, Space.md)
        .contentShape(Rectangle())
    }

    private func summaryCard(_ r: ScanResult) -> some View {
        VStack(alignment: .leading, spacing: Space.md) {
            HStack(alignment: .top, spacing: Space.sm) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.success)
                VStack(alignment: .leading, spacing: Space.xs) {
                    Text(r.headline.isEmpty ? "Document read" : r.headline)
                        .font(.subheadline.weight(.semibold))
                    Text("Read by AI — check the details below against the paper.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            // The caveats are a warning, so they stay visible; the narrative is
            // reference, so it folds away.
            if !r.caveats.isEmpty {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        ForEach(r.caveats, id: \.self) { c in
                            Text("• \(c)").font(.caption)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, Space.xs)
                } label: {
                    Label("\(r.caveats.count) thing\(r.caveats.count == 1 ? "" : "s") worth checking",
                          systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Palette.caution)
                }
            }

            if !r.summary.isEmpty {
                DisclosureGroup("What the document says") {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        ForEach(r.summary.components(separatedBy: "\n\n").filter { !$0.isEmpty }, id: \.self) {
                            Text($0).font(.callout)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, Space.xs)
                }
                .font(.caption.weight(.medium))
            }
        }
        .padding(Space.md)
        .background(RoundedRectangle(cornerRadius: Radius.control).fill(Palette.success.opacity(0.10)))
    }

    // MARK: - Reading

    private func startSecurityScoped(_ url: URL) {
        // A file from the document picker lives outside the sandbox and must be
        // copied in before it can be read or uploaded.
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let temp = FileManager.default.temporaryDirectory.appendingPathComponent(url.lastPathComponent)
        try? FileManager.default.removeItem(at: temp)
        do {
            try FileManager.default.copyItem(at: url, to: temp)
            app.startRead(endpoint, fileURL: temp, name: url.lastPathComponent, owner: id)
        } catch {
            app.readState = .failed("Couldn’t open that file — \(error.localizedDescription)")
            manualOpen = true
        }
    }

    private func startPhoto(_ item: PhotosPickerItem) {
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else {
                app.readState = .failed("Couldn’t read that photo.")
                manualOpen = true
                return
            }
            let temp = FileManager.default.temporaryDirectory
                .appendingPathComponent("scan-\(UUID().uuidString).jpg")
            try? data.write(to: temp)
            app.startRead(endpoint, fileURL: temp, name: temp.lastPathComponent, owner: id)
        }
    }

}

/// VisionKit's document scanner — edge detection, deskew, multi-page, and a
/// far better capture than a raw photo of a deed on a table.
struct DocumentCamera: UIViewControllerRepresentable {
    let onScan: (URL) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }
    func updateUIViewController(_: VNDocumentCameraViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: DocumentCamera
        init(_ parent: DocumentCamera) { self.parent = parent }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFinishWith scan: VNDocumentCameraScan) {
            // Every scanned page into ONE pdf: a deed is not one page, and
            // sending only the first is how a document reads as unreadable.
            let pdf = PDFBuilder.make(from: (0..<scan.pageCount).map { scan.imageOfPage(at: $0) })
            controller.dismiss(animated: true)
            if let pdf { parent.onScan(pdf) }
        }
        func documentCameraViewControllerDidCancel(_ c: VNDocumentCameraViewController) {
            c.dismiss(animated: true)
        }
        func documentCameraViewController(_ c: VNDocumentCameraViewController, didFailWithError e: Error) {
            c.dismiss(animated: true)
        }
    }
}

enum PDFBuilder {
    static func make(from images: [UIImage]) -> URL? {
        guard !images.isEmpty else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("scan-\(UUID().uuidString).pdf")
        let bounds = CGRect(origin: .zero, size: images[0].size)
        let renderer = UIGraphicsPDFRenderer(bounds: bounds)
        do {
            try renderer.writePDF(to: url) { ctx in
                for image in images {
                    ctx.beginPage(withBounds: CGRect(origin: .zero, size: image.size), pageInfo: [:])
                    image.draw(at: .zero)
                }
            }
            return url
        } catch {
            return nil
        }
    }
}


/// "Scan a different document", at the bottom of the form it would replace.
///
/// Discarding a read is a destructive step backwards: it throws away six
/// prefilled fields. It belongs after the primary action, not above the work.
struct RescanRow: View {
    let onRescan: () -> Void

    var body: some View {
        Button(role: .destructive, action: onRescan) {
            Label("Scan a different document", systemImage: "arrow.counterclockwise")
                .font(.footnote)
                .frame(maxWidth: .infinity)
        }
    }
}
