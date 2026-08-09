import PattadarKit
import SwiftUI

/// One way in. Scan the paper; the paper decides which form you get.
///
/// The menu used to ask you to choose between "property from a deed",
/// "farmland under a passbook" and "passbook" BEFORE anything had been read —
/// a classification question put to the person least able to answer it, at the
/// only moment when nobody knew. The document already says what it is.
struct AddHoldingScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    /// What you already hold, for the duplicate detector. Callers pass what
    /// they have; the screen FETCHES when handed nothing — Home's review sheet
    /// passed [] for weeks, the detector had nothing to match against, and a
    /// second reading of khata 5001 became a twin passbook.
    let passbooks: [PassbookDetail]
    /// Needed to tell a NEW passbook from a fresh reading of one you hold.
    var parcels: [Parcel] = []
    /// Opened from the review list rather than from a fresh scan.
    var review: ReviewQueue.Entry? = nil
    /// The fetched fallback when `passbooks` came in empty.
    @State private var fetchedPassbooks: [PassbookDetail] = []
    @State private var fetchedParcels: [Parcel] = []

    private var knownPassbooks: [PassbookDetail] {
        passbooks.isEmpty ? fetchedPassbooks : passbooks
    }
    private var knownParcels: [Parcel] {
        parcels.isEmpty ? fetchedParcels : parcels
    }

    @State private var manualOpen = false
    @State private var scanned: ScanResult?
    @State private var route: Route?
    @State private var chooseManually = false

    /// Where a document sends you.
    enum Route: Identifiable {
        /// A 1-B / ROR / pattadar passbook: one khata number, one village,
        /// and MANY survey numbers under it.
        case passbook
        /// A deed for a site, flat or building.
        case property
        /// A deed for a single agricultural parcel under an existing passbook.
        case parcel
        var id: String { "\(self)" }
    }

    /// "Cancel" abandons the form; "Close" steps out of a read that keeps
    /// running. Calling both Cancel made leaving mid-scan look destructive.
    private var closeLabel: String { app.isReading ? "Close" : "Cancel" }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ScanFirstCard(
                        title: "Scan the document",
                        body_: "A passbook, a 1-B, or a sale deed. What it is, and everything on it, is read for you.",
                        endpoint: .registeredDocument,
                        manualOpen: $manualOpen,
                        result: $scanned,
                        onResult: decide
                    )
                }

                if let r = route {
                    Section {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(headline(for: r), systemImage: icon(for: r))
                                .font(.subheadline.weight(.medium))
                            Text(explanation(for: r))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }

                if manualOpen && scanned == nil {
                    Section {
                        Button { chooseManually = true } label: {
                            Label("Enter without a document", systemImage: "square.and.pencil")
                        }
                    } footer: {
                        Text("You will be asked what kind of holding it is.")
                    }
                }
            }
            .navigationTitle("Add a holding")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(closeLabel) { app.clearReadIfSettled(); dismiss() }
                }
            }
            // A finished read is kept in the model ON PURPOSE, so leaving the
            // screen while it works does not cancel it. But a read that has
            // already landed belongs to the flow that asked for it — carrying
            // it into the NEXT one showed last time's document and could only
            // be cleared by restarting the app.
            .task {
                // The duplicate detector must know what exists, whoever
                // opened this screen and however lazily.
                if passbooks.isEmpty,
                   let r = await app.load(Queries.passbooks, as: PassbooksResponse.self) {
                    fetchedPassbooks = r.passbooks
                }
                if parcels.isEmpty,
                   let h = await app.load(Queries.holdings, as: HoldingsResponse.self) {
                    fetchedParcels = h.parcels
                }
            }
            .onAppear {
                // A queued reading is what this screen is FOR when opened from
                // the review list: adopt it and route on it immediately.
                if let review, scanned == nil {
                    app.reviewInProgress = review.id
                    let r = review.scan
                    scanned = r
                    decide(r)
                    return
                }
                guard !app.isReading else { return }
                app.clearRead()
                scanned = nil
                route = nil
            }
            // The scan chose the form; hand it the reading so nothing is
            // scanned twice.
            .fullScreenCover(item: $route) { r in
                switch r {
                case .passbook:
                    AddPassbookScreen(initialScan: scanned, existing: knownPassbooks, existingParcels: knownParcels).onDisappear { dismiss() }
                case .property:
                    AddPropertyScreen(initialScan: scanned).onDisappear { dismiss() }
                case .parcel:
                    AddParcelScreen(passbooks: knownPassbooks, initialScan: scanned).onDisappear { dismiss() }
                }
            }
            .confirmationDialog("What are you adding?", isPresented: $chooseManually, titleVisibility: .visible) {
                Button("A passbook (1-B / ROR)") { route = .passbook }
                Button("A plot, flat or building") { route = .property }
                if !knownPassbooks.isEmpty {
                    Button("Farmland under a passbook") { route = .parcel }
                }
                Button("Cancel", role: .cancel) { }
            }
        }
    }

    /// The document names itself; this reads that name.
    private func decide(_ r: ScanResult) {
        let type = (r.fields["doc_type"] as? String ?? "").lowercased()
        let classification = (r.fields["classification"] as? String ?? "").lowercased()

        // A passbook or ROR carries a pattadar number and a village and lists
        // several survey numbers. That is a different shape from a deed, not a
        // variation of one.
        if type.contains("passbook") || type.contains("ror") || type.contains("adangal")
            || type.contains("1-b") || type.contains("1b")
            || !(r.fields["parcels"] as? [[String: Any]] ?? []).isEmpty {
            route = .passbook
        } else if classification.contains("agricultur") && !knownPassbooks.isEmpty {
            // Farmland from a deed still has to hang off a passbook.
            route = .parcel
        } else {
            route = .property
        }
    }

    private func headline(for r: Route) -> String {
        switch r {
        case .passbook: "This is a passbook — it lists several holdings"
        case .parcel: "This is agricultural land"
        case .property: "This is a plot or building"
        }
    }

    private func icon(for r: Route) -> String {
        switch r {
        case .passbook: "book.closed.fill"
        case .parcel: "leaf.fill"
        case .property: "building.2.fill"
        }
    }

    private func explanation(for r: Route) -> String {
        switch r {
        case .passbook:
            "Its khata number, village and every survey number on it are entered together."
        case .parcel:
            "It will be filed under one of your passbooks."
        case .property:
            "Sites, flats and buildings are recorded on their own."
        }
    }
}
