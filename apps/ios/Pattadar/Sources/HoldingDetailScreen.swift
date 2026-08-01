import CoreLocation
import MapKit
import PattadarKit
import SwiftUI

/// A row that hides itself when there is nothing to say.
///
/// Land records are sparse: most parcels have a survey number and an extent and
/// nothing else. Rendering thirty labelled rows of "—" buries the four that are
/// filled and makes an empty record look like a broken one.
struct Fact: View {
    let label: String
    let value: String
    var mono = false

    var body: some View {
        if !value.trimmingCharacters(in: .whitespaces).isEmpty {
            LabeledContent(label) {
                Text(value)
                    .monospacedDigit(mono)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

private extension Text {
    @ViewBuilder func monospacedDigit(_ on: Bool) -> some View {
        if on { self.monospacedDigit() } else { self }
    }
}

/// True when a section would be entirely empty.
func allBlank(_ values: String...) -> Bool {
    values.allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty }
}

struct HoldingDetailScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let parcel: Parcel
    let passbook: Passbook?

    @State private var pin: LatLng?
    @State private var editing = false
    @State private var confirmDelete = false
    @State private var dossier: ParcelDossier?
    @State private var documents: [RegisteredDocument] = []
    @State private var villageCentroid: LatLng?
    @State private var attaching = false
    @State private var features: [LandFeature] = []
    @State private var expenses: [LandExpense] = []

    /// Village · mandal · district, each name once.
    private var parcelWhere: String {
        var seen = Set<String>()
        return [passbook?.village, passbook?.mandal, passbook?.district]
            .compactMap { $0 }
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
            .joined(separator: " · ")
    }

    /// "agri" is a database value, not English. The classification is spelled
    /// out wherever a person reads it.
    private var classificationLabel: String {
        let c = parcel.classification.lowercased()
        if c.hasPrefix("agri") { return "Agricultural" }
        if c.contains("non") { return "Non-agricultural" }
        return humanize(parcel.classification)
    }

    /// "30 Acres · Sy 1" — the extent first, as on a property, with the survey
    /// number as the identity. It was "Sy 1" alone, which named the record
    /// without saying anything about it.
    private var screenTitle: String {
        let sy = "Sy " + parcel.surveyNo
            + (parcel.subdivision.isEmpty ? "" : "/\(parcel.subdivision)")
        return parcel.extent > 0 ? "\(areaText(parcel.extent, .acre)) · \(sy)" : sy
    }

    private func ParcelChip(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Capsule().fill(tint.opacity(0.18)))
            .foregroundStyle(tint)
    }

    var body: some View {
        List {
            HoldingHero(kicker: [classificationLabel,
                                 passbook.map { "Khata \($0.pattadarNo)" } ?? ""]
                            .filter { !$0.isEmpty }.joined(separator: " · "),
                        title: screenTitle,
                        subtitle: parcelWhere,
                        heldBy: parcel.currentOwner.isEmpty
                            ? (passbook?.ownerName ?? "") : parcel.currentOwner)

            HoldingStats(documents: documents.count,
                         places: features.count + (dossier?.parcelPhotos.count ?? 0),
                         readiness: readiness.score,
                         spent: spentHere)

            NeedsYouSection(readiness: readiness)
            if !allBlank(parcel.regDocNo, parcel.sro, parcel.regDate) {
                Section("Registration") {
                    Fact(label: "Document no.", value: parcel.regDocNo)
                    Fact(label: "Sub-registrar", value: parcel.sro)
                    Fact(label: "Registered on", value: humanDate(parcel.regDate))
                }
            }

            // WHERE it is, then WHAT PROVES it — same order as a property.
            LocationSection(title: "Sy \(parcel.surveyNo)",
                            // The MANDAL belongs here: village + district alone
                            // does not separate two villages of the same name.
                            place: placeQuery([passbook?.village, passbook?.mandal,
                                               passbook?.district,
                                               parcel.address.isEmpty ? nil : parcel.address]),
                            photos: dossier?.parcelPhotos ?? [],
                            villageCentroid: villageCentroid,
                            entityType: "parcel", entityId: parcel.id,
                            address: parcel.address.isEmpty ? parcelWhere : parcel.address,
                            boundary: parcel.boundary, documents: documents,
                            recordedAcres: parcel.extent,
                            pin: $pin) { save($0) }

            LinkedDocumentsSection(documents: documents)

            if !allBlank(parcel.currentOwner, parcel.acquisitionSource, parcel.address,
                         passbook?.pattadarNo ?? "", parcel.status) {
                Section("Holding") {
                    Fact(label: "Status", value: humanize(parcel.status))
                    if !parcel.stake.isEmpty,
                       parcel.stake.caseInsensitiveCompare(parcel.status) != .orderedSame {
                        Fact(label: "My stake", value: humanize(parcel.stake))
                    }
                    Fact(label: "Classification", value: classificationLabel)
                    Fact(label: "Current owner", value: parcel.currentOwner)
                    Fact(label: "Passbook", value: passbook?.pattadarNo ?? "")
                    Fact(label: "Acquired via", value: humanize(parcel.acquisitionSource))
                    if !parcel.address.isEmpty,
                       parcel.address.caseInsensitiveCompare(parcelWhere) != .orderedSame {
                        Fact(label: "Address", value: parcel.address)
                    }
                }
            }

            if parcel.purchasePrice > 0 || parcel.marketValue > 0
                || parcel.guidelineValue > 0 || parcel.loanAmount > 0 {
                Section {
                    Fact(label: "Purchase price", value: money(parcel.purchasePrice), mono: true)
                    Fact(label: "Purchased on", value: humanDate(parcel.purchaseDate))
                    Fact(label: "Guideline value", value: money(parcel.guidelineValue), mono: true)
                    Fact(label: "Market value", value: money(parcel.marketValue), mono: true)
                    Fact(label: "Stamp duty", value: money(parcel.stampDuty), mono: true)
                    Fact(label: "Loan outstanding", value: money(parcel.loanAmount), mono: true)
                } header: {
                    Text("What was paid")
                } footer: {
                    Text("What a deed records is not what the land is worth today.")
                }
            }

            if !allBlank(parcel.ecStatus, parcel.ecDate, parcel.mutationStatus,
                         parcel.taxPaidUpto, parcel.encumbranceStatus) {
                Section("Compliance") {
                    Fact(label: "Encumbrance", value: humanize(parcel.encumbranceStatus))
                    Fact(label: "EC status", value: humanize(parcel.ecStatus))
                    Fact(label: "EC dated", value: humanDate(parcel.ecDate))
                    Fact(label: "Mutation", value: humanize(parcel.mutationStatus))
                    Fact(label: "Tax paid up to", value: parcel.taxPaidUpto)
                }
            }

            if !allBlank(parcel.boundaryNorth, parcel.boundarySouth,
                         parcel.boundaryEast, parcel.boundaryWest) {
                Section("Boundaries") {
                    Fact(label: "North", value: parcel.boundaryNorth)
                    Fact(label: "South", value: parcel.boundarySouth)
                    Fact(label: "East", value: parcel.boundaryEast)
                    Fact(label: "West", value: parcel.boundaryWest)
                }
            }

            if parcel.litigation {
                Section {
                    Label("This land is under litigation", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                    if !parcel.litigationNote.isEmpty {
                        Text(parcel.litigationNote).font(.callout)
                    }
                }
            }

            OnTheLandSection(entityType: "parcel", entityId: parcel.id,
                             features: features,
                             onChanged: { Task { await loadDossier() } })

            OwnerHistorySection(owners: dossier?.parcels.first { $0.id == parcel.id }?.owners ?? [])

            PhotoSection(photos: dossier?.parcelPhotos ?? [],
                         villageCentroid: villageCentroid,
                         placeName: passbook?.village ?? "")

            NotesSection(entityType: "parcel", entityId: parcel.id,
                         notes: dossier?.notes ?? []) { Task { await loadDossier() } }

            RecordHistorySection(events: dossier?.auditEvents ?? [])

            Section {
                Button { editing = true } label: { Label("Edit parcel", systemImage: "pencil.line") }
                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete parcel", systemImage: "trash.fill")
                }
            }
        }
        .navigationTitle(screenTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) { StarButton(type: "parcel", id: parcel.id) }
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: parcelShare.text) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
        .sheet(isPresented: $editing) { EditParcelScreen(parcel: parcel) { } }
        .sheet(isPresented: $attaching) {
            AttachDocumentSheet(
                identity: HoldingIdentity(surveyNo: parcel.surveyNo,
                                          subdivision: parcel.subdivision,
                                          village: passbook?.village ?? "",
                                          mandal: passbook?.mandal ?? "",
                                          acres: parcel.extent),
                target: .parcel(parcel.id),
                currentExtentAcres: parcel.extent) { Task { await loadDossier() } }
        }
        .confirmationDialog("Delete this parcel?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await remove() } }
            Button("Keep it", role: .cancel) { }
        } message: {
            Text("Sy \(parcel.surveyNo) and everything filed under it.")
        }
        .task {
            pin = parseGeoPoint(parcel.geoPoint)
            await loadDossier()
        }
    }

