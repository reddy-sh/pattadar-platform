import CoreLocation
import MapKit
import PattadarKit
import SwiftUI

/// Pick a location — full screen, fixed centre pin, map moves underneath.
///
/// The pin never moves: it is fixed to the centre and the MAP travels under it,
/// which is what every map app settled on because the thing you are aiming is
/// then never under your thumb.
///
/// Three rules here are not cosmetic:
///
/// A coordinate nobody aimed at cannot be saved — the RN version reported the
/// map's centre as soon as it laid out, so tapping Save without touching
/// anything wrote a hardcoded default, and one parcel ended up 176 km from its
/// village by exactly that route.
///
/// A coordinate the app has judged implausible goes through a confirmation,
/// not straight to the server: a warning the Save button ignores is decoration.
///
/// And the map NEVER opens on the world. `.automatic` with nothing to frame
/// showed North America, reverse-geocoded its centre, and offered to save a
/// county road in Kansas as a Guntur field. The camera starts over Andhra
/// Pradesh and narrows from there, so every state of this screen is somewhere
/// the land could plausibly be.
struct SetLocationScreen: View {
    @Environment(\.dismiss) private var dismiss

    let title: String
    /// "Mangala Kunta, Tarlapadu, Prakasam, India" — seeds both the aim and the
    /// search. Built by `placeQuery`, smallest place first.
    let place: String
    let saved: LatLng?
    let onSave: (LatLng) -> Void

    /// Andhra Pradesh, generously bounded. Both the first thing shown and the
    /// last resort — never a world view.
    private static let apCentre = CLLocationCoordinate2D(latitude: 15.9, longitude: 79.7)
    private static let apSpan = MKCoordinateSpan(latitudeDelta: 6, longitudeDelta: 6)

    @State private var camera: MapCameraPosition = .region(
        MKCoordinateRegion(center: apCentre, span: apSpan))
    @State private var centre: LatLng?
    @State private var villageCentroid: LatLng?
    @State private var aimed = false
    @State private var address = ""
    @State private var query = ""
    @State private var confirmFar = false
    @State private var aiming = true
    /// What the aim actually found, so the screen can say "couldn't find
    /// Mangala Kunta" instead of pretending the map is where it should be.
    @State private var aimNote = ""
    @State private var locator = Locator()
    /// Where the app last pointed the camera itself.
    ///
    /// "Has the person aimed this?" cannot be answered by the camera callback
    /// alone — it fires for layout and for our own moves as well as for a drag.
    /// It USED to be inferred from "do we have a village centroid", which meant
    /// that when the geocoder could not find the village, dragging the map
    /// never counted as aiming and Save could never be enabled. The map worked
    /// and the button was dead.
    @State private var programmatic: LatLng?
    @State private var results: [PlaceHit] = []
    @State private var searching = false

    /// A place the person can choose by name, rather than a coordinate the
    /// geocoder chose for them.
    struct PlaceHit {
        let name: String
        let detail: String
        let coordinate: CLLocationCoordinate2D
        /// A village or town, not a street or a building inside one.
        var isSettlement = false
        /// Actually named the place that was searched for, allowing for the
        /// spelling drift between a passbook and a map.
        var namesTheVillage = false
    }

    /// A camera settling within ~55 m of where we sent it is our move, not a
    /// person's. Anything else is a deliberate placement.
    private func isOurs(_ c: LatLng) -> Bool {
        guard let p = programmatic else { return false }
        return abs(c.latitude - p.latitude) < 5e-4 && abs(c.longitude - p.longitude) < 5e-4
    }

    /// Point the camera and remember that WE did it.
    private func move(to c: CLLocationCoordinate2D, span: Double, aimedByUser: Bool) {
        programmatic = LatLng(latitude: c.latitude, longitude: c.longitude)
        camera = .region(.init(center: c, span: .init(latitudeDelta: span, longitudeDelta: span)))
        centre = LatLng(latitude: c.latitude, longitude: c.longitude)
        if aimedByUser { aimed = true }
    }

