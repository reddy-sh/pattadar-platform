import MapKit
import PattadarKit
import SwiftUI

/// Everything you own, on one map.
///
/// A list answers "what do I have"; a map answers "where is it, and what is
/// near what" — which is the question that decides whether two survey numbers
/// are actually adjoining fields or forty kilometres apart. It is also the
/// fastest way to see which holdings have never been pinned, because they are
/// simply absent.
struct PropertiesMap: View {
    let holdings: [Holding]
    @State private var camera: MapCameraPosition = .automatic
    @State private var selected: Holding?

    private var pinned: [(holding: Holding, coord: CLLocationCoordinate2D)] {
        holdings.compactMap { h in
            guard let p = h.pin else { return nil }
            return (h, CLLocationCoordinate2D(latitude: p.latitude, longitude: p.longitude))
        }
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Map(position: $camera, selection: Binding(
                get: { selected?.id },
                set: { id in selected = holdings.first { $0.id == id } }
            )) {
                ForEach(pinned, id: \.holding.id) { item in
                    Marker(item.holding.title, systemImage: item.holding.kind.icon,
                           coordinate: item.coord)
                        .tint(tint(item.holding.kind))
                        .tag(item.holding.id)
                }
            }
            .mapStyle(.hybrid(elevation: .realistic))   // fields read better from imagery
            .ignoresSafeArea(edges: .bottom)

            if let selected {
                selectedCard(selected)
            } else if pinned.isEmpty {
                unpinnedNotice
            } else if unpinnedCount > 0 {
                Text("\(unpinnedCount) holding\(unpinnedCount == 1 ? "" : "s") not on the map — no location pinned yet")
                    .font(.caption).foregroundStyle(.secondary)
                    .padding(10)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.bottom, 10)
            }
        }
        .onAppear(perform: frameEverything)
    }

    private var unpinnedCount: Int { holdings.count - pinned.count }

    private func selectedCard(_ h: Holding) -> some View {
        NavigationLink {
            switch h {
            case .parcel(let p, let pb): HoldingDetailScreen(parcel: p, passbook: pb)
            case .property(let p): PropertyDetailScreen(property: p)
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: h.kind.icon).foregroundStyle(tint(h.kind))
                VStack(alignment: .leading, spacing: 2) {
                    Text(h.title).font(.subheadline.weight(.semibold))
                    if !h.village.isEmpty {
                        Text(h.village).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text(h.extentText).font(.subheadline).monospacedDigit()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .padding(12)
        }
        .buttonStyle(.plain)
    }

    private var unpinnedNotice: some View {
        ContentUnavailableView(
            "Nothing pinned yet",
            systemImage: "mappin.slash",
            description: Text("Open a holding and set its location — then it appears here.")
        )
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .padding(24)
    }

    /// Open framing everything that IS pinned, rather than a default region
    /// that shows land nobody owns.
    private func frameEverything() {
        let coords = pinned.map(\.coord)
        guard !coords.isEmpty else { return }
        let lats = coords.map(\.latitude), lons = coords.map(\.longitude)
        let centre = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2,
                                            longitude: (lons.min()! + lons.max()!) / 2)
        // A floor on the span so a single pin does not open at street level.
        let span = MKCoordinateSpan(
            latitudeDelta: max(0.02, (lats.max()! - lats.min()!) * 1.5),
            longitudeDelta: max(0.02, (lons.max()! - lons.min()!) * 1.5))
        camera = .region(MKCoordinateRegion(center: centre, span: span))
    }

    private func tint(_ k: HoldingKind) -> Color {
        switch k {
        case .farmland: .green
        case .plot: .blue
        case .home: .orange
        case .commercial: .purple
        }
    }
}