    private func loadDossier() async {
        dossier = await app.load(Queries.parcelDossier,
                                 variables: ["id": parcel.id, "target": parcel.id],
                                 as: ParcelDossier.self)
        if let docs = await app.load(Queries.documents, as: DocumentsResponse.self) {
            documents = docs.registeredDocuments.filter { $0.parcelId == parcel.id }
        }
        features = (await app.load(Queries.landFeatures,
                                   variables: ["entityType": "parcel", "entityId": parcel.id],
                                   as: LandFeaturesResponse.self))?.landFeatures ?? []
        expenses = (await app.load(Queries.landExpenses,
                                   as: LandExpensesResponse.self))?.landExpenses ?? []
        // Needed to judge whether a photograph was taken anywhere near the land.
        if villageCentroid == nil, let village = passbook?.village, !village.isEmpty {
            // The MANDAL belongs in this lookup too. This centroid is what
            // decides whether a pin or a photograph is judged plausible, so a
            // centroid resolved to the wrong same-named village makes the
            // warning itself wrong — in both directions.
            let query = placeQuery([village, passbook?.mandal, passbook?.district])
            // Bounded to Andhra Pradesh, like the picker's own lookup: an
            // unconstrained village name matches settlements worldwide.
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: 15.9, longitude: 79.7),
                radius: 400_000, identifier: "ap")
            if let marks = try? await CLGeocoder().geocodeAddressString(query, in: region),
               let loc = marks.first?.location {
                villageCentroid = LatLng(latitude: loc.coordinate.latitude,
                                         longitude: loc.coordinate.longitude)
            }
        }
    }

    private func money(_ v: Double) -> String { v > 0 ? rupees(v) : "" }

    private var readiness: Readiness {
        assessReadiness(ReadinessInput(
            hasTitleDocument: !documents.isEmpty,
            hasLocation: pin != nil,
            hasRegistrationNumber: !parcel.regDocNo.isEmpty,
            mutationStatus: parcel.mutationStatus, ecStatus: parcel.ecStatus,
            taxPaidUpto: parcel.taxPaidUpto, litigation: parcel.litigation),
            thisYear: Calendar.current.component(.year, from: Date()))
    }

    private var spentHere: Double {
        expenses.filter { $0.entityId == parcel.id }.reduce(0) { $0 + $1.amount }
    }

    /// Sent to a brother, a buyer or a surveyor. No money and no identity
    /// number — see `HoldingShare`.
    private var parcelShare: HoldingShare {
        HoldingShare(title: screenTitle,
                     extent: areaText(parcel.extent, .acre),
                     place: parcelWhere,
                     reference: [passbook.map { "Khata \($0.pattadarNo)" }, classificationLabel]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "),
                     owner: parcel.currentOwner,
                     pin: pin)
    }

    private func save(_ c: LatLng) {
        Task {
            struct Ack: Decodable { let updateParcelGeo: IDPayload? }
            _ = await app.load(Queries.updateParcelGeo,
                               variables: ["id": parcel.id,
                                           "geoPoint": String(format: "%.6f,%.6f", c.latitude, c.longitude)],
                               as: Ack.self)
            pin = c
        }
    }

    private func remove() async {
        struct Ack: Decodable { let deleteParcel: Bool }
        _ = await app.load(Mutations.deleteParcel, variables: ["id": parcel.id], as: Ack.self)
        dismiss()
    }
}

