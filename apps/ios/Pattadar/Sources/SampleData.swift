import Foundation

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
}
