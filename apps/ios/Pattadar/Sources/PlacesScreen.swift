import MapKit
import PattadarKit
import SwiftUI

/// Maps — the land drawn, two ways.
///
/// Replaces the single map card, which answered one question ("roughly where
/// is it") and no others. **Map** is the land on imagery: the pin, and the
/// surveyed outline drawn over the fields it actually covers. **Sketch** is
/// the same corners as the surveyor draws them — white paper, side lengths,
/// north up — the drawing a person compares against the FMB sheet in their
/// hand.
///
/// Features moved OUT of here to the holding screen itself: what is on the
/// land is a fact about the holding, not about the map, and it was buried a
/// segment deep where nobody stumbles on it.
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

    private var corners: [LatLng] { parseBoundary(boundary) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("The land on the map, and as the surveyor draws it.")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .padding(.horizontal, 16)

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
            .padding(.vertical, 12)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Maps")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editingCorners) {
            BoundaryEditorSheet(entityType: entityType, entityId: entityId,
                                initial: boundary) { saved in
                boundary = saved
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
        VStack(alignment: .leading, spacing: 10) {
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
                .frame(height: 300)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                if !address.isEmpty {
                    Label(address, systemImage: "mappin.and.ellipse")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                emptyCard(icon: "mappin.slash",
                          title: "Nothing on the map yet",
                          body: canAimAt(place)
                            ? "Opens the map at \(place.components(separatedBy: ",").first ?? place)."
                            : "No village recorded, so the map has nowhere to start.")
            }

            NavigationLink {
                SetLocationScreen(title: title, place: place, saved: pin, onSave: onSave)
            } label: {
                Label(pin == nil ? "Set the exact location" : "Move the pin",
                      systemImage: "mappin.and.ellipse")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(.horizontal, 16)
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
                BoundarySketch(corners: corners)
                    .frame(height: 280)
                HStack {
                    Text("\(corners.count) corners")
                    Spacer()
                    Text(String(format: "%.2f acres drawn", boundaryAcres(corners)))
                        .monospacedDigit().foregroundStyle(.secondary)
                }
                .font(.subheadline)
                .padding(.horizontal, 4)
            }

            Button { editingCorners = true } label: {
                Label(corners.isEmpty ? "Add boundary corners" : "Edit corners",
                      systemImage: corners.isEmpty ? "plus.circle.fill" : "square.and.pencil")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(.horizontal, 16)
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