/// Shared between parcel and property so the map behaves identically on both.
///
/// The MAP is the control. It was a picture with an "Edit location" row beneath
/// it — two rows of chrome to say one thing, and a map that ignored the tap
/// everyone tries first. Tapping the map opens the picker, and the place rides
/// on the map instead of claiming a line of its own.
struct LocationSection: View {
    let title: String
    let place: String
    /// Photographs of the land, shown under Places → Features.
    var photos: [ParcelPhoto] = []
    var villageCentroid: LatLng? = nil
    var entityType: String = "parcel"
    var entityId: String = ""
    /// Words, on the map. Six decimal places of latitude tell nobody whether
    /// the pin is on their land; "Nallapadu · Guntur" does. The numbers stay
    /// available on the picker, where somebody comparing against a survey
    /// record is the one asking.
    var address: String = ""
    /// The surveyed outline, when corners are on file — drawn over the
    /// preview so the map shows the LAND, not just a point near it.
    var boundary: String = ""
    /// Filed documents, for the Maps screen's Sketch tab to find the FMB
    /// sheet among.
    var documents: [RegisteredDocument] = []
    /// Recorded extent in acres, for the sketch's drawn-vs-recorded check.
    var recordedAcres: Double = 0
    @Binding var pin: LatLng?
    let onSave: (LatLng) -> Void

