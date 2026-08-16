import PDFKit
import PattadarKit
import SwiftUI
import UniformTypeIdentifiers

/// Page 2 of a document: every field, its page, its flags — then the file
/// map. Page 1 answers; this page proves. Identity numbers arrive masked and
/// reveal only on a deliberate tap (DocDetailsSection owns that rule).
struct DocumentAllDetailsScreen: View {
    let doc: RegisteredDocument
    let reading: DocReading
    let spine: DocSpine
    @State private var openAtPage: DocumentDetailScreen.PageSelection?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                if spine.family == "identity" {
                    IdentitySection(doc: doc, spine: spine)
                }
                DocDetailsSection(groups: detailGroups, reading: reading) { page in
                    if LocalFiles.url(for: doc.id) != nil {
                        openAtPage = DocumentDetailScreen.PageSelection(id: page)
                    }
                }
                FileContentsSection(reading: reading) { page in
                    if LocalFiles.url(for: doc.id) != nil {
                        openAtPage = DocumentDetailScreen.PageSelection(id: page)
                    }
                }
            }
            .padding()
        }
        .contentMargins(.bottom, 28, for: .scrollContent)
        .navigationTitle(navTitle)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(item: $openAtPage) { selection in
            if let url = LocalFiles.url(for: doc.id) {
                PDFFullScreen(url: url, title: navTitle, startPage: selection.id)
            }
        }
    }

    /// "Sale Deed · 6337 / 2024" — the registrar's own way of naming it.
    /// displayIdentity keeps an Aadhaar-shaped documentNo masked up here;
    /// the rows below are the one reveal surface.
    private var navTitle: String {
        let kind = doc.docType.isEmpty ? documentKind(doc.docType).label : doc.docType
        let number = [displayIdentity(doc.documentNo), doc.regYear]
            .filter { !$0.isEmpty }.joined(separator: " / ")
        if !number.isEmpty { return "\(kind) · \(number)" }
        return spine.identityLabel.isEmpty ? kind : "\(kind) · \(spine.identityLabel)"
    }

    /// One standard schema for every document: Who · Where · Boundaries ·
    /// What · Money · Registration. Each row carries the page it was read
    /// from; a row without provenance shows no caption, never "page 0".
    private var detailGroups: [(title: String, rows: [DocDetailRow])] {
        var who: [DocDetailRow] = []
        for party in reading.parties {
            who.append(DocDetailRow(label: party.role.capitalized
                                        + (party.isGPA ? " · via GPA holder" : ""),
                                    value: party.name, field: "parties"))
        }
        // The whereabouts chain, the way the schedule itself opens: the
        // string of places that make this land findable by any office.
        let whereItIs: [DocDetailRow] = [
            .init(label: "Village", value: doc.village, field: "village"),
            .init(label: "Mandal", value: doc.mandal, field: "mandal"),
            .init(label: "District", value: doc.district, field: "district"),
            .init(label: "Survey number", value: doc.surveyNo, field: "survey_no"),
            .init(label: "Plot number", value: doc.plotNo, field: "plot_no"),
        ].filter { !$0.value.isEmpty }
        // The four హద్దులు, deed order — తూర్పు first. These are the key
        // information on the paper: in a dispute, these four lines are the
        // argument.
        let boundaries: [DocDetailRow] = [
            .init(label: "East · తూర్పు", value: doc.boundaryEast, field: "boundaries"),
            .init(label: "South · దక్షిణం", value: doc.boundarySouth, field: "boundaries"),
            .init(label: "West · పడమర", value: doc.boundaryWest, field: "boundaries"),
            .init(label: "North · ఉత్తరం", value: doc.boundaryNorth, field: "boundaries"),
        ].filter { !$0.value.isEmpty }
        let what: [DocDetailRow] = [
            .init(label: "Extent", value: doc.extent, field: "extent"),
        ].filter { !$0.value.isEmpty }
        let money: [DocDetailRow] = [
            .init(label: "Consideration", value: doc.consideration > 0 ? rupees(doc.consideration) : "",
                  field: "consideration"),
        ].filter { !$0.value.isEmpty }
        let registration: [DocDetailRow] = [
            .init(label: "Document no.", value: doc.documentNo, field: "document_no"),
            .init(label: "Registered on", value: humanDate(doc.registrationDate), field: "registration_date"),
            .init(label: "Sub-registrar", value: doc.sro, field: "sro"),
        ].filter { !$0.value.isEmpty }
        return [("Who", who), ("Where it is", whereItIs), ("Boundaries · హద్దులు", boundaries),
                ("What", what), ("Money", money), ("Registration", registration)]
    }
}