    private var sanity: LocationSanity {
        checkLocation(pin: centre, centroid: villageCentroid, placeName: placeLabel)
    }
    private var placeLabel: String {
        place.components(separatedBy: ",").first?.trimmingCharacters(in: .whitespaces) ?? ""
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Map(position: $camera)
                .mapStyle(.hybrid(elevation: .flat))
                .onMapCameraChange(frequency: .onEnd) { ctx in
                    let c = LatLng(latitude: ctx.region.center.latitude,
                                   longitude: ctx.region.center.longitude)
                    centre = c
                    // Moving the map IS aiming — whether or not the village was
                    // ever found. Only our own camera moves are exempt.
                    if !isOurs(c) { aimed = true }
                    describe()
                }
                .ignoresSafeArea()

            // The pin belongs to the SCREEN, not the map, and its TIP is the
            // coordinate — hence the offset. Without it the saved point is the
            // middle of the balloon, ~20pt north of where it looks.
            Image(systemName: "mappin")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(.red)
                .shadow(radius: 3, y: 1)
                .offset(y: -18)
                .allowsHitTesting(false)
                .frame(maxHeight: .infinity)

            controls
            sheet
            searchBar
        }
        .navigationTitle(saved == nil ? "Set location" : "Edit location")
        .navigationBarTitleDisplayMode(.inline)
        // The tab bar sat on top of the Save button. A full-screen picker is a
        // task, not a place to switch tabs.
        .toolbar(.hidden, for: .tabBar)
        .task { await aim() }
        .confirmationDialog("Save this location anyway?", isPresented: $confirmFar, titleVisibility: .visible) {
            Button("Save anyway", role: .destructive) { commit(force: true) }
            if villageCentroid != nil {
                Button("Centre on \(placeLabel.isEmpty ? "the village" : placeLabel)") { recentre() }
            }
            Button("Go back", role: .cancel) { }
        } message: {
            Text(sanity.message)
        }
    }

    /// A search field ON the map, with results you tap.
    ///
    /// It used to be the navigation bar's `.searchable`, which meant typing a
    /// village and pressing return jumped the map to whatever the geocoder
    /// ranked first — with no way to see the alternatives or to tell which
    /// Nallapadu you got. Choosing from a named list is the difference between
    /// picking a place and being assigned one.
    private var searchBar: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search a village or place", text: $query)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .onSubmit { Task { await search() } }
                if !query.isEmpty {
                    Button {
                        query = ""; results = []
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .accessibilityLabel("Clear search")
                }
                if searching { ProgressView().controlSize(.small) }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(.regularMaterial, in: Capsule())

            if !results.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(results.enumerated()), id: \.offset) { i, r in
                        if i > 0 { Divider().padding(.leading, 42) }
                        Button {
                            choose(r)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: r.isSettlement
                                      ? "building.2.crop.circle.fill" : "mappin.circle.fill")
                                    .foregroundStyle(r.namesTheVillage ? .green : .red)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.name).font(.subheadline.weight(.medium))
                                        .foregroundStyle(.primary)
                                    if !r.detail.isEmpty {
                                        Text(r.detail).font(.caption2).foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 14).padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .padding(.top, 8)
            }
        }
        .padding(.horizontal, 12)
        .frame(maxHeight: .infinity, alignment: .top)
    }

    /// Floating map controls, above the card and out of the thumb's way.
    private var controls: some View {
        VStack(spacing: 10) {
            if villageCentroid != nil {
                mapButton("scope", label: "Centre on \(placeLabel)") { recentre() }
            }
            mapButton("location.fill", label: "Use my location") { Task { await useMyLocation() } }
        }
        .padding(.trailing, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        .padding(.bottom, 220)
    }

    private func mapButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .semibold))
                .frame(width: 44, height: 44)
                .background(.regularMaterial, in: Circle())
        }
        .accessibilityLabel(label)
    }

    private var sheet: some View {
        VStack(alignment: .leading, spacing: 10) {
            if aiming {
                HStack(spacing: 8) {
                    ProgressView()
                    Text(placeLabel.isEmpty ? "Finding the place…" : "Finding \(placeLabel)…")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            } else {
                // Words first: a lat/lng pair tells nobody whether the pin
                // landed in the right village.
                Text(address.isEmpty ? "Move the map to place the pin" : address)
                    .font(.headline).lineLimit(2)
                if let c = centre {
                    Text("\(c.latitude, specifier: "%.6f"), \(c.longitude, specifier: "%.6f")")
                        .font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
            }

            if !aimNote.isEmpty {
                Label(aimNote, systemImage: "questionmark.circle")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if sanity.suspect {
                Label(sanity.message, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption).foregroundStyle(.orange)
            }
            if !aimed && !aiming {
                Text("Move the map, search, or use your location to place the pin.")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Button {
                commit(force: false)
            } label: {
                Label(saved == nil ? "Save this location" : "Update location",
                      systemImage: "checkmark")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(centre == nil || !aimed || aiming)
            if !aimed && !aiming {
                // A greyed-out button with no reason beside it is the thing
                // people report as "unable to save".
                Text("Place the pin first — drag the map so the pin sits on the land.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
    }

    private func commit(force: Bool) {
        guard let c = centre, aimed else { return }
        if !force && sanity.suspect { confirmFar = true; return }
        onSave(c)
        dismiss()
    }

    // MARK: - Aiming

    /// Put the map on the land before the person touches anything.
    ///
    /// The aim degrades one step at a time rather than giving up: a village the
    /// geocoder has never heard of still gets its mandal, and failing that its
    /// district. Each step is a smaller claim about where the land is, and the
    /// card says which one was used — an aim that silently landed on the
    /// district reads exactly like one that found the village.
    private func aim() async {
        defer { aiming = false }
        // The opening Andhra Pradesh view is our own, so the layout callback
        // does not count as somebody aiming at the middle of the state.
        programmatic = LatLng(latitude: Self.apCentre.latitude, longitude: Self.apCentre.longitude)

        if let saved {
            move(to: .init(latitude: saved.latitude, longitude: saved.longitude),
                 span: 0.006, aimedByUser: true)
        }

        // "Village, mandal, district, India" → also try "mandal, district,
        // India" → "district, India".
        var parts = place.components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !parts.isEmpty else {
            if saved == nil {
                aimNote = "No village recorded for this holding — search for the place."
            }
            return
        }

        let wanted = parts[0]
        var attempt = 0
        while !parts.isEmpty {
            let query = parts.joined(separator: ", ")
            if let hit = await geocode(query, expecting: attempt == 0 ? wanted : nil) {
                let loc = hit.location
                let found = LatLng(latitude: loc.coordinate.latitude,
                                   longitude: loc.coordinate.longitude)
                // A full-string result that did NOT name the village is not a
                // village aim, however specific the query was. Treated as a
                // coarse hit so the pin still has to be placed by hand.
                let precise = attempt == 0 && hit.isTheVillage
                // Only the FULL match is the village centroid. A district-level
                // hit must not become the yardstick the plausibility check
                // measures pins against, or every pin looks fine.
                if precise { villageCentroid = found }
                else if saved == nil {
                    // Only worth saying when the map actually moved there. With
                    // a pin already set, "move the map to the land" is advice
                    // for a problem the person does not have.
                    aimNote = attempt == 0
                        ? "Found something near \(placeLabel) but not the village itself. Move the map to the land."
                        : "Couldn’t find \(placeLabel) exactly — showing \(parts[0]). Move the map to the land."
                }
                if saved == nil {
                    // A coarse aim is NOT an aim: the person must still place
                    // the pin, or we would save a district centre as a field.
                    // A village gets a village's zoom; a guess gets a wide one,
                    // because framing a district centre at 2 km reads as "your
                    // land is here" when nothing of the sort was established.
                    move(to: loc.coordinate, span: precise ? 0.02 : 0.3,
                         aimedByUser: precise)
                }
                return
            }
            parts.removeFirst()
            attempt += 1
        }
        if saved == nil {
            aimNote = "Couldn’t find \(placeLabel) on the map — search for it, or move the map to the land."
        }
    }

    /// Geocode, biased to Andhra Pradesh and preferring an exact village.
    ///
    /// A bare village name is ambiguous across India — there are Nallapadus in
    /// several states — and the geocoder answers with whichever it ranks
    /// highest, which is how a Guntur plot lands hundreds of kilometres away.
    /// The region hint tells it where to look; the locality check discards a
    /// match that resolved to a district or a state rather than a place.
    private func geocode(_ text: String) async -> CLLocation? {
        await geocode(text, expecting: nil)?.location
    }

    /// Geocode, and say whether the answer is actually the place asked for.
    ///
    /// `expecting` is the village name the aim is trying to reach. Without it
    /// this function returned "the first result that looked like a settlement",
    /// which is a different claim entirely: a search for Katragunta that landed
    /// on a settlement called something else was reported as a success, and the
    /// map opened there with the confident 0.02° zoom of a village it had found.
    private func geocode(_ text: String, expecting village: String?)
        async -> (location: CLLocation, isTheVillage: Bool)? {
        let region = CLCircularRegion(center: Self.apCentre, radius: 400_000, identifier: "ap")
        guard let marks = try? await CLGeocoder().geocodeAddressString(text, in: region),
              !marks.isEmpty else { return nil }

        // Prefer a result that names the village, then any settlement, then
        // whatever came back.
        func namesIt(_ m: CLPlacemark) -> Bool {
            guard let village, !village.isEmpty else { return false }
            return matchesRequestedVillage(village,
                                           candidates: [m.name, m.subLocality, m.locality])
        }
        let exact = marks.first(where: namesIt)
        let settlement = marks.first { $0.locality != nil || $0.subLocality != nil }
        guard let best = exact ?? settlement ?? marks.first,
              let loc = best.location else { return nil }
        return (loc, exact != nil)
    }

    private func recentre() {
        guard let v = villageCentroid else { return }
        move(to: .init(latitude: v.latitude, longitude: v.longitude),
             span: 0.03, aimedByUser: true)
    }

    /// Standing in the field is the most accurate way to pin it, and the card
    /// has always claimed this was possible. Until now it was not.
    private func useMyLocation() async {
        guard let here = await locator.current() else {
            aimNote = "Location isn’t available — allow it in Settings, or move the map by hand."
            return
        }
        move(to: here, span: 0.004, aimedByUser: true)
    }

    private func search() async {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else { return }
        searching = true
        defer { searching = false }

        // Searched within Andhra Pradesh: a bare village name matches
        // settlements across India, and the top-ranked one is regularly the
        // wrong state.
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = term
        request.region = MKCoordinateRegion(center: Self.apCentre, span: Self.apSpan)
        // ADDRESSES ONLY. The default includes points of interest, so searching
        // "Katragunta" returned a shop, a school and a phone tower named after
        // the village instead of the village — and picking one put the pin on a
        // building rather than on the settlement.
        request.resultTypes = [.address]
        let hits = (try? await MKLocalSearch(request: request).start())?.mapItems ?? []

        let mapped: [PlaceHit] = hits.compactMap { item in
            let mark = item.placemark
            guard let c = mark.location?.coordinate else { return nil }
            let detail = [mark.locality, mark.subAdministrativeArea, mark.administrativeArea]
                .compactMap { $0 }
                .reduce(into: [String]()) { acc, s in if !acc.contains(s) { acc.append(s) } }
                .joined(separator: ", ")
            // A settlement — village, town — rather than a street or a plot
            // inside one. That is the level a land record is described at.
            let isSettlement = mark.locality != nil || mark.subLocality != nil
            return PlaceHit(name: item.name ?? mark.name ?? term,
                            detail: detail,
                            coordinate: c,
                            isSettlement: isSettlement,
                            namesTheVillage: matchesRequestedVillage(
                                term, candidates: [mark.name, mark.subLocality, mark.locality]))
        }
        // The place you asked for first, then other settlements, then the rest.
        results = Array(mapped.sorted { a, b in
            if a.namesTheVillage != b.namesTheVillage { return a.namesTheVillage }
            if a.isSettlement != b.isSettlement { return a.isSettlement }
            return false
        }.prefix(6))

        if results.isEmpty {
            // Fall back to the geocoder, which knows revenue villages that the
            // points-of-interest search does not.
            if let loc = await geocode(term) {
                aimNote = ""
                move(to: loc.coordinate, span: 0.01, aimedByUser: true)
            } else {
                aimNote = "Couldn’t find “\(term)”."
            }
        }
    }

    private func choose(_ hit: PlaceHit) {
        aimNote = ""
        results = []
        query = ""
        move(to: hit.coordinate, span: 0.01, aimedByUser: true)
    }

    private func describe() {
        guard let c = centre else { return }
        Task {
            let marks = try? await CLGeocoder().reverseGeocodeLocation(
                CLLocation(latitude: c.latitude, longitude: c.longitude))
            guard let m = marks?.first else { return }
            address = [m.name, m.subLocality, m.locality, m.subAdministrativeArea, m.administrativeArea]
                .compactMap { $0 }.reduce(into: [String]()) { acc, s in if !acc.contains(s) { acc.append(s) } }
                .prefix(3).joined(separator: ", ")
        }
    }
}

/// One-shot "where am I", with the permission prompt handled.
///
/// Returns nil rather than hanging when permission is refused: a button that
/// spins forever is worse than one that says it cannot help.
@MainActor
final class Locator: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var waiting: CheckedContinuation<CLLocationCoordinate2D?, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func current() async -> CLLocationCoordinate2D? {
        if let fix = manager.location?.coordinate { return fix }
        switch manager.authorizationStatus {
        case .denied, .restricted: return nil
        case .notDetermined: manager.requestWhenInUseAuthorization()
        default: break
        }
        return await withCheckedContinuation { continuation in
            // A second request while one is in flight must not strand the first.
            waiting?.resume(returning: nil)
            waiting = continuation
            manager.requestLocation()
        }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        let fix = locs.last?.coordinate
        Task { @MainActor in finish(fix) }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in finish(nil) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        let status = m.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse, .authorizedAlways: m.requestLocation()
            case .denied, .restricted: finish(nil)
            default: break
            }
        }
    }

    private func finish(_ c: CLLocationCoordinate2D?) {
        waiting?.resume(returning: c)
        waiting = nil
    }
}
