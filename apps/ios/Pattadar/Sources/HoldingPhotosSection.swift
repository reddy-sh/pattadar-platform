import CoreLocation
import ImageIO
import PattadarKit
import PhotosUI
import SwiftUI

/// One photograph, whichever holding it evidences. ParcelPhoto and
/// PropertyPhoto are the same evidence contract with different parents;
/// the gallery should not care which.
struct GalleryPhoto: Identifiable, Equatable {
    let id: String
    let fileRef: String
    let category: String
    let caption: String
    let latitude: Double?
    let longitude: Double?
    let heading: Double?
    let capturedAt: String
    let isCover: Bool

    init(_ p: ParcelPhoto) {
        id = p.id; fileRef = p.fileRef; category = p.category; caption = p.caption
        latitude = p.latitude; longitude = p.longitude; heading = p.heading
        capturedAt = p.capturedAt; isCover = p.isCover
    }

    init(_ p: PropertyPhoto) {
        id = p.id; fileRef = p.fileRef; category = p.category; caption = p.caption
        latitude = p.latitude; longitude = p.longitude; heading = p.heading
        capturedAt = p.capturedAt; isCover = p.isCover
    }
}

/// Images for the gallery: this phone's own copy first, the gateway second.
///
/// A photo taken here never travels the network to be seen (LocalFiles keeps
/// it under the photo's server id); anything else is fetched through the
/// gateway's `?thumb=` downscaler once and kept in Caches — re-downloadable
/// by definition, so the system may evict it and nothing is lost.
@MainActor
final class PhotoImageStore {
    static let shared = PhotoImageStore()
    private let memory = NSCache<NSString, UIImage>()

