import MapKit
import PattadarKit
import SwiftUI

/// Places — where things sit on this parcel.
///
/// Replaces the single map card, which answered one question ("roughly where is
/// it") and no others. What a person actually needs to say about land is: where
/// the corner stones are, which side the borewell is on, where the access track
/// meets the road. A pin in the middle of a field records none of it.
///
/// The segmented control offers the three ways of saying it, in descending
/// order of what the app can currently prove:
///
///   • **Map** — the pin, which exists and is real.
///   • **Photos** — what is on the land, which exists for parcels.
///   • **Sketch** — an FMB-style plan with pinned corners. The backend has no
///     table for corner pins or features, so this states plainly that nothing is
///     recorded rather than drawing an empty diagram that looks like a survey.
struct PlacesScreen: View {
    @Environment(AppModel.self) private var app

    let title: String
    /// "Mangala Kunta, Tarlapadu, Prakasam, India" — for aiming the picker.
    let place: String
    let address: String
    let photos: [ParcelPhoto]
    /// Which record these features hang off.
    var entityType: String = "parcel"
    var entityId: String = ""
    let villageCentroid: LatLng?
    @Binding var pin: LatLng?
    let onSave: (LatLng) -> Void

    enum Mode: String, CaseIterable, Identifiable {
        case map = "Map"
        case sketch = "Sketch"
        case features = "Features"
        var id: String { rawValue }
    }
    @State private var mode: Mode = .map

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Where things sit on this parcel.")
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
                case .features: featuresView
                }
            }
            .padding(.vertical, 12)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Places")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Map

    @ViewBuilder private var mapView: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let pin {
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: .init(latitude: pin.latitude, longitude: pin.longitude),
                    span: .init(latitudeDelta: 0.01, longitudeDelta: 0.01)))) {
                    Marker("", systemImage: "mappin",
                           coordinate: .init(latitude: pin.latitude, longitude: pin.longitude))
                }
                .frame(height: 260)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                if !address.isEmpty {
                    Label(address, systemImage: "mappin.and.ellipse")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                emptyCard(icon: "mappin.slash",
                          title: "The exact spot isn’t pinned yet",
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

    private var sketchView: some View {
        VStack(alignment: .leading, spacing: 12) {
            emptyCard(
                icon: "scribble.variable",
                title: "No sketch on file",
                body: "An FMB-style plan with the corner stones, the borewell and the access track pinned on it. Nothing here is recorded yet — this needs a place to keep corners and features, which the records do not have.")
            Label("Attach the FMB sheet as a document in the meantime — it is the survey office's own drawing.",
                  systemImage: "info.circle")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
    }

    // MARK: - Features

    private var featuresView: some View {
        FeaturesView(entityType: entityType, entityId: entityId)
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
