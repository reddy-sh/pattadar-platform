import PattadarKit
import SwiftUI

/// Share securely (M08) — three modes, and expiry is never optional.
///
/// The UI is the whole contract: an expiring link that asks the reader's
/// phone for a code, named people who sign in as themselves, or a
/// watermarked view with no download. The server half — the link, the OTP,
/// the watermark burn — is not built yet, and the Create button says so
/// rather than minting a URL that leads nowhere.
struct ShareFlowSheet: View {
    /// What is being shared — "Sy 214/2", a deed's name.
    let subject: String
    let paperCount: Int
    @Environment(\.dismiss) private var dismiss
    @State private var mode: Mode = .otpLink
    @State private var recipient = ""
    @State private var expiryDays = 7
    @State private var maskIdentity = true
    @State private var notifyOnOpen = true
    @State private var explainCreate = false

    enum Mode: String, CaseIterable, Identifiable {
        case otpLink, named, watermark
        var id: String { rawValue }

        var title: String {
            switch self {
            case .otpLink: "Expiring link + OTP"
            case .named: "Named people only"
            case .watermark: "View-only, watermarked"
            }
        }

        var detail: String {
            switch self {
            case .otpLink: "Anyone with the link, but only after a code sent to their phone."
            case .named: "They sign in as themselves. Nothing to forward."
            case .watermark: "Their name burned across every page. No download."
            }
        }

        var icon: String {
            switch self {
            case .otpLink: "link"
            case .named: "person.crop.circle.badge.checkmark"
            case .watermark: "rectangle.badge.person.crop"
            }
        }
    }

    private var expiryLabel: String {
        let date = Calendar.current.date(byAdding: .day, value: expiryDays, to: Date()) ?? Date()
        let f = DateFormatter()
        f.dateFormat = "dd/MM/yyyy"
        return "in \(expiryDays) day\(expiryDays == 1 ? "" : "s") · \(f.string(from: date))"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text(paperCount > 0 ? "Share \(paperCount) paper\(paperCount == 1 ? "" : "s")"
                                            : "Share this record")
                            .font(.recordTitle)
                        Text(subject)
                            .font(.bodyCopy).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, Space.xs)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section("How") {
                    ForEach(Mode.allCases) { candidate in
                        Button {
                            withAnimation(Motion.standard()) { mode = candidate }
                        } label: {
                            HStack(alignment: .top, spacing: Space.md) {
                                Image(systemName: candidate.icon)
                                    .foregroundStyle(Color.accentColor)
                                    .frame(width: 24)
                                    .padding(.top, Space.hair)
                                VStack(alignment: .leading, spacing: Space.hair) {
                                    Text(candidate.title)
                                        .font(.callout.weight(.semibold))
                                        .foregroundStyle(Palette.ink)
                                    Text(candidate.detail)
                                        .font(.note).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: mode == candidate
                                        ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(mode == candidate
                                        ? Color.accentColor : Color(.tertiaryLabel))
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }

                Section {
                    HStack {
                        Text(mode == .named ? "Who" : "Recipient")
                        Spacer()
                        TextField("+91 phone or email", text: $recipient)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    Picker("Expires", selection: $expiryDays) {
                        Text("in 1 day").tag(1)
                        Text("in 7 days").tag(7)
                        Text("in 30 days").tag(30)
                    }
                    Toggle("Mask Aadhaar & PAN", isOn: $maskIdentity)
                    Toggle("Tell me each time it's opened", isOn: $notifyOnOpen)
                } header: {
                    Text("Who and how long")
                } footer: {
                    Text("Expires \(expiryLabel). You can revoke at any time from Papers → Shared right now — revoking kills the link in seconds, not at expiry.")
                }

                Section {
                    PrimaryButton(title: mode == .named ? "Share with them" : "Create link") {
                        explainCreate = true
                    }
                }
            }
            .navigationTitle("Share securely")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Nothing was sent", isPresented: $explainCreate) {
                Button("OK", role: .cancel) { dismiss() }
            } message: {
                Text("The link, the OTP and the watermark are made on the server, and that half is being built now. Until it lands, share a paper's file itself from its own page — this sheet is the contract the server will keep.")
            }
        }
        .presentationDetents([.large])
    }
}
