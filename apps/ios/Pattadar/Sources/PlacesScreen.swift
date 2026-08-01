import MapKit
import PattadarKit
import SwiftUI

/// Maps — the land drawn, two ways, edge to edge.
///
/// **Map** is the land on imagery: the pin, and the surveyed outline drawn
/// over the fields it actually covers — filling the screen, because a map in
/// a 300-point card answers "roughly where" and nothing else. **Sketch** is
/// the same corners as the surveyor draws them — side lengths, north up —
/// with the filed FMB sheet a tap away for comparison.
///
/// Features moved OUT of here to the holding screen itself: what is on the
/// land is a fact about the holding, not about the map.
struct PlacesScreen: View {
    @Environment(AppModel.self) private var app

    let title: String
    /// "Mangala Kunta, Tarlapadu, Prakasam, India" — for aiming the picker.
    let place: String
    let address: String
    let photos: [ParcelPhoto]
    /// Which record the pin and corners hang off.
    var entityType: String = "parcel"
    var entityId: String = ""
    /// The holding's filed documents — the Sketch tab shows the FMB sheet
    /// among them beside the drawing it was drawn from.
    var documents: [RegisteredDocument] = []
    /// Recorded extent in acres; the sketch holds the drawn figure against it.
    var recordedAcres: Double = 0
    let villageCentroid: LatLng?
    /// Corner-ordered "lat,lng;…". Local state so an edit made here redraws
    /// here — the caller's model is a snapshot.
    @State var boundary: String = ""
    @Binding var pin: LatLng?
    let onSave: (LatLng) -> Void

    enum Mode: String, CaseIterable, Identifiable {
        case map = "Map"
        case sketch = "Sketch"
        var id: String { rawValue }
    }
    @State private var mode: Mode = .map
    @State private var editingCorners = false
    @State private var openFMB: RegisteredDocument?

    private var corners: [LatLng] { parseBoundary(boundary) }

    /// The FMB sheets among this holding's documents. Matched on what the
    /// document says it is — "FMB", "field measurement" — not on file names,
    /// which are UUIDs by the time they get here.
    private var fmbSheets: [RegisteredDocument] {
        documents.filter { d in
            let what = (d.docType + " " + d.headline).lowercased()
            return what.contains("fmb") || what.contains("field measurement")
        }
    }