    private var thumbsDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("thumbs", isDirectory: true)
    }

    func image(photoID: String, fileRef: String, px: Int, app: AppModel) async -> UIImage? {
        let key = "\(fileRef.isEmpty ? photoID : fileRef)-\(px)" as NSString
        if let hit = memory.object(forKey: key) { return hit }

        // This device took it: decode the kept original, downscaled in place.
        if let local = LocalFiles.url(for: photoID),
           let image = downscaled(contentsOf: local, px: px) {
            memory.setObject(image, forKey: key)
            return image
        }

        guard !fileRef.isEmpty else { return nil }
        let cached = thumbsDir.appendingPathComponent("\(fileRef)-\(px).jpg")
        if let image = UIImage(contentsOfFile: cached.path) {
            memory.setObject(image, forKey: key)
            return image
        }

        guard let data = await fetch(fileRef: fileRef, px: px, app: app),
              let image = UIImage(data: data) else { return nil }
        try? FileManager.default.createDirectory(at: thumbsDir, withIntermediateDirectories: true)
        try? data.write(to: cached, options: .atomic)
        memory.setObject(image, forKey: key)
        return image
    }

    /// `px = 0` means the full image (`?format=web`); anything else the
    /// gateway's `?thumb=` downscale. Both need the storage routes, which
    /// means a gateway and a Bearer token — absent either, only local copies
    /// render, which is exactly the bare-dev-API situation.
    private func fetch(fileRef: String, px: Int, app: AppModel) async -> Data? {
        await app.freshenAuth()
        let auth = app.api.config.authorization
        guard !auth.isEmpty,
              let root = AppModel.gatewayRoot(of: app.api.config.baseURL) else { return nil }
        var components = URLComponents(
            url: root.appendingPathComponent("api/gateway/storage/files/\(fileRef)/content"),
            resolvingAgainstBaseURL: false)!
        components.queryItems = [px > 0 ? URLQueryItem(name: "thumb", value: String(px))
                                        : URLQueryItem(name: "format", value: "web")]
        var r = URLRequest(url: components.url!)
        r.setValue("Bearer \(auth)", forHTTPHeaderField: "Authorization")
        guard let (data, response) = try? await URLSession.shared.data(for: r),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return data
    }

    private nonisolated func downscaled(contentsOf url: URL, px: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceThumbnailMaxPixelSize: px > 0 ? px : 2560,
                  kCGImageSourceCreateThumbnailWithTransform: true,
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// The gallery: photographs of the land, and the two ways to add one.
///
/// Grid first, evidence on tap — the old text-only section listed captions
/// and coordinates for images nobody could see. Queued photos render from
/// their outbox bytes with a waiting badge; the moment a drain lands them the
/// dossier refetch swaps in the server row.
struct HoldingPhotoGallery: View {
    @Environment(AppModel.self) private var app
    let photos: [GalleryPhoto]
    /// `.parcel(id)` or `.property(id)` — what an added photo evidences.
    let target: FilingLink
    let villageCentroid: LatLng?
    let placeName: String
    let onChanged: () -> Void

    @State private var showCamera = false
    @State private var pickedItems: [PhotosPickerItem] = []
    @State private var selected: GalleryPhoto?
    @State private var addFailed = ""

    private let columns = [GridItem(.adaptive(minimum: 96), spacing: Space.sm)]

    /// This holding's queued photos, straight off the sync engine's mirror.
    private var pending: [WriteQueue.Entry] {
        SyncEngine.shared.pendingFilings.filter { $0.photo?.target == target }
    }

    var body: some View {
        Section("Photographs") {
            if photos.isEmpty && pending.isEmpty {
                Text("No photographs yet. A picture with its location is the cheapest evidence this land is what the record says.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                LazyVGrid(columns: columns, spacing: Space.sm) {
                    ForEach(pending) { entry in
                        PendingPhotoTile(entry: entry)
                    }
                    ForEach(photos) { photo in
                        Button { selected = photo } label: {
                            ServerPhotoTile(photo: photo)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, Space.hair)
                // The viewer cover rides on the grid, NOT the Section — two
                // .fullScreenCover on one view node is a SwiftUI trap where one
                // silently wins, and the Section already owns the camera cover.
                .fullScreenCover(item: $selected) { start in
                    PhotoPager(photos: photos, startID: start.id, target: target,
                               villageCentroid: villageCentroid, placeName: placeName,
                               onChanged: { selected = nil; onChanged() })
                }
            }

            if !addFailed.isEmpty {
                Text(addFailed).font(.caption).foregroundStyle(Palette.danger)
            }

            // The two sources, side by side — same verbs as the scan card.
            HStack(spacing: Space.md) {
                Button { showCamera = true } label: {
                    Label("Take a photo", systemImage: "camera")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                PhotosPicker(selection: $pickedItems, maxSelectionCount: 12, matching: .images) {
                    Label("From library", systemImage: "photo.on.rectangle.angled")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in Task { await addFromCamera(image) } }
                .ignoresSafeArea()
        }
        .onChange(of: pickedItems) { _, items in
            guard !items.isEmpty else { return }
            pickedItems = []
            Task { await addFromLibrary(items) }
        }
        .fullScreenCover(item: $selected) { start in
            PhotoPager(photos: photos, startID: start.id, target: target,
                       villageCentroid: villageCentroid, placeName: placeName,
                       onChanged: { selected = nil; onChanged() })
        }
        // A drain landed something — the waiting tile's real row exists now.
        .onChange(of: SyncEngine.shared.drainedTick) { _, _ in onChanged() }
    }

    // MARK: - Adding

    /// Straight off the sensor: stamp now, and the device's location if the
    /// app already may ask for it — a fresh permission prompt for a photo
    /// would be the tail wagging the dog.
    private func addFromCamera(_ image: UIImage) async {
        showCamera = false
        var latitude: Double?, longitude: Double?
        let manager = CLLocationManager()
        if manager.authorizationStatus == .authorizedWhenInUse
            || manager.authorizationStatus == .authorizedAlways,
           let here = manager.location {
            latitude = here.coordinate.latitude
            longitude = here.coordinate.longitude
        }
        guard let jpeg = preparedJPEG(image) else {
            addFailed = "That photo couldn’t be saved."
            return
        }
        enqueue(jpeg, latitude: latitude, longitude: longitude,
                capturedAt: ISO8601DateFormatter().string(from: Date()))
    }

    /// From the library: whatever the EXIF still remembers. Extracted BEFORE
    /// re-encoding, because the recompress strips it.
    private func addFromLibrary(_ items: [PhotosPickerItem]) async {
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let meta = exifCapture(from: data)
            guard let image = UIImage(data: data), let jpeg = preparedJPEG(image) else { continue }
            enqueue(jpeg, latitude: meta.latitude, longitude: meta.longitude,
                    capturedAt: meta.capturedAt)
        }
    }

    private func enqueue(_ fileURL: URL, latitude: Double?, longitude: Double?,
                         capturedAt: String) {
        let details = WriteQueue.PhotoDetails(
            target: target, category: "general", caption: "",
            latitude: latitude, longitude: longitude, heading: nil,
            capturedAt: capturedAt)
        let user = app.api.config.userID
        Task {
            do {
                _ = try await WriteQueue.shared.enqueuePhoto(
                    user: user, fileURL: fileURL, details: details,
                    displayName: "Land photo")
                addFailed = ""
                SyncEngine.shared.kick(.enqueued)
            } catch {
                // Only the phone's own disk gets us here — worth saying plainly.
                addFailed = "The photo couldn’t be stored on this phone: \(error.localizedDescription)"
            }
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    /// Capped for upload: 2560px is boundary-stone-legible at a tenth of the
    /// bytes a 48-megapixel original would push through a village connection.
    private func preparedJPEG(_ image: UIImage) -> URL? {
        let side = max(image.size.width, image.size.height) * image.scale
        let scale = min(1, 2560 / max(side, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let data = resized.jpegData(compressionQuality: 0.85) else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("photo-\(UUID().uuidString).jpg")
        try? data.write(to: url)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// GPS and capture date out of the EXIF, missing-as-missing.
    private func exifCapture(from data: Data)
        -> (latitude: Double?, longitude: Double?, capturedAt: String) {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
                as? [CFString: Any] else { return (nil, nil, "") }

        var latitude: Double?, longitude: Double?
        if let gps = props[kCGImagePropertyGPSDictionary] as? [CFString: Any],
           let lat = gps[kCGImagePropertyGPSLatitude] as? Double,
           let lon = gps[kCGImagePropertyGPSLongitude] as? Double {
            let latRef = gps[kCGImagePropertyGPSLatitudeRef] as? String ?? "N"
            let lonRef = gps[kCGImagePropertyGPSLongitudeRef] as? String ?? "E"
            latitude = latRef == "S" ? -lat : lat
            longitude = lonRef == "W" ? -lon : lon
        }

        var capturedAt = ""
        if let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any],
           let raw = exif[kCGImagePropertyExifDateTimeOriginal] as? String {
            // EXIF's "2026:08:14 06:12:33" into the ISO shape the rest wears.
            let parts = raw.split(separator: " ", maxSplits: 1)
            if parts.count == 2 {
                capturedAt = parts[0].replacingOccurrences(of: ":", with: "-") + "T" + parts[1]
            }
        }
        return (latitude, longitude, capturedAt)
    }
}

/// A compact, horizontal preview of a holding's photographs, for the overview
/// — so opening a property leads with its pictures instead of hiding them a
/// tab away. Tapping any opens the same full-screen, swipeable pager the grid
/// uses; empty, it invites the first photo and points at the tab that adds it.
struct HoldingPhotoStrip: View {
    let photos: [GalleryPhoto]
    /// `.parcel(id)` or `.property(id)` — whose photos these are.
    let target: FilingLink
    let villageCentroid: LatLng?
    let placeName: String
    let onChanged: () -> Void
    /// Jump to the land/property tab, where the camera and library buttons live.
    let onAdd: () -> Void
    var addPrompt: String = "Add photos"

    @State private var viewing: GalleryPhoto?

    /// This holding's queued photos, straight off the sync engine's mirror —
    /// a picture just taken shows on the overview before it has uploaded.
    private var pending: [WriteQueue.Entry] {
        SyncEngine.shared.pendingFilings.filter { $0.photo?.target == target }
    }

    var body: some View {
        Section("Photographs") {
            if photos.isEmpty && pending.isEmpty {
                Button(action: onAdd) {
                    Label(addPrompt, systemImage: "camera")
                        .font(.subheadline.weight(.medium))
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Space.sm) {
                        ForEach(pending) { entry in
                            PendingPhotoTile(entry: entry, side: 128)
                        }
                        ForEach(photos) { photo in
                            Button { viewing = photo } label: {
                                ServerPhotoTile(photo: photo, side: 128)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, Space.xs)
                }
                .listRowInsets(EdgeInsets())
            }
        }
        .fullScreenCover(item: $viewing) { start in
            PhotoPager(photos: photos, startID: start.id, target: target,
                       villageCentroid: villageCentroid, placeName: placeName,
                       onChanged: { viewing = nil; onChanged() })
        }
        // A drain landed something while the overview is open — reflect it.
        .onChange(of: SyncEngine.shared.drainedTick) { _, _ in onChanged() }
    }
}

/// A thumbnail's frame: a fixed square for the horizontal strip, the grid's
/// flexible minimum (fills its adaptive column) otherwise.
private struct TileFrame: ViewModifier {
    let side: CGFloat?
    func body(content: Content) -> some View {
        if let side {
            content.frame(width: side, height: side)
        } else {
            content.frame(minWidth: 96, minHeight: 96)
        }
    }
}

/// A queued photograph — its own bytes, badged as waiting.
private struct PendingPhotoTile: View {
    let entry: WriteQueue.Entry
    var side: CGFloat? = nil
    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable().aspectRatio(contentMode: .fill)
                        .opacity(0.7)
                } else {
                    RoundedRectangle(cornerRadius: Radius.control).fill(.quaternary)
                }
            }
            .modifier(TileFrame(side: side))
            .clipShape(RoundedRectangle(cornerRadius: Radius.control))

            Label(entry.needsReview ? "Needs review" : "Waiting",
                  systemImage: entry.needsReview ? "exclamationmark.triangle.fill" : "arrow.up.circle")
                .font(.caption2.weight(.medium))
                .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                .background(.thinMaterial, in: Capsule())
                .padding(Space.xs)
        }
        .task {
            let url = await WriteQueue.shared.documentURL(for: entry)
            image = UIImage(contentsOfFile: url.path)
        }
    }
}

/// A landed photograph: thumbnail via the store, cover badged.
private struct ServerPhotoTile: View {
    @Environment(AppModel.self) private var app
    let photo: GalleryPhoto
    var side: CGFloat? = nil
    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable().aspectRatio(contentMode: .fill)
                } else {
                    RoundedRectangle(cornerRadius: Radius.control).fill(.quaternary)
                        .overlay(Image(systemName: "photo").foregroundStyle(.secondary))
                }
            }
            .modifier(TileFrame(side: side))
            .clipShape(RoundedRectangle(cornerRadius: Radius.control))

            if photo.isCover {
                Text("cover").font(.caption2.weight(.semibold))
                    .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                    .background(.thinMaterial, in: Capsule())
                    .padding(Space.xs)
            }
        }
        .task(id: photo.fileRef) {
            image = await PhotoImageStore.shared.image(
                photoID: photo.id, fileRef: photo.fileRef, px: 512, app: app)
        }
    }
}

/// Full-screen, swipeable: every photograph of this holding, one page each,
/// with dots for where you are. The old sheet showed only the one you tapped —
/// to see the next you had to back out and tap again.
private struct PhotoPager: View {
    @Environment(\.dismiss) private var dismiss
    let photos: [GalleryPhoto]
    let startID: String
    let target: FilingLink
    let villageCentroid: LatLng?
    let placeName: String
    let onChanged: () -> Void

    @State private var selection: String

    init(photos: [GalleryPhoto], startID: String, target: FilingLink,
         villageCentroid: LatLng?, placeName: String, onChanged: @escaping () -> Void) {
        self.photos = photos
        self.startID = startID
        self.target = target
        self.villageCentroid = villageCentroid
        self.placeName = placeName
        self.onChanged = onChanged
        _selection = State(initialValue: startID)
    }

    /// "3 of 12" — quiet, and only when there is more than one to be among.
    private var position: String {
        guard photos.count > 1,
              let i = photos.firstIndex(where: { $0.id == selection }) else { return "" }
        return "\(i + 1) of \(photos.count)"
    }

    var body: some View {
        NavigationStack {
            TabView(selection: $selection) {
                ForEach(photos) { photo in
                    PhotoPage(photo: photo, isActive: photo.id == selection,
                              target: target, villageCentroid: villageCentroid,
                              placeName: placeName,
                              onChanged: { dismiss(); onChanged() })
                        .tag(photo.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photos.count > 1 ? .automatic : .never))
            .navigationTitle(position)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
    }
}

/// One page of the pager: the photograph large, then what makes it count —
/// where it was taken and whether that is anywhere near the land — and the two
/// things you can do to it. Loads a fast thumbnail for every page and the full
/// image only for the one in view, so a dozen photos do not all pull full-res
/// at once over a village connection.
private struct PhotoPage: View {
    @Environment(AppModel.self) private var app
    let photo: GalleryPhoto
    let isActive: Bool
    let target: FilingLink
    let villageCentroid: LatLng?
    let placeName: String
    let onChanged: () -> Void

    @State private var image: UIImage?
    @State private var working = false
    @State private var confirmDelete = false

    var body: some View {
        List {
            Section {
                if let image {
                    Image(uiImage: image)
                        .resizable().aspectRatio(contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.control))
                } else {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .frame(height: 220)
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            Section("Evidence") {
                if !photo.caption.isEmpty { Text(photo.caption).font(.callout) }
                if !photo.capturedAt.isEmpty {
                    Fact(label: "Taken", value: relativeTime(photo.capturedAt))
                }
                locationRow
            }

            Section {
                Button {
                    Task { await setCover() }
                } label: {
                    Label(photo.isCover ? "This is the cover" : "Use as the cover photo",
                          systemImage: photo.isCover ? "star.fill" : "star")
                }
                .disabled(photo.isCover || working)
                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete this photo", systemImage: "trash")
                }
                .disabled(working)
            }
        }
        // A fast 512 thumbnail for every page (usually already cached from the
        // grid), then the full image only once this page is the one in view.
        .task(id: isActive) {
            if image == nil {
                image = await PhotoImageStore.shared.image(
                    photoID: photo.id, fileRef: photo.fileRef, px: 512, app: app)
            }
            if isActive,
               let full = await PhotoImageStore.shared.image(
                    photoID: photo.id, fileRef: photo.fileRef, px: 0, app: app) {
                image = full
            }
        }
        .confirmationDialog("Delete this photograph?", isPresented: $confirmDelete,
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await deletePhoto() } }
        }
    }

    /// The same plausibility check the old text section ran — a photograph
    /// taken 40 km from the village proves something, just not the land.
    @ViewBuilder private var locationRow: some View {
        if let lat = photo.latitude, let lon = photo.longitude {
            let sanity = checkLocation(pin: LatLng(latitude: lat, longitude: lon),
                                       centroid: villageCentroid, placeName: placeName)
            HStack(spacing: Space.sm) {
                Image(systemName: sanity.suspect ? "exclamationmark.triangle.fill" : "mappin.circle")
                    .foregroundStyle(sanity.suspect ? Palette.caution : .secondary)
                Text(sanity.suspect
                     ? "Taken \(formatDistance(sanity.distanceKm)) from \(placeName.isEmpty ? "this village" : placeName)"
                     : String(format: "%.5f, %.5f", lat, lon))
                    .font(.caption).monospacedDigit()
                    .foregroundStyle(sanity.suspect ? Palette.caution : .secondary)
                if let h = photo.heading {
                    Text("facing \(Int(h))°").font(.caption).foregroundStyle(.secondary)
                }
            }
        } else {
            Label("No location recorded", systemImage: "mappin.slash")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func setCover() async {
        working = true
        defer { working = false }
        struct AckParcel: Decodable { let setCoverPhoto: Bool? }
        struct AckProperty: Decodable { let setPropertyCoverPhoto: Bool? }
        switch target {
        case .parcel:
            _ = await app.load(Mutations.setCoverPhoto, variables: ["id": photo.id], as: AckParcel.self)
        default:
            _ = await app.load(Mutations.setPropertyCoverPhoto, variables: ["id": photo.id], as: AckProperty.self)
        }
        onChanged()
    }

    private func deletePhoto() async {
        working = true
        defer { working = false }
        struct GoneParcel: Decodable { let deleteParcelPhoto: Bool? }
        struct GoneProperty: Decodable { let deletePropertyPhoto: Bool? }
        switch target {
        case .parcel:
            _ = await app.load(Mutations.deleteParcelPhoto, variables: ["id": photo.id], as: GoneParcel.self)
        default:
            _ = await app.load(Mutations.deletePropertyPhoto, variables: ["id": photo.id], as: GoneProperty.self)
        }
        onChanged()
    }
}

/// The plain camera. The document scanner deskews paper; land wants the
/// frame exactly as the eye saw it.
private struct CameraPicker: UIViewControllerRepresentable {
    let onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            picker.dismiss(animated: true)
            if let image = info[.originalImage] as? UIImage {
                parent.onCapture(image)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            picker.dismiss(animated: true)
            parent.dismiss()
        }
    }
}