/// The number read off the scan stored on THIS phone — nothing fetched,
/// nothing stored. The cloud only ever holds the masked form; the full
/// number lives in the file that never left the device.
/// Main-actor because `LocalFiles` is: every caller is a view at tap time.
@MainActor
func identityNumberFromLocalScan(documentID: String) -> String? {
    guard let url = LocalFiles.url(for: documentID),
          let pdf = PDFDocument(url: url), let text = pdf.string else { return nil }
    return firstIdentityNumber(in: text)
}

/// The identity card's own rows: the number, revealed from the SCAN ON THIS
/// PHONE at tap time — the cloud only ever holds the masked form, and the
/// full number lives in the file that never left the device — and the full
/// printed address, both with copy. The number's clipboard clears itself.
struct IdentitySection: View {
    let doc: RegisteredDocument
    let spine: DocSpine

    @State private var revealedNumber: String?
    @State private var revealStamp: Date?
    @State private var numberCopied = false
    @State private var addressCopied = false
    @State private var problem = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Text("IDENTITY")
                .font(.caption.weight(.medium)).kerning(1.1)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 0) {
                // One row, icon controls: the eye everyone knows, the copy
                // everyone knows. Words only where a word is the content.
                HStack(alignment: .center, spacing: Space.md) {
                    VStack(alignment: .leading, spacing: Space.hair) {
                        Text(numberLabel).font(.subheadline).foregroundStyle(.secondary)
                        if revealedNumber != nil {
                            Text(numberCopied ? "Copied — clipboard clears in a minute"
                                              : "Re-masks in a minute")
                                .font(.scaled(10.5)).foregroundStyle(.tertiary)
                        }
                    }
                    Spacer(minLength: 8)
                    Text(revealedNumber ?? spine.identityLabel)
                        .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                        .foregroundStyle(.primary)
                    Button { toggleReveal() } label: {
                        Image(systemName: revealedNumber == nil ? "eye" : "eye.slash")
                            .font(.scaled(15, weight: .semibold))
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel(revealedNumber == nil ? "Reveal the number" : "Hide the number")
                    if revealedNumber != nil {
                        Button { copyNumber() } label: {
                            Image(systemName: numberCopied ? "checkmark" : "doc.on.doc")
                                .font(.scaled(15, weight: .semibold))
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Copy the number")
                    }
                }
                .padding(.vertical, Space.md)
                if !problem.isEmpty {
                    Text(problem)
                        .font(.caption).foregroundStyle(Palette.caution)
                        .padding(.bottom, Space.md)
                }
                Divider()
                HStack(alignment: .center, spacing: Space.md) {
                    Text("Address on card").font(.subheadline).foregroundStyle(.secondary)
                    Spacer(minLength: 8)
                    Text(fullAddress)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.trailing)
                    Button {
                        UIPasteboard.general.string = fullAddress
                        addressCopied = true
                    } label: {
                        Image(systemName: addressCopied ? "checkmark" : "doc.on.doc")
                            .font(.scaled(15, weight: .semibold))
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Copy the address")
                }
                .padding(.vertical, Space.md)
            }
            .padding(.horizontal, Space.lg)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
    }

    private var numberLabel: String {
        doc.docType.lowercased().contains("pan") ? "PAN" : "Aadhaar no."
    }

    /// The full address exactly as printed: the reader's `address` field when
    /// it exists, else the key point that carries it, else the split parts.
    private var fullAddress: String {
        let raw = (try? JSONSerialization.jsonObject(with: Data(doc.reading.utf8))) as? [String: Any] ?? [:]
        if let a = raw["address"] as? String,
           !a.trimmingCharacters(in: .whitespaces).isEmpty { return a }
        if let bullet = doc.keyPointList.first(where: { $0.lowercased().hasPrefix("address") }) {
            return bullet.replacingOccurrences(of: #"^[Aa]ddress\s*[:\-–]\s*"#,
                                               with: "", options: .regularExpression)
        }
        return [doc.village, doc.mandal, doc.district].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    private func toggleReveal() {
        if revealedNumber != nil {
            revealedNumber = nil
            numberCopied = false
            return
        }
        guard let number = identityNumberFromLocalScan(documentID: doc.id) else {
            problem = "The number could not be read from this scan — open the file to see the card itself."
            return
        }
        problem = ""
        let stamp = Date()
        revealStamp = stamp
        revealedNumber = number
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
            if revealStamp == stamp {
                revealedNumber = nil
                numberCopied = false
            }
        }
    }

    private func copyNumber() {
        guard let revealedNumber else { return }
        // The clipboard clears ITSELF — a number pasted into a bank form must
        // not still be riding the pasteboard at dinner.
        UIPasteboard.general.setItems(
            [[UTType.utf8PlainText.identifier: revealedNumber]],
            options: [.expirationDate: Date().addingTimeInterval(60)])
        numberCopied = true
    }
}