    private var corners: [LatLng] { parseBoundary(boundary) }

    /// Framed on the outline when there is one, on the pin when not.
    private var previewRegion: MKCoordinateRegion {
        if !corners.isEmpty {
            let lats = corners.map(\.latitude), lngs = corners.map(\.longitude)
            let latSpan = (lats.max()! - lats.min()!) * 1.6
            let lngSpan = (lngs.max()! - lngs.min()!) * 1.6
            return MKCoordinateRegion(
                center: .init(latitude: (lats.max()! + lats.min()!) / 2,
                              longitude: (lngs.max()! + lngs.min()!) / 2),
                span: .init(latitudeDelta: max(latSpan, 0.003),
                            longitudeDelta: max(lngSpan, 0.003)))
        }
        let centre = pin ?? LatLng(latitude: 16.5, longitude: 80.5)
        return MKCoordinateRegion(
            center: .init(latitude: centre.latitude, longitude: centre.longitude),
            span: .init(latitudeDelta: 0.01, longitudeDelta: 0.01))
    }

    var body: some View {
        // "Maps", plural on purpose: the imagery and the surveyor's sketch
        // are two drawings of the same land, and this card opens both.
        Section("Maps") {
            NavigationLink {
                PlacesScreen(title: title, place: place, address: address,
                             photos: photos, entityType: entityType, entityId: entityId,
                             documents: documents, recordedAcres: recordedAcres,
                             villageCentroid: villageCentroid, boundary: boundary,
                             pin: $pin, onSave: onSave)
            } label: {
                if pin != nil || !corners.isEmpty {
                    Map(initialPosition: .region(previewRegion)) {
                        // A bare pin: the marker used to carry the title, which
                        // the screen's own title already says.
                        if let pin {
                            Marker("", systemImage: "mappin",
                                   coordinate: .init(latitude: pin.latitude, longitude: pin.longitude))
                        }
                        // The outline over the imagery — this is the drawing a
                        // buyer walks the field with.
                        if !corners.isEmpty {
                            MapPolygon(coordinates: corners.map {
                                CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
                            })
                            .foregroundStyle(.green.opacity(0.18))
                            .stroke(.green, lineWidth: 2)
                        }
                    }
                    // A preview must not steal the scroll gesture; the whole
                    // card is one tap target.
                    .allowsHitTesting(false)
                    .frame(height: 150)
                    .overlay(alignment: .bottomLeading) {
                        if !address.isEmpty {
                            Text(address)
                                .font(.caption2.weight(.medium))
                                .lineLimit(1)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(.thinMaterial, in: Capsule())
                                .padding(10)
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        Label("Maps", systemImage: "map")
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(.thinMaterial, in: Capsule())
                            .padding(10)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                } else {
                    // Nothing pinned: an empty map is a lie, so the row says so
                    // and offers the one action available.
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Maps").font(.subheadline.weight(.medium))
                            Text(canAimAt(place)
                                 ? "The pin, and the boundary drawn on the map"
                                 : "No village recorded yet — search for the place on the map")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: "mappin.slash").foregroundStyle(.secondary)
                    }
                }
            }
            // On the row, not inside the label: a modifier that configures a
            // List row has no effect applied to a link's contents.
            .listRowInsets(pin == nil && corners.isEmpty
                           ? nil : EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
        }
    }
}

struct PropertyDetailScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let property: Property