    var body: some View {
        // No scroll view: both tabs OWN the screen, and the controls float
        // over the drawing instead of queueing beneath it.
        VStack(spacing: 10) {
            Picker("View", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)

            switch mode {
            case .map: mapView
            case .sketch: sketchView
            }
        }
        .padding(.top, 8)
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Maps")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editingCorners) {
            BoundaryEditorSheet(entityType: entityType, entityId: entityId,
                                initial: boundary) { saved in
                boundary = saved
            }
        }
        .sheet(item: $openFMB) { doc in
            if let url = LocalFiles.url(for: doc.id) {
                FileViewer(
                    url: url,
                    title: doc.docType.isEmpty ? "FMB sheet" : doc.docType,
                    shareName: shareFileName(
                        docType: doc.docType.isEmpty ? "FMB" : doc.docType,
                        village: doc.village,
                        date: [doc.registrationDate, doc.regYear, doc.createdAt]
                            .first { !$0.isEmpty } ?? "",
                        fallbackExtension: url.pathExtension))
            }
        }
    }

    // MARK: - Map

    /// Framed on the outline when there is one — the pin alone otherwise.
    private var mapRegion: MKCoordinateRegion {
        if !corners.isEmpty {
            let lats = corners.map(\.latitude), lngs = corners.map(\.longitude)
            return MKCoordinateRegion(
                center: .init(latitude: (lats.max()! + lats.min()!) / 2,
                              longitude: (lngs.max()! + lngs.min()!) / 2),
                span: .init(latitudeDelta: max((lats.max()! - lats.min()!) * 1.6, 0.004),
                            longitudeDelta: max((lngs.max()! - lngs.min()!) * 1.6, 0.004)))
        }
        let centre = pin ?? LatLng(latitude: 16.5, longitude: 80.5)
        return MKCoordinateRegion(
            center: .init(latitude: centre.latitude, longitude: centre.longitude),
            span: .init(latitudeDelta: 0.01, longitudeDelta: 0.01))
    }

    @ViewBuilder private var mapView: some View {
        if pin != nil || !corners.isEmpty {
            Map(initialPosition: .region(mapRegion)) {
                if let pin {
                    Marker("", systemImage: "mappin",
                           coordinate: .init(latitude: pin.latitude, longitude: pin.longitude))
                }
                // The sketch, on the map: the same corners the Sketch tab
                // draws on paper, here drawn over the actual fields.
                if !corners.isEmpty {
                    MapPolygon(coordinates: corners.map {
                        CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
                    })
                    .foregroundStyle(.green.opacity(0.18))
                    .stroke(.green, lineWidth: 2)
                }
            }
            .mapStyle(.hybrid)
            // Edge to edge, under the floating tab bar. The controls sit ON
            // the map; a full-screen drawing does not queue its buttons below
            // the fold.
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .bottomLeading) {
                if !address.isEmpty {
                    Label(address, systemImage: "mappin.and.ellipse")
                        .font(.caption.weight(.medium))
                        .lineLimit(1)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(.thinMaterial, in: Capsule())
                        .padding(.leading, 16)
                        .padding(.bottom, 108)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                NavigationLink {
                    SetLocationScreen(title: title, place: place, saved: pin, onSave: onSave)
                } label: {
                    Label(pin == nil ? "Set location" : "Move pin",
                          systemImage: "mappin.and.ellipse")
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(.thinMaterial, in: Capsule())
                }
                .padding(.trailing, 16)
                .padding(.bottom, 64)
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                emptyCard(icon: "mappin.slash",
                          title: "Nothing on the map yet",
                          body: canAimAt(place)
                            ? "Opens the map at \(place.components(separatedBy: ",").first ?? place)."
                            : "No village recorded, so the map has nowhere to start.")
                NavigationLink {
                    SetLocationScreen(title: title, place: place, saved: pin, onSave: onSave)
                } label: {
                    Label("Set the exact location", systemImage: "mappin.and.ellipse")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(.secondarySystemGroupedBackground),
                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                Spacer()
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Sketch

    @ViewBuilder private var sketchView: some View {
        VStack(alignment: .leading, spacing: 12) {
            if corners.isEmpty {
                emptyCard(
                    icon: "scribble.variable",
                    title: "No corners on file",
                    body: "The FMB sheet ends in a point table — each corner as latitude and longitude. Enter those corners and this draws the surveyor's sketch: the outline, every side's length, and the extent it encloses.")
            } else {
                // The drawing takes every point the screen can give it.
                BoundarySketch(corners: corners)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                HStack {
                    Text("\(corners.count) corners")
                    Spacer()
                    Text(String(format: "%.2f acres drawn", boundaryAcres(corners)))
                        .monospacedDigit().foregroundStyle(.secondary)
                }
                .font(.subheadline)
                .padding(.horizontal, 4)

                let warning = boundaryExtentMismatch(drawnAcres: boundaryAcres(corners),
                                                     recordedAcres: recordedAcres)
                if !warning.isEmpty {
                    // The one sentence that makes the sketch worth checking:
                    // the outline and the record disagree about how much land
                    // this is.
                    Text(warning).font(.caption).foregroundStyle(.orange)
                }
            }

            Button { editingCorners = true } label: {
                Label(corners.isEmpty ? "Add boundary corners" : "Edit corners",
                      systemImage: corners.isEmpty ? "plus.circle.fill" : "square.and.pencil")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            // The survey office's own drawing, beside the redrawn one — the
            // whole point of the sketch is holding it against the sheet, and
            // the sheet was three screens away in the vault.
            if fmbSheets.isEmpty {
                Label("Have the FMB sheet? File it with ⊕ and it appears here beside the drawing.",
                      systemImage: "doc.badge.plus")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(fmbSheets) { doc in
                    if LocalFiles.url(for: doc.id) != nil {
                        Button { openFMB = doc } label: {
                            fmbRow(doc, note: "The survey office's drawing · tap to open")
                        }
                        .buttonStyle(.plain)
                    } else {
                        fmbRow(doc, note: "Details only — no file stored for this document")
                    }
                }
            }

            if corners.isEmpty { Spacer() }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private func fmbRow(_ doc: RegisteredDocument, note: String) -> some View {
        HStack(spacing: 12) {
            DocumentIcon(docType: doc.docType.isEmpty ? "fmb" : doc.docType, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(doc.docType.isEmpty ? "FMB sheet" : doc.docType)
                    .font(.subheadline.weight(.medium))
                Text([doc.village, doc.surveyNo.isEmpty ? "" : "Sy \(doc.surveyNo)", note]
                    .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if LocalFiles.url(for: doc.id) != nil {
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func emptyCard(icon: String, title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(.secondary)
            Text(title).font(.subheadline.weight(.semibold))
            Text(body).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
