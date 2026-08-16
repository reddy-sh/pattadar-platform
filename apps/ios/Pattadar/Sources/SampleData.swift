import Foundation
import PattadarKit

/// The one seam between the M-series screens and the API that cannot feed
/// them yet.
///
/// The redesign (docs/specs/2026-08-16-ios-m-series-redesign.md) ships whole
/// screens — Services, Orders, Bills, Wallet, Registry, share links — whose
/// server half does not exist. Rather than each view inventing its own dummy
/// constants, every seeded value lives here, so that when the API learns to
/// answer, the wiring is one obvious file and not a scavenger hunt.
///
/// Nothing in this file is fetched, cached or persisted. It is the demo's
/// furniture, and it says so.
enum SampleData {

    // MARK: - Identity (M20)

    /// What an Aadhaar reading puts on the Account screen. The full number is
    /// never stored client-side — the server keeps it encrypted (founder
    /// decision, 2026-08); the app only ever holds the masked form.
    struct IdentityProfile {
        let aadhaarMasked: String
        let dateOfBirth: String
        let gender: String
        let address: String
    }

    static let identity = IdentityProfile(
        aadhaarMasked: "XXXX-XXXX-4417",
        dateOfBirth: "14/07/1961",
        gender: "Male",
        address: "4-118, Main Road, Kothapalli, Peddapuram"
    )

    // MARK: - Wallet (M24)

    struct WalletEntry: Identifiable {
        let id = UUID()
        let title: String
        let detail: String
        /// Positive is money in, negative is money out.
        let amount: Int
    }

    static let walletBalance = 1_240
    static let walletEntries: [WalletEntry] = [
        WalletEntry(title: "Refund — survey postponed", detail: "Order PT-2074 · 02/08/2026", amount: 2_900),
        WalletEntry(title: "Caretaker site visit", detail: "Sy 214/2 · 12/08/2026", amount: -1_200),
        WalletEntry(title: "Encumbrance certificate", detail: "Sy 189/1a · 28/07/2026", amount: -1_900),
        WalletEntry(title: "Added by UPI", detail: "26/07/2026", amount: 1_500),
    ]

    // MARK: - Services (M09)

    enum ServiceCategory: String, CaseIterable {
        case records = "Records"
        case ground = "On the ground"
        case legal = "Legal"
    }

    struct ServiceItem: Identifiable {
        let id = UUID()
        let name: String
        let detail: String
        let price: String
        let category: ServiceCategory
        let symbol: String
        /// The live work-request kind this maps onto — ordering goes through
        /// the real `AddRequestSheet`. Nil means a person prices it first.
        let requestKind: RequestKind?
    }

    static let services: [ServiceItem] = [
        ServiceItem(name: "Encumbrance certificate", detail: "13 years · 2 working days",
                    price: "₹1,900", category: .records, symbol: "doc.text.magnifyingglass", requestKind: .errand),
        ServiceItem(name: "Survey & measurement", detail: "Licensed surveyor · you get the sketch",
                    price: "₹2,900", category: .ground, symbol: "ruler", requestKind: .survey),
        ServiceItem(name: "Caretaker site visit", detail: "Dated photos, boundary walk, monthly",
                    price: "₹1,200/mo", category: .ground, symbol: "camera", requestKind: .photos),
        ServiceItem(name: "Legal opinion on title", detail: "Advocate reads your vault · 5 days",
                    price: "₹7,500", category: .legal, symbol: "checkmark.seal", requestKind: .legal),
        ServiceItem(name: "Mutation / title transfer", detail: "Filed and followed up for you",
                    price: "₹6,000", category: .records, symbol: "arrow.left.arrow.right", requestKind: .errand),
        ServiceItem(name: "Land management & clearing", detail: "Fencing, bush clearing, bunding",
                    price: "Quote", category: .ground, symbol: "leaf", requestKind: nil),
        ServiceItem(name: "Certified pahani / 1-B", detail: "Fresh copies from the MRO",
                    price: "₹450", category: .records, symbol: "doc.on.doc", requestKind: .errand),
        ServiceItem(name: "Document drafting", detail: "Sale, gift, partition, lease",
                    price: "₹3,500", category: .legal, symbol: "square.and.pencil", requestKind: .drafting),
        ServiceItem(name: "Rent collection", detail: "Follow up and receipt it",
                    price: "2% of rent", category: .ground, symbol: "indianrupeesign.circle", requestKind: .rent),
        ServiceItem(name: "Boundary re-marking", detail: "Stones reset to the sketch",
                    price: "₹3,400", category: .ground, symbol: "mappin.and.ellipse", requestKind: .survey),
        ServiceItem(name: "Bore water test", detail: "Sampled on site, lab report in a week",
                    price: "₹800", category: .ground, symbol: "drop", requestKind: .errand),
        ServiceItem(name: "Property tax settlement", detail: "Arrears computed and paid at the office",
                    price: "₹1,500", category: .records, symbol: "building.columns", requestKind: .errand),
    ]

    // MARK: - Order (M10)

    struct OrderStep {
        let title: String
        let detail: String
        var needsYou = false
        var photos: [String] = []
    }

    struct Order {
        let reference: String
        let kicker: String
        let title: String
        let provider: String
        let providerShort: String
        let steps: [OrderStep]
        let paid: Int
        let method: String
        let nextVisit: String
    }

    static let order = Order(
        reference: "Order PT-2081",
        kicker: "Caretaker site visit",
        title: "Sy 214/2 · August visit",
        provider: "M. Satyanarayana · verified caretaker, 4 yrs",
        providerShort: "Satyanarayana",
        steps: [
            OrderStep(title: "Visit done",
                      detail: "12/08/2026, 07:40 IST · 22:10 your time, 11 Aug"),
            OrderStep(title: "14 photos filed to the parcel",
                      detail: "Boundary stones 1–4, bore, approach road",
                      photos: ["mountain.2", "leaf", "drop"]),
            OrderStep(title: "One thing needs you",
                      detail: "The north-east stone has been moved about 4 ft inward. He recommends a re-survey before the sale.",
                      needsYou: true),
        ],
        paid: 1_200,
        method: "UPI · 12/08/2026",
        nextVisit: "12/09/2026"
    )
}