    @State private var pin: LatLng?
    @State private var editing = false
    @State private var confirmDelete = false
    @State private var dossier: PropertyDossier?
    @State private var documents: [RegisteredDocument] = []
    @State private var attaching = false
    @State private var features: [LandFeature] = []
    @State private var expenses: [LandExpense] = []

    /// "Nallapadu · Guntur · Guntur" is not informative; a name repeated
    /// between village, mandal and district is said once.
    private var whereLine: String {
        var seen = Set<String>()
        return [property.city, property.locality, property.district]
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
            .joined(separator: " · ")
    }

    /// The headline: what this holding IS, in the unit it was filed in.
    ///
    /// "418.5 Sq. yards" for a site, built-up area for a building — the figure
    /// somebody would say out loud if asked what they own there.
    private var headlineExtent: String {
        guard let h = headlineArea(propertyType: property.type,
                                   landArea: property.landArea, landUnit: property.landUnit,
                                   builtupArea: property.builtupArea,
                                   builtupUnit: property.builtupUnit),
              h.value > 0 else { return "" }
        return areaText(h.value, h.unit)
    }

    /// Singular. The category label ("Open plots & sites") named the whole
    /// dashboard row, so the title read "418.5 Sq. yards open plots & sites".
    private var kindLabel: String { HoldingKind.of(propertyType: property.type).noun }

    /// "418.5 Sq. yards plot" — the key fact, as the title.
    ///
    /// The title was the village, which the location line already gives, so the
    /// one thing the screen existed to say — how big it is — was the fourth row
    /// of a table.
    private var screenTitle: String {
        headlineExtent.isEmpty
            ? (property.label.isEmpty ? humanize(property.type) : property.label)
            : "\(headlineExtent) \(kindLabel)"
    }

