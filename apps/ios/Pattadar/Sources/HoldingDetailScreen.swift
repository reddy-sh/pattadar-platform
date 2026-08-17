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
            .padding(.horizontal, Space.md).padding(.vertical, Space.xs)
            .background(Capsule().fill(tint.opacity(0.18)))
            .foregroundStyle(tint)
    }

    /// Which of the shell's views is rendered. Chips FILTER sections — the
    /// handoff is explicit that they must not scroll-to-anchor.
    @State private var seg = "Overview"
    private static let segs = ["Overview", "The record", "Papers", "Features", "People", "Services", "Money", "Timeline"]
    /// The gap being fixed, when a Needs-you row was tapped.
    @State private var fixing: ReadinessCheck?
    /// "Have Pattadar do it" lands on the request screen.
    @State private var requesting = false
    /// The boundary corner editor, opened straight from "Draw it".
    @State private var drawingBoundary = false
    /// The four-sides editor, and the saved schedule once edited here — the
    /// passed-in parcel is a snapshot and does not reload under this screen.
    @State private var editingSides = false
    @State private var savedSides: BoundarySides?
    /// The M08 share flow — modes, expiry, masking.
    @State private var sharing = false

    private var currentSides: BoundarySides {
        savedSides ?? BoundarySides(east: parcel.boundaryEast, south: parcel.boundarySouth,
                                    west: parcel.boundaryWest, north: parcel.boundaryNorth)
    }

    /// Services (M09) and Money (M49) hangers — the segue map's two new doors.
    private var servicesTab: some View {
        Section("Services") {
            NavigationLink { ServicesScreen() } label: {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Browse services")
                        Text("EC, survey, caretaker, legal — priced for this district")
                            .font(.note).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "storefront")
                }
            }
            NavigationLink { GetItDoneScreen() } label: {
                Label("Your requests", systemImage: "list.bullet.rectangle")
            }
        }
    }

    private var moneyTab: some View {
        Section("Money") {
            Fact(label: "Market value",
                 value: parcel.marketValue > 0 ? rupees(parcel.marketValue) : "—")
            Fact(label: "Purchase price",
                 value: parcel.purchasePrice > 0 ? rupees(parcel.purchasePrice) : "—")
            if parcel.loanAmount > 0 {
                LabeledContent("Loan outstanding") {
                    Text(rupees(parcel.loanAmount)).foregroundStyle(Palette.danger)
                }
            }
            NavigationLink { SpendScreen() } label: {
                Label("Spend on your land", systemImage: "indianrupeesign.circle")
            }
        }
    }

    /// The holder, once — hero fact strip, nowhere else.
    private var holderName: String {
        parcel.currentOwner.isEmpty ? (passbook?.ownerName ?? "") : parcel.currentOwner
    }

    /// Measured extent from the primary boundary, 0 when none is drawn.
    private var measuredAcres: Double {
        boundaryAcres(parseBoundary(parcel.boundary))
    }

    var body: some View {
        List {
            // The identity, once: classification and khata in the eyebrow,
            // extent and holder in the fact strip, the verdict as the ring.
            RecordHero(kicker: ["Land parcel",
                                passbook.map { "Khata \($0.pattadarNo)" } ?? ""]
                            .filter { !$0.isEmpty }.joined(separator: " · "),
                       title: "Sy " + parcel.surveyNo
                            + (parcel.subdivision.isEmpty ? "" : "/\(parcel.subdivision)"),
                       subtitle: parcelWhere,
                       facts: parcel.marketValue > 0
                            ? [("Extent", areaText(parcel.extent, .acre)),
                               ("Market", compactRupees(parcel.marketValue)),
                               ("Per acre", parcel.extent > 0
                                    ? compactRupees(parcel.marketValue / parcel.extent) : "—")]
                            : [("Extent", areaText(parcel.extent, .acre)),
                               ("Class", classificationLabel),
                               ("Held by", holderName.isEmpty ? "—" : holderName)],
                       readiness: readiness,
                       statusChip: humanize(parcel.status))

            SegChips(tabs: Self.segs, selection: $seg,
                     counts: ["Papers": documents.count, "Features": features.count])

            switch seg {
            case "The record": recordTab
            case "Papers": documentsTab
            case "People": peopleTab
            case "Features": onTheLandTab
            case "Services": servicesTab
            case "Money": moneyTab
            case "Timeline": timelineTab
            default: overviewTab
            }

            Section {
                Button { editing = true } label: { Label("Edit parcel", systemImage: "pencil.line") }
                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete parcel", systemImage: "trash.fill")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            RecordActionBar { sharing = true }
        }
        .sheet(isPresented: $sharing) {
            ShareFlowSheet(subject: "Sy \(parcel.surveyNo)"
                            + (parcel.subdivision.isEmpty ? "" : "/\(parcel.subdivision)"),
                           paperCount: documents.count)
        }
        // No repeated title: the hero IS the title, and "30 Acres · Sy 1"
        // twice in the first inch was the first duplication on the screen.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) { StarButton(type: "parcel", id: parcel.id) }
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: parcelShare.text) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
        .sheet(item: $fixing) { check in
            FixSheet(check: check,
                     onSelf: { runFix(check) },
                     onAgent: { requesting = true })
        }
        .sheet(isPresented: $requesting) {
            NavigationStack { GetItDoneScreen(showsClose: true) }
        }
        .sheet(isPresented: $drawingBoundary) {
            BoundaryEditorSheet(entityType: "parcel", entityId: parcel.id,
                                initial: parcel.boundary) { _ in
                Task { await loadDossier() }
            }
        }
        .sheet(isPresented: $editingSides) {
            BoundarySidesEditor(sides: currentSides) { sides in
                guard await app.load(Queries.updateParcelSides,
                                     variables: ["id": parcel.id, "north": sides.north,
                                                 "south": sides.south, "east": sides.east,
                                                 "west": sides.west],
                                     as: AnyMutationResult.self) != nil else {
                    return app.lastFailure ?? "Could not save the boundaries."
                }
                savedSides = sides
                return nil
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
            // Home's "Recently opened" card (M01) is this line.
            app.noteOpened("parcel", parcel.id)
            await loadDossier()
        }
        // Filing happens on other screens (the ⊕ sheet, the vault); a pull
        // brings this record up to date without leaving and coming back.
        .refreshable { await loadDossier() }
    }

    /// The do-it-yourself route for each gap, wired to the flow that fixes it.
    private func runFix(_ check: ReadinessCheck) {
        switch check.id {
        case "title", "ec", "tax": attaching = true
        case "location": seg = "The record"
        case "mutation", "registration", "litigation": editing = true
        default: editing = true
        }
    }

    // MARK: - Overview

    @ViewBuilder private var overviewTab: some View {
        NeedsYouCard(readiness: readiness) { fixing = $0 }

        // Photos, up front — the land as it looks, not a tab you have to find.
        HoldingPhotoStrip(photos: (dossier?.parcelPhotos ?? []).map(GalleryPhoto.init),
                          target: .parcel(parcel.id),
                          villageCentroid: villageCentroid,
                          placeName: passbook?.village ?? "",
                          onChanged: { Task { await loadDossier() } },
                          onAdd: { seg = "Features" },
                          addPrompt: "Add photos of this land")

        QuickActionsRow(actions: [
            .init(id: "Document", icon: "doc.badge.plus") { attaching = true },
            .init(id: "Boundary", icon: "skew") { drawingBoundary = true },
            .init(id: "Feature", icon: "leaf") { seg = "Features" },
            .init(id: "Request", icon: "person.badge.clock") { requesting = true },
        ])

        CountsList(documents: documents.count,
                   boundaryDrawn: !parseBoundary(parcel.boundary).isEmpty,
                   spent: spentHere,
                   onDocuments: { seg = "Papers" },
                   onBoundary: { seg = "The record" })
    }

    // MARK: - The record

    @ViewBuilder private var recordTab: some View {
        Section("Identity") {
            ActionFact(label: "Survey no.", value: parcel.surveyNo)
            ActionFact(label: "Subdivision", value: parcel.subdivision)
            ActionFact(label: "Khata / passbook", value: passbook?.pattadarNo ?? "")
            ActionFact(label: "Classification", value: classificationLabel)
            if !parcel.stake.isEmpty,
               parcel.stake.caseInsensitiveCompare(parcel.status) != .orderedSame {
                ActionFact(label: "My stake", value: humanize(parcel.stake))
            }
        }

        // The whereabouts chain, above the boundaries — the schedule's own
        // order: places first, then the four sides those places contain.
        WhereItIsSection(rows: [
            ("Village", passbook?.village ?? ""),
            ("Mandal", passbook?.mandal ?? ""),
            ("District", passbook?.district ?? ""),
            ("Address", parcel.address),
        ])

        BoundarySidesSection(sides: currentSides) { editingSides = true }

        Section("Extent") {
            ActionFact(label: "On the record", value: areaText(parcel.extent, .acre))
            ActionFact(label: "Measured", value: measuredAcres > 0
                        ? String(format: "%.2f acres", measuredAcres) : "",
                       actionWord: "Draw it",
                       hint: measuredAcres > 0 ? "from the drawn boundary" : "",
                       onAction: { drawingBoundary = true })
            if measuredAcres > 0, parcel.extent > 0 {
                ActionFact(label: "Difference",
                           value: String(format: "%+.2f acres", measuredAcres - parcel.extent),
                           hint: abs(measuredAcres - parcel.extent) > parcel.extent * 0.075
                                ? "usually a corner in the wrong place" : "")
            }
        }

        Section("Registration") {
            ActionFact(label: "Document no.", value: parcel.regDocNo,
                       actionWord: "Add", onAction: { editing = true })
            ActionFact(label: "Registered on", value: humanDate(parcel.regDate),
                       actionWord: "Add", onAction: { editing = true })
            ActionFact(label: "Sub-registrar", value: parcel.sro,
                       actionWord: "Add", onAction: { editing = true })
            ActionFact(label: "Acquired via", value: humanize(parcel.acquisitionSource))
            ActionFact(label: "Consideration", value: parcel.purchasePrice > 0
                        ? money(parcel.purchasePrice) : "",
                       actionWord: "Add", onAction: { editing = true })
        }

        Section("Clean title checks") {
            ActionFact(label: "Encumbrance", value: humanize(parcel.encumbranceStatus),
                       actionWord: "Get EC", onAction: { fixing = readiness.checks.first { $0.id == "ec" } })
            ActionFact(label: "EC dated", value: humanDate(parcel.ecDate))
            ActionFact(label: "Mutation", value: humanize(parcel.mutationStatus),
                       actionWord: "File it",
                       hint: readiness.checks.first { $0.id == "mutation" }?.passed == false
                            ? "still in the seller's name" : "",
                       onAction: { fixing = readiness.checks.first { $0.id == "mutation" } })
            ActionFact(label: "Land tax paid to", value: parcel.taxPaidUpto,
                       actionWord: "File it", onAction: { fixing = readiness.checks.first { $0.id == "tax" } })
            ActionFact(label: "Litigation", value: parcel.litigation ? "Under litigation" : "None declared")
            if parcel.litigation, !parcel.litigationNote.isEmpty {
                Text(parcel.litigationNote).font(.callout).foregroundStyle(Palette.danger)
            }
        }

        if parcel.marketValue > 0 || parcel.guidelineValue > 0 || parcel.loanAmount > 0
            || parcel.stampDuty > 0 || spentHere > 0 {
            Section {
                Fact(label: "Guideline value", value: money(parcel.guidelineValue), mono: true)
                Fact(label: "Market value", value: money(parcel.marketValue), mono: true)
                Fact(label: "Stamp duty", value: money(parcel.stampDuty), mono: true)
                Fact(label: "Loan outstanding", value: money(parcel.loanAmount), mono: true)
                Fact(label: "Spent on this land", value: spentHere > 0 ? money(spentHere) : "", mono: true)
            } header: {
                Text("Money")
            } footer: {
                Text("What a deed records is not what the land is worth today.")
            }
        }

        // WHERE it is: the map preview lives on this tab — the record of the
        // ground beside the record of the paper.
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
    }

    // MARK: - Documents

    @ViewBuilder private var documentsTab: some View {
        LinkedDocumentsSection(documents: documents) { attaching = true }
        StillExpectedSection(missing: expectedDocuments) { _ in attaching = true }
    }

    /// What agricultural land is asked for and does not yet have on file —
    /// matched against the filed documents and the record's own fields.
    private var expectedDocuments: [StillExpectedSection.Expected] {
        let filed = documents.map { $0.docType.lowercased() }
        func missing(_ match: String) -> Bool { !filed.contains { $0.contains(match) } }
        var out: [StillExpectedSection.Expected] = []
        if missing("deed") && parcel.regDocNo.isEmpty {
            out.append(.init(id: "deed", name: "Registered sale deed",
                             why: "The document that makes it yours"))
        }
        if missing("ror") && missing("adangal") && missing("passbook") {
            out.append(.init(id: "ror", name: "1-B / Adangal extract",
                             why: "Proof the record moved to you"))
        }
        if missing("encumbrance") && !readinessCheckPassed("ec") {
            out.append(.init(id: "ec", name: "Encumbrance certificate",
                             why: "Shows any loan sitting on the land"))
        }
        if missing("tax") && !readinessCheckPassed("tax") {
            out.append(.init(id: "tax", name: "Land tax receipt",
                             why: "Arrears surface at sale"))
        }
        if missing("fmb") {
            out.append(.init(id: "fmb", name: "FMB sheet",
                             why: "The surveyor's own drawing of the boundary"))
        }
        return out
    }

    private func readinessCheckPassed(_ id: String) -> Bool {
        readiness.checks.first { $0.id == id }?.passed ?? false
    }

    // MARK: - People

    @ViewBuilder private var peopleTab: some View {
        Section("Held by") {
            HStack(spacing: Space.md) {
                Avatar(name: holderName, size: 40, isSelf: false)
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text(holderName.isEmpty ? "Not recorded" : holderName)
                        .font(.subheadline.weight(.semibold))
                    Text("On the record" + (parcel.acquisitionSource.isEmpty
                        ? "" : " · via \(humanize(parcel.acquisitionSource).lowercased())"))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }

        OwnerHistorySection(owners: dossier?.parcels.first { $0.id == parcel.id }?.owners ?? [])

        Section {
            Button {
                app.openFamily = true
                app.selectedTab = .you
            } label: {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Beneficiaries").font(.subheadline.weight(.medium))
                        Text("Who inherits this — land is lost more often to a paper nobody could find than to a dispute.")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "person.badge.shield.checkmark")
                        .foregroundStyle(Palette.caution)
                }
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - On the land

    @ViewBuilder private var onTheLandTab: some View {
        OnTheLandSection(entityType: "parcel", entityId: parcel.id,
                         features: features,
                         onChanged: { Task { await loadDossier() } })

        HoldingPhotoGallery(photos: (dossier?.parcelPhotos ?? []).map(GalleryPhoto.init),
                            target: .parcel(parcel.id),
                            villageCentroid: villageCentroid,
                            placeName: passbook?.village ?? "",
                            onChanged: { Task { await loadDossier() } })
    }

    // MARK: - Timeline

    @ViewBuilder private var timelineTab: some View {
        NotesSection(entityType: "parcel", entityId: parcel.id,
                     notes: dossier?.notes ?? []) { Task { await loadDossier() } }

        RecordHistorySection(events: dossier?.auditEvents ?? [])
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
                            .foregroundStyle(Palette.success.opacity(0.18))
                            .stroke(Palette.success, lineWidth: 2)
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
                                .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                                .background(.thinMaterial, in: Capsule())
                                .padding(Space.md)
                        }
                    }
                    .overlay(alignment: .bottomTrailing) {
                        Label("Maps", systemImage: "map")
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
                            .background(.thinMaterial, in: Capsule())
                            .padding(Space.md)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                } else {
                    // Nothing pinned: an empty map is a lie, so the row says so
                    // and offers the one action available.
                    Label {
                        VStack(alignment: .leading, spacing: Space.hair) {
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
                           ? nil : EdgeInsets(top: Space.sm, leading: Space.md, bottom: Space.sm, trailing: Space.md))
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

    /// Which of the shell's views is rendered — same shell as the parcel.
    @State private var seg = "Overview"
    @State private var fixing: ReadinessCheck?
    @State private var requesting = false
    @State private var drawingBoundary = false
    /// The four-sides editor; edits land in the attributes blob, and the
    /// local copy keeps the screen honest until the next reload.
    @State private var editingSides = false
    @State private var savedSides: BoundarySides?
    /// The M08 share flow — modes, expiry, masking.
    @State private var sharing = false

    /// Services (M09) and Money (M49) hangers — the segue map's two new doors.
    private var servicesTab: some View {
        Section("Services") {
            NavigationLink { ServicesScreen() } label: {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Browse services")
                        Text("EC, survey, caretaker, legal — priced for this district")
                            .font(.note).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "storefront")
                }
            }
            NavigationLink { GetItDoneScreen() } label: {
                Label("Your requests", systemImage: "list.bullet.rectangle")
            }
        }
    }

    private var moneyTab: some View {
        Section("Money") {
            Fact(label: "Market value",
                 value: property.marketValue > 0 ? rupees(property.marketValue) : "—")
            Fact(label: "Purchase price",
                 value: property.purchasePrice > 0 ? rupees(property.purchasePrice) : "—")
            NavigationLink { SpendScreen() } label: {
                Label("Spend on this property", systemImage: "indianrupeesign.circle")
            }
        }
    }

    private var currentSides: BoundarySides {
        if let savedSides { return savedSides }
        var sides = BoundarySides()
        for (label, value) in attributeGroups.boundaries {
            switch label.lowercased() {
            case "east": sides.east = value
            case "south": sides.south = value
            case "west": sides.west = value
            case "north": sides.north = value
            default: break
            }
        }
        return sides
    }

    /// The attributes blob with the four sides replaced — everything else the
    /// deed reader stored is preserved untouched.
    private func attributesReplacingSides(_ sides: BoundarySides) -> String {
        var raw = (try? JSONSerialization.jsonObject(with: Data(property.attributes.utf8)))
            as? [String: String] ?? [:]
        raw["Boundary east"] = sides.east
        raw["Boundary south"] = sides.south
        raw["Boundary west"] = sides.west
        raw["Boundary north"] = sides.north
        for (k, v) in raw where v.trimmingCharacters(in: .whitespaces).isEmpty {
            raw.removeValue(forKey: k)
        }
        guard let data = try? JSONSerialization.data(withJSONObject: raw, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return property.attributes }
        return text
    }

    private var kind: HoldingKind { HoldingKind.of(propertyType: property.type) }

    /// The land tab's name changes with what stands on it.
    private var landTabName: String { "Features" }

    private var segTabs: [String] {
        ["Overview", "The record", "Papers", "Features", "People", "Services", "Money", "Timeline"]
    }

    /// Per-kind hero gradient from the handoff: plot slate, built green.
    private var heroGradient: [Color] {
        kind == .plot || kind == .commercial
            ? [Palette.record, Palette.recordDeep]
            : [Palette.record, Palette.recordDeep]
    }

    private var measuredAcres: Double { boundaryAcres(parseBoundary(property.boundary)) }

    private var heroFacts: [(label: String, value: String)] {
        var out: [(String, String)] = []
        if !headlineExtent.isEmpty { out.append(("Extent", headlineExtent)) }
        if property.builtupArea > 0 && property.landArea > 0 {
            out.append(("Built-up", area(property.builtupArea, property.builtupUnit)))
        } else {
            out.append(("Type", humanize(property.type)))
        }
        out.append(("Held by", property.currentOwner.isEmpty ? "—" : property.currentOwner))
        return out
    }

    var body: some View {
        List {
            // The identity, once — the same shell as a parcel, tinted by kind.
            RecordHero(kicker: [kind.noun,
                                property.khataNo.isEmpty ? "" : "Khata \(property.khataNo)"]
                            .filter { !$0.isEmpty }.joined(separator: " · "),
                       title: screenTitle,
                       // The label earns its place only when it says something
                       // the where-line does not — "Mangalakunta · Mangalakunta"
                       // was the same word wearing two hats.
                       subtitle: (whereLine.lowercased().contains(property.label.lowercased())
                                  && !property.label.isEmpty
                                  ? [whereLine] : [property.label, whereLine])
                            .filter { !$0.isEmpty }.joined(separator: " · "),
                       facts: heroFacts,
                       readiness: readiness,
                       statusChip: humanize(property.holdingStatus),
                       gradient: heroGradient)

            SegChips(tabs: segTabs, selection: $seg,
                     counts: ["Papers": documents.count, "Features": features.count])

            switch seg {
            case "The record": recordTab
            case "Papers": documentsTab
            case "People": peopleTab
            case "Features": landTab
            case "Services": servicesTab
            case "Money": moneyTab
            case "Timeline": timelineTab
            default: overviewTab
            }

            Section {
                Button { editing = true } label: { Label("Edit property", systemImage: "pencil.line") }
                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete property", systemImage: "trash.fill")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            RecordActionBar { sharing = true }
        }
        .sheet(isPresented: $sharing) {
            ShareFlowSheet(subject: property.label.isEmpty ? humanize(property.type) : property.label,
                           paperCount: documents.count)
        }
        // The hero is the title; repeating it in the bar was the screen's
        // first duplicated fact.
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) { StarButton(type: "property", id: property.id) }
            ToolbarItem(placement: .topBarTrailing) {
                ShareLink(item: propertyShare.text) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
        .sheet(item: $fixing) { check in
            FixSheet(check: check,
                     onSelf: { runFix(check) },
                     onAgent: { requesting = true })
        }
        .sheet(isPresented: $requesting) {
            NavigationStack { GetItDoneScreen(showsClose: true) }
        }
        .sheet(isPresented: $drawingBoundary) {
            BoundaryEditorSheet(entityType: "property", entityId: property.id,
                                initial: property.boundary) { _ in
                Task { await loadDossier() }
            }
        }
        .sheet(isPresented: $editingSides) {
            BoundarySidesEditor(sides: currentSides) { sides in
                guard await app.load(Queries.updatePropertyAttributes,
                                     variables: ["id": property.id,
                                                 "attributes": attributesReplacingSides(sides)],
                                     as: AnyMutationResult.self) != nil else {
                    return app.lastFailure ?? "Could not save the boundaries."
                }
                savedSides = sides
                return nil
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
        .task {
            // Home's "Recently opened" card (M01) is this line.
            app.noteOpened("property", property.id)
            await loadDossier()
        }
        .refreshable { await loadDossier() }
    }

    private func runFix(_ check: ReadinessCheck) {
        switch check.id {
        case "title", "ec", "tax": attaching = true
        case "location": seg = "The record"
        default: editing = true
        }
    }

    // MARK: - Overview

    @ViewBuilder private var overviewTab: some View {
        NeedsYouCard(readiness: readiness) { fixing = $0 }

        // Photos, up front — the property as it looks, not a tab away. No
        // village centroid here (a property is addressed, not surveyed), so
        // the plausibility check stays quiet and coordinates speak for
        // themselves — same as the land/property tab's gallery.
        HoldingPhotoStrip(photos: (dossier?.propertyPhotos ?? []).map(GalleryPhoto.init),
                          target: .property(property.id),
                          villageCentroid: nil,
                          placeName: property.city.isEmpty ? property.locality : property.city,
                          onChanged: { Task { await loadDossier() } },
                          onAdd: { seg = landTabName },
                          addPrompt: "Add photos of this property")

        QuickActionsRow(actions: [
            .init(id: "Document", icon: "doc.badge.plus") { attaching = true },
            .init(id: "Boundary", icon: "skew") { drawingBoundary = true },
            .init(id: "Feature", icon: "leaf") { seg = landTabName },
            .init(id: "Request", icon: "person.badge.clock") { requesting = true },
        ])

        CountsList(documents: documents.count,
                   boundaryDrawn: !parseBoundary(property.boundary).isEmpty,
                   spent: spentHere,
                   onDocuments: { seg = "Papers" },
                   onBoundary: { seg = "The record" })
    }

    // MARK: - The record

    @ViewBuilder private var recordTab: some View {
        Section("Identity") {
            ActionFact(label: "Type", value: humanize(property.type))
            ActionFact(label: "Khata no.", value: property.khataNo,
                       onAction: { editing = true })
            ActionFact(label: "Assessment no.", value: property.ghmcAssessmentNo,
                       onAction: { editing = true })
            ActionFact(label: "RERA no.", value: property.reraNo)
            if !property.stake.isEmpty,
               property.stake.caseInsensitiveCompare(property.holdingStatus) != .orderedSame {
                ActionFact(label: "My stake", value: humanize(property.stake))
            }
            if !property.address.isEmpty,
               property.address.caseInsensitiveCompare(whereLine) != .orderedSame {
                ActionFact(label: "Address", value: property.address)
            }
        }

        // The whereabouts chain, then the four sides — the schedule's order.
        WhereItIsSection(rows: [
            ("Village", property.city),
            ("Mandal", property.locality),
            ("District", property.district),
        ] + attributeGroups.rest.filter { $0.0.lowercased().contains("survey") })

        BoundarySidesSection(sides: currentSides) { editingSides = true }

        Section("Extent") {
            ActionFact(label: "On the record",
                       value: property.landArea > 0 ? area(property.landArea, property.landUnit) : "",
                       onAction: { editing = true })
            if property.builtupArea > 0 {
                ActionFact(label: "Built-up", value: area(property.builtupArea, property.builtupUnit))
            }
            ActionFact(label: "Measured", value: measuredAcres > 0
                        ? String(format: "%.2f acres", measuredAcres) : "",
                       actionWord: "Draw it",
                       hint: measuredAcres > 0 ? "from the drawn boundary" : "",
                       onAction: { drawingBoundary = true })
        }

        Section("Registration") {
            ActionFact(label: "Document no.", value: property.regDocNo,
                       onAction: { editing = true })
            ActionFact(label: "Registered on", value: humanDate(property.regDate),
                       onAction: { editing = true })
            ActionFact(label: "Sub-registrar", value: property.sro,
                       onAction: { editing = true })
            ActionFact(label: "Acquired via", value: humanize(property.acquisitionMode))
            ActionFact(label: "Consideration", value: property.purchasePrice > 0
                        ? money(property.purchasePrice) : "",
                       onAction: { editing = true })
        }

        Section("Clean title checks") {
            ActionFact(label: "EC status", value: humanize(property.ecStatus),
                       actionWord: "Get EC",
                       onAction: { fixing = readiness.checks.first { $0.id == "ec" } })
            ActionFact(label: "EC dated", value: humanDate(property.ecDate))
            ActionFact(label: "Mutation", value: humanize(property.mutationStatus),
                       actionWord: "File it",
                       onAction: { fixing = readiness.checks.first { $0.id == "mutation" } })
            ActionFact(label: "Tax paid up to", value: property.taxPaidUpto,
                       actionWord: "File it",
                       onAction: { fixing = readiness.checks.first { $0.id == "tax" } })
            ActionFact(label: "Litigation",
                       value: property.litigation ? "Under litigation" : "None declared")
            if property.litigation, !property.litigationNote.isEmpty {
                Text(property.litigationNote).font(.callout).foregroundStyle(Palette.danger)
            }
        }

        if !attributeGroups.rest.isEmpty {
            Section("Details from the deed") {
                ForEach(attributeGroups.rest, id: \.0) { key, value in
                    Fact(label: humanize(key), value: value)
                }
            }
        }

        if property.currentValue > 0 || property.marketValue > 0
            || property.guidelineValue > 0 || spentHere > 0 {
            Section {
                Fact(label: "Guideline value", value: money(property.guidelineValue), mono: true)
                Fact(label: "Market value", value: money(property.marketValue), mono: true)
                Fact(label: "Current value", value: money(property.currentValue), mono: true)
                Fact(label: "Spent on this property", value: spentHere > 0 ? money(spentHere) : "", mono: true)
            } header: {
                Text("Money")
            } footer: {
                Text("What a deed records is not what the land is worth today.")
            }
        }

        // WHERE it is: the map beside the paper it must match.
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
    }

    // MARK: - Documents

    @ViewBuilder private var documentsTab: some View {
        LinkedDocumentsSection(documents: documents) { attaching = true }
        StillExpectedSection(missing: expectedDocuments) { _ in attaching = true }
    }

    /// The papers this KIND of holding is asked for — a plot is asked for its
    /// layout and LRS, a flat for its OC — matched against what is filed.
    private var expectedDocuments: [StillExpectedSection.Expected] {
        let filed = documents.map { $0.docType.lowercased() }
        func missing(_ match: String) -> Bool { !filed.contains { $0.contains(match) } }
        var out: [StillExpectedSection.Expected] = []
        if missing("deed") && property.regDocNo.isEmpty {
            out.append(.init(id: "deed", name: "Registered sale deed",
                             why: "The document that makes it yours"))
        }
        if kind == .plot {
            if missing("layout") && missing("map") {
                out.append(.init(id: "layout", name: "Approved layout plan",
                                 why: "Shows your plot in the sanctioned layout"))
            }
            if missing("lrs") {
                out.append(.init(id: "lrs", name: "LRS proceedings",
                                 why: "Without it you cannot build"))
            }
        } else {
            if missing("occupancy") && missing("oc") {
                out.append(.init(id: "oc", name: "Occupancy certificate",
                                 why: "Hard to sell or mortgage without it"))
            }
        }
        if missing("encumbrance") && readiness.checks.first(where: { $0.id == "ec" })?.passed != true {
            out.append(.init(id: "ec", name: "Encumbrance certificate",
                             why: "Shows any loan sitting on it"))
        }
        if missing("tax") && readiness.checks.first(where: { $0.id == "tax" })?.passed != true {
            out.append(.init(id: "tax", name: "Property tax receipt",
                             why: "Arrears surface at sale"))
        }
        return out
    }

    // MARK: - People

    @ViewBuilder private var peopleTab: some View {
        Section("Held by") {
            HStack(spacing: Space.md) {
                Avatar(name: property.currentOwner, size: 40, isSelf: false)
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text(property.currentOwner.isEmpty ? "Not recorded" : property.currentOwner)
                        .font(.subheadline.weight(.semibold))
                    Text("On the record" + (property.acquisitionMode.isEmpty
                        ? "" : " · via \(humanize(property.acquisitionMode).lowercased())"))
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }

        // WHO transferred it, and to whom — the deed's own words. A name
        // alone does not identify a person in a land record; the parentage,
        // age and address are what match this seller to the buyer on the
        // previous deed.
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

        Section {
            Button {
                app.openFamily = true
                app.selectedTab = .you
            } label: {
                Label {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text("Beneficiaries").font(.subheadline.weight(.medium))
                        Text("Who inherits this — land is lost more often to a paper nobody could find than to a dispute.")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "person.badge.shield.checkmark")
                        .foregroundStyle(Palette.caution)
                }
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - On the land / property

    @ViewBuilder private var landTab: some View {
        OnTheLandSection(entityType: "property", entityId: property.id,
                         features: features,
                         onChanged: { Task { await loadDossier() } })

        // No village centroid on this side — a property is addressed, not
        // surveyed — so the plausibility check stays quiet and the
        // coordinates speak for themselves.
        HoldingPhotoGallery(photos: (dossier?.propertyPhotos ?? []).map(GalleryPhoto.init),
                            target: .property(property.id),
                            villageCentroid: nil,
                            placeName: property.city.isEmpty ? property.locality : property.city,
                            onChanged: { Task { await loadDossier() } })
    }

    // MARK: - Timeline

    @ViewBuilder private var timelineTab: some View {
        if !property.notes.isEmpty {
            Section("Notes") { Text(property.notes).font(.callout) }
        }

        NotesSection(entityType: "property", entityId: property.id,
                     notes: dossier?.notes ?? []) { Task { await loadDossier() } }

        RecordHistorySection(events: dossier?.auditEvents ?? [])
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
                .foregroundStyle(app.isFavourite(type, id) ? Palette.accent : .accentColor)
        }
        .accessibilityLabel(app.isFavourite(type, id) ? "Remove from favourites" : "Add to favourites")
    }
}