    var body: some View {
        List {
            HoldingHero(kicker: [HoldingKind.of(propertyType: property.type).noun,
                                 property.khataNo.isEmpty ? "" : "Khata \(property.khataNo)"]
                            .filter { !$0.isEmpty }.joined(separator: " · "),
                        title: screenTitle,
                        subtitle: [property.label, whereLine]
                            .filter { !$0.isEmpty }.joined(separator: " · "),
                        heldBy: property.currentOwner)

            HoldingStats(documents: documents.count,
                         places: features.count,
                         readiness: readiness.score,
                         spent: spentHere)

            NeedsYouSection(readiness: readiness)

            // WHICH DEED this is, first.
            //
            // The registered number, the sub-registrar and the date are how a
            // holding is identified to anybody outside this app — an EC search,
            // a lawyer, the registrar's index. They were below the boundaries
            // and the money.
            if !allBlank(property.regDocNo, property.sro, property.regDate,
                         property.khataNo, property.ghmcAssessmentNo, property.reraNo) {
                Section("Registration") {
                    Fact(label: "Document no.", value: property.regDocNo)
                    Fact(label: "Sub-registrar", value: property.sro)
                    Fact(label: "Registered on", value: humanDate(property.regDate))
                    Fact(label: "Khata no.", value: property.khataNo)
                    Fact(label: "Assessment no.", value: property.ghmcAssessmentNo)
                    Fact(label: "RERA no.", value: property.reraNo)
                }
            }


            // Then WHERE it is, and WHAT PROVES it.
            LocationSection(title: screenTitle,
                            // Village first: a mandal name geocodes to an
                            // administrative centre, not to the land. The
                            // mandal still belongs in the string — it is what
                            // separates two villages that share a name.
                            place: placeQuery([property.city, property.locality,
                                               property.district]),
                            entityType: "property", entityId: property.id,
                            address: property.address.isEmpty ? whereLine : property.address,
                            boundary: property.boundary, documents: documents,
                            recordedAcres: toAcres(property.landArea, unitKey(property.landUnit)),
                            pin: $pin) { save($0) }

            LinkedDocumentsSection(documents: documents)

            Section {
                Button { attaching = true } label: {
                    Label("Attach a document", systemImage: "paperclip")
                }
            } footer: {
                Text("Checked against this holding before anything is changed.")
            }

            // WHO transferred it, and to whom.
            //
            // A name alone does not identify a person in a land record — half a
            // village shares a surname — so the parentage, age and address the
            // deed gives are what match this seller to the buyer on the previous
            // deed. All of it was read and then discarded.
            if !attributeGroups.parties.isEmpty {
                Section {
                    ForEach(attributeGroups.parties, id: \.0) { label, value in
                        Fact(label: label, value: value)
                    }
                } header: {
                    Label("Parties to the deed", systemImage: "person.2.fill")
                } footer: {
                    Text("As written on the paper. A GPA holder signs FOR the owner — where one is named, the owner is the principal, not the agent.")
                }
            }

            if property.litigation && !property.litigationNote.isEmpty {
                Section {
                    Text(property.litigationNote).font(.callout)
                } header: {
                    Label("Litigation", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }

            // Only what the title and the map did NOT already say.
            if !allBlank(property.currentOwner, property.acquisitionMode, property.address,
                         property.holdingStatus) {
                Section("Holding") {
                    Fact(label: "Status", value: humanize(property.holdingStatus))
                    // Only when it differs — "Owned / Owned" is one fact twice.
                    if !property.stake.isEmpty,
                       property.stake.caseInsensitiveCompare(property.holdingStatus) != .orderedSame {
                        Fact(label: "My stake", value: humanize(property.stake))
                    }
                    Fact(label: "Current owner", value: property.currentOwner)
                    Fact(label: "Acquired via", value: humanize(property.acquisitionMode))
                    // The street address only when it says more than the
                    // village line already did.
                    if !property.address.isEmpty,
                       property.address.caseInsensitiveCompare(whereLine) != .orderedSame {
                        Fact(label: "Address", value: property.address)
                    }
                    // Land as well as built-up, when a building has both.
                    if property.builtupArea > 0 && property.landArea > 0 {
                        Fact(label: "Land", value: area(property.landArea, property.landUnit), mono: true)
                    }
                }
            }

            // The four boundaries are ONE fact, and a section of their own.
            //
            // Alphabetical sorting interleaved them with route maps and plot
            // numbers — "Attached landmarks, Attached route map, Boundary east,
            // Boundary north…". What abuts the land on each side is read as a
            // set, clockwise from north, because that is how a schedule is
            // written and how a surveyor walks it.
            if !attributeGroups.boundaries.isEmpty {
                Section {
                    ForEach(attributeGroups.boundaries, id: \.0) { side, value in
                        Fact(label: side, value: value)
                    }
                } header: {
                    Label("Boundaries", systemImage: "square.dashed")
                } footer: {
                    Text("What the deed says the land abuts — the chuttupakkala haddulu. Measurements in brackets.")
                }
            }

            // Type-specific extras the deed reader pulled out: layout, plot
            // numbers, rate, stamp papers, the prior deed, what is bound in.
            if !attributeGroups.rest.isEmpty {
                Section("Details from the deed") {
                    ForEach(attributeGroups.rest, id: \.0) { key, value in
                        Fact(label: humanize(key), value: value)
                    }
                }
            }

            OnTheLandSection(entityType: "property", entityId: property.id,
                             features: features,
                             onChanged: { Task { await loadDossier() } })


            // MONEY LAST of the record sections.
            //
            // A purchase price is not a description of the land — it is what was
            // paid once, often decades ago and often understated on the deed.
            // Sitting third from the top it read as the property's worth. It
            // belongs after the land, the papers and the place.
            if property.purchasePrice > 0 || property.currentValue > 0
                || property.marketValue > 0 || property.guidelineValue > 0 {
                Section {
                    Fact(label: "Purchase price", value: money(property.purchasePrice), mono: true)
                    Fact(label: "Purchased on", value: humanDate(property.purchaseDate))
                    Fact(label: "Guideline value", value: money(property.guidelineValue), mono: true)
                    Fact(label: "Market value", value: money(property.marketValue), mono: true)
                    Fact(label: "Current value", value: money(property.currentValue), mono: true)
                } header: {
                    Text("What was paid")
                } footer: {
                    Text("What a deed records is not what the land is worth today.")
                }
            }

            if !allBlank(property.ecStatus, property.ecDate,
                         property.mutationStatus, property.taxPaidUpto) {
                Section("Compliance") {
                    Fact(label: "EC status", value: humanize(property.ecStatus))
                    Fact(label: "EC dated", value: humanDate(property.ecDate))
                    Fact(label: "Mutation", value: humanize(property.mutationStatus))
                    Fact(label: "Tax paid up to", value: property.taxPaidUpto)
                }
            }

            if !property.notes.isEmpty {
                Section("Notes") { Text(property.notes).font(.callout) }
            }

            NotesSection(entityType: "property", entityId: property.id,
                         notes: dossier?.notes ?? []) { Task { await loadDossier() } }

            RecordHistorySection(events: dossier?.auditEvents ?? [])

            Section {
                Button { editing = true } label: { Label("Edit property", systemImage: "pencil.line") }
                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete property", systemImage: "trash.fill")
                }
            }
        }
        .navigationTitle(screenTitle)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) { StarButton(type: "property", id: property.id) }
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: propertyShare.text) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
        .sheet(isPresented: $editing) { EditPropertyScreen(property: property) { } }
        .sheet(isPresented: $attaching) {
            AttachDocumentSheet(
                // `khataNo` is the MUNICIPAL assessment number, not a plot
                // number. Passing it here made the matcher compare a khata
                // against the deed's plot numbers, find no overlap, and report
                // "this deed describes different land" — blocking a correct
                // attachment with a conflict the app invented.
                identity: HoldingIdentity(plotNo: plotFromAttributes,
                                          village: property.city,
                                          mandal: property.locality,
                                          acres: propertyAcres(landArea: property.landArea,
                                                               landUnit: property.landUnit)),
                target: .property(property.id),
                currentExtentAcres: propertyAcres(landArea: property.landArea,
                                                  landUnit: property.landUnit)) {
                Task { await loadDossier() }
            }
        }
        .confirmationDialog("Delete this property?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await remove() } }
            Button("Keep it", role: .cancel) { }
        } message: {
            Text("This property and the deeds attached to it will be removed. This cannot be undone.")
        }
        .onAppear {
            if pin == nil { pin = parseGeoPoint(property.geoPoint) }
            if cachedGroups == nil { cachedGroups = parseAttributes() }
        }
        .task { await loadDossier() }
    }

    private func loadDossier() async {
        dossier = await app.load(Queries.propertyDossier,
                                 variables: ["target": property.id], as: PropertyDossier.self)
        if let docs = await app.load(Queries.documents, as: DocumentsResponse.self) {
            documents = docs.registeredDocuments.filter { $0.propertyId == property.id }
        }
        features = (await app.load(Queries.landFeatures,
                                   variables: ["entityType": "property", "entityId": property.id],
                                   as: LandFeaturesResponse.self))?.landFeatures ?? []
        expenses = (await app.load(Queries.landExpenses,
                                   as: LandExpensesResponse.self))?.landExpenses ?? []
    }

    /// The extras blob, in a stable order so the list does not reshuffle.
    /// The stored blob, split the way it is read: the four boundaries as a set,
    /// everything else after.
    /// Parsed once per appearance rather than on every access. The body reads
    /// this three times and `plotFromAttributes` a fourth, each of which was
    /// re-decoding the JSON.
    @State private var cachedGroups: (parties: [(String, String)],
                                      boundaries: [(String, String)],
                                      rest: [(String, String)])?

    private var attributeGroups: (parties: [(String, String)],
                                  boundaries: [(String, String)],
                                  rest: [(String, String)]) {
        if let cachedGroups { return cachedGroups }
        return parseAttributes()
    }

    private func parseAttributes() -> (parties: [(String, String)],
                                       boundaries: [(String, String)],
                                       rest: [(String, String)]) {
        guard let data = property.attributes.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return ([], [], []) }
        var flat: [String: String] = [:]
        for (key, value) in raw {
            let text = String(describing: value).trimmingCharacters(in: .whitespaces)
            guard !text.isEmpty, text != "0", text != "<null>" else { continue }
            flat[key] = text
        }
        return deedAttributeGroups(flat)
    }

    private func money(_ v: Double) -> String { v > 0 ? rupees(v) : "" }

    /// Shown in the unit it was filed in; a property's area is NOT acres.
    private func area(_ v: Double, _ unitLabel: String) -> String {
        propertyAreaText(landArea: v, landUnit: unitLabel)
    }

    /// The plot number the deed reader stored, so a later document can be
    /// matched on it.
    private var plotFromAttributes: String {
        attributeGroups.rest.first { $0.0 == "Plot no." }?.1 ?? ""
    }

    /// What a buyer's advocate would ask for, assessed on this holding alone.
    private var readiness: Readiness {
        assessReadiness(ReadinessInput(
            hasTitleDocument: !documents.isEmpty,
            hasLocation: pin != nil,
            hasRegistrationNumber: !property.regDocNo.isEmpty,
            mutationStatus: property.mutationStatus, ecStatus: property.ecStatus,
            taxPaidUpto: property.taxPaidUpto, litigation: property.litigation),
            thisYear: Calendar.current.component(.year, from: Date()))
    }

    private var spentHere: Double {
        expenses.filter { $0.entityId == property.id }.reduce(0) { $0 + $1.amount }
    }

    private var propertyShare: HoldingShare {
        HoldingShare(title: screenTitle,
                     extent: headlineExtent,
                     place: whereLine,
                     reference: [property.regDocNo.isEmpty ? "" : "Doc \(property.regDocNo)",
                                 property.khataNo.isEmpty ? "" : "Khata \(property.khataNo)"]
                        .filter { !$0.isEmpty }.joined(separator: " · "),
                     owner: property.currentOwner,
                     pin: pin)
    }

    private func save(_ c: LatLng) {
        Task {
            struct Ack: Decodable { let updatePropertyGeo: IDPayload? }
            _ = await app.load(Queries.updatePropertyGeo,
                               variables: ["id": property.id,
                                           "geoPoint": String(format: "%.6f,%.6f", c.latitude, c.longitude)],
                               as: Ack.self)
            pin = c
        }
    }

    private func remove() async {
        struct Ack: Decodable { let deleteProperty: Bool }
        _ = await app.load(Mutations.deleteProperty, variables: ["id": property.id], as: Ack.self)
        dismiss()
    }
}


/// One star, shared by every screen that has something worth starring.
struct StarButton: View {
    @Environment(AppModel.self) private var app
    let type: String
    let id: String

    var body: some View {
        Button {
            Task { await app.toggleFavourite(type, id) }
        } label: {
            Image(systemName: app.isFavourite(type, id) ? "star.fill" : "star")
                .foregroundStyle(app.isFavourite(type, id) ? .yellow : .accentColor)
        }
        .accessibilityLabel(app.isFavourite(type, id) ? "Remove from favourites" : "Add to favourites")
    }
}
