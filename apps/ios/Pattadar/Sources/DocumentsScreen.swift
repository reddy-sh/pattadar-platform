import UserNotifications
import PattadarKit
import SwiftUI

struct DocumentsScreen: View {
    @Environment(AppModel.self) private var app
    @State private var docs: [RegisteredDocument] = []
    @State private var loaded = false
    @State private var showAdd = false
    @State private var query = ""
    @State private var filter: VaultFilter = .everything

    /// Search across everything a person would half-remember about a paper: the
    /// kind, the survey number, the village, the document number, the year.
    private var shown: [RegisteredDocument] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return docs.filter { d in
            let inFilter = filter == .everything || filter.matches(d.docType)
            guard inFilter else { return false }
            guard !q.isEmpty else { return true }
            return [d.docType, d.headline, d.village, d.surveyNo, d.plotNo,
                    d.regYear, d.sro, d.summary]
                .contains { $0.lowercased().contains(q) }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    // The chips live in the list rather than a toolbar so they
                    // scroll away — a filter row pinned above 40 documents eats
                    // the screen on a small phone.
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(VaultFilter.allCases) { f in
                                Button { filter = f } label: {
                                    Text(f.title)
                                        .font(.subheadline)
                                        .padding(.horizontal, 14).padding(.vertical, 8)
                                        .background(filter == f ? Color.accentColor
                                                    : Color(.tertiarySystemFill), in: Capsule())
                                        .foregroundStyle(filter == f ? .white : .primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                ForEach(shown) { d in
                    NavigationLink { DocumentDetailScreen(doc: d) } label: {
                        HStack(spacing: 12) {
                            DocumentIcon(docType: d.docType,
                                         hasFile: LocalFiles.url(for: d.id) != nil)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(d.docType.isEmpty ? documentKind(d.docType).label : d.docType)
                                    .fontWeight(.semibold)
                                // Lead with what the document SAYS, not its filename.
                                Text(d.headline.isEmpty ? subtitle(d) : d.headline)
                                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                // Whether a row opens a file or only its details
                                // was invisible until you tapped it.
                                if LocalFiles.url(for: d.id) == nil {
                                    Text("Details only — no file stored")
                                        .font(.caption2).foregroundStyle(.tertiary)
                                }
                                // The first caveat, as a flag. A document with
                                // something wrong looked exactly like one that
                                // read cleanly, and the caveats were two taps
                                // away on the detail screen.
                                if let flag = d.caveatList.first, !flag.isEmpty {
                                    Text(flag)
                                        .font(.caption2.weight(.medium))
                                        .lineLimit(2)
                                        .padding(.horizontal, 8).padding(.vertical, 4)
                                        .background(Color.orange.opacity(0.16), in: Capsule())
                                        .foregroundStyle(.orange)
                                }
                            }
                        }
                    }
                }
                if loaded && docs.isEmpty {
                    ContentUnavailableView("No documents yet", systemImage: "doc.text",
                                           description: Text("Scan a deed and its details are read for you."))
                } else if loaded && shown.isEmpty {
                    ContentUnavailableView("Nothing matches", systemImage: "magnifyingglass",
                                           description: Text("Try the survey number, the village, or the year."))
                }
            }
            .navigationTitle("Vault")
            .searchable(text: $query, prompt: "Sale deed, EC, Sy. 128, 2016…")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Text("\(docs.count) filed")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button { showAdd = true } label: { Label("Add", systemImage: "plus") }
                }
            }
            .sheet(isPresented: $showAdd) {
                AddDocumentSheet { Task { await load() } }
            }
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private func subtitle(_ d: RegisteredDocument) -> String {
        [d.village, d.surveyNo.isEmpty ? "" : "Sy \(d.surveyNo)"].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func load() async {
        if let r = await app.load(Queries.documents, as: DocumentsResponse.self) { docs = r.registeredDocuments }
        loaded = true
    }
}

/// What a document says, set like a news story — headline, scannable facts,
/// then short paragraphs. A fourteen-page bilingual deed is not something
/// anyone reads on a phone to find out whose land it is.
struct DocumentDetailScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let doc: RegisteredDocument
    @State private var showFile = false
    @State private var confirmDelete = false
    @State private var problem = ""
    @State private var reminded = false
    @State private var holdings: HoldingsResponse?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // The paper itself, named the way a filing clerk would: what
                // kind it is and which land it concerns, then the headline.
                VStack(alignment: .leading, spacing: 10) {
                    Text(kicker)
                        .font(.caption.weight(.medium))
                        .kerning(1.2)
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                    Text(doc.docType.isEmpty ? documentKind(doc.docType).label : doc.docType)
                        .font(.system(.title, design: .serif).weight(.semibold))
                    if !doc.headline.isEmpty {
                        Divider()
                        Text(doc.headline).font(.headline).fontWeight(.regular)
                    }
                    Text(filedLine)
                        .font(.caption).foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                // What this paper covers. A passbook naming two survey numbers
                // is filed against both, and the link has to run in this
                // direction too — otherwise a document is a dead end.
                if !coveredHoldings.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("COVERS \(coveredHoldings.count) \(coveredHoldings.count == 1 ? "HOLDING" : "HOLDINGS")")
                            .font(.caption.weight(.medium)).kerning(1.1)
                            .foregroundStyle(.secondary)
                        ForEach(coveredHoldings, id: \.0) { name, detail in
                            HStack(spacing: 12) {
                                DocumentIcon(docType: doc.docType, size: 34)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(name).font(.subheadline.weight(.medium))
                                    Text(detail).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(12)
                            .background(Color(.secondarySystemGroupedBackground),
                                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }

                if !doc.keyPointList.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(doc.keyPointList, id: \.self) { point in
                            HStack(alignment: .top, spacing: 8) {
                                Text("•").foregroundStyle(.tint)
                                Text(point)
                            }
                        }
                    }
                    .padding(.leading, 12)
                    .overlay(alignment: .leading) {
                        Rectangle().fill(.tint).frame(width: 3)
                    }
                }

                // Paragraphs stay paragraphs: losing the blank lines turns the
                // story back into the wall of text this replaced.
                ForEach(paragraphs, id: \.self) { para in
                    Text(para).font(.body)
                }

                if !doc.summary.isEmpty || !doc.headline.isEmpty {
                    Label("Read by AI from this file. It can be wrong — check it against the paper before relying on it.",
                          systemImage: "sparkles")
                        .font(.caption).foregroundStyle(.secondary)
                }

                if !doc.caveatList.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("We read this for you")
                            .font(.headline).foregroundStyle(Color.accentColor)
                        ForEach(doc.caveatList, id: \.self) { c in
                            Text(c).font(.subheadline)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        // The reading is a proposal about somebody's land, so
                        // it offers an action rather than ending in a shrug.
                        Button { remind() } label: {
                            Label(reminded ? "Reminder added" : "Add a reminder",
                                  systemImage: reminded ? "checkmark" : "bell.badge")
                                .font(.subheadline.weight(.medium))
                                .padding(.horizontal, 16).padding(.vertical, 10)
                                .background(Color.accentColor.opacity(reminded ? 0.12 : 1),
                                            in: Capsule())
                                .foregroundStyle(reminded ? Color.accentColor : .white)
                        }
                        .buttonStyle(.plain)
                        .disabled(reminded)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Color.accentColor.opacity(0.09),
                                in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }

                if let fileURL = LocalFiles.url(for: doc.id) {
                    Button { showFile = true } label: {
                        Label("Open the file", systemImage: "doc.text.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    // Titled with what the document IS, not the storage filename
                    // — a UUID at the top of the viewer names nothing.
                    .sheet(isPresented: $showFile) {
                        FileViewer(
                            url: fileURL,
                            title: doc.docType.isEmpty ? documentKind(doc.docType).label : doc.docType,
                            // Leaves the app as "Sale Deed - Nallapadu - 2003.pdf",
                            // not as the storage UUID.
                            shareName: shareFileName(
                                docType: doc.docType, village: doc.village,
                                date: [doc.registrationDate, doc.regYear, doc.createdAt]
                                    .first { !$0.isEmpty } ?? "",
                                fallbackExtension: fileURL.pathExtension))
                    }
                } else {
                    Label("No file stored for this document — only what was read from it.",
                          systemImage: "doc.badge.ellipsis")
                        .font(.caption).foregroundStyle(.secondary)
                }

                if !facts.isEmpty {
                    GroupBox("What was read from it") {
                        VStack(spacing: 0) {
                            ForEach(Array(facts.enumerated()), id: \.offset) { i, f in
                                if i > 0 { Divider() }
                                HStack {
                                    Text(f.0).foregroundStyle(.secondary)
                                    Spacer(minLength: 12)
                                    Text(f.1).fontWeight(.medium).multilineTextAlignment(.trailing)
                                }
                                .padding(.vertical, 7)
                            }
                        }
                    }
                }
                if !problem.isEmpty { Text(problem).foregroundStyle(.red).font(.callout) }

                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("Delete this document", systemImage: "trash.fill")
                }
                .padding(.top, 8)
            }
            .padding()
        }
        .navigationTitle(doc.docType.isEmpty ? "Document" : doc.docType)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            holdings = await app.load(Queries.holdings, as: HoldingsResponse.self)
        }
        .confirmationDialog("Delete this document?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { Task { await remove() } }
            Button("Keep it", role: .cancel) { }
        } message: {
            // Say what else goes: the summary and the parties are part of this
            // document, not separate things that survive it.
            Text("What was read from it — this summary, the parties and the extracted details — goes with it.")
        }
    }

    private func remove() async {
        struct Ack: Decodable { let deleteRegisteredDocument: Bool? }
        guard await app.load(Mutations.deleteRegisteredDocument,
                             variables: ["id": doc.id], as: Ack.self) != nil else {
            problem = app.lastFailure ?? "Couldn’t delete it."
            return
        }
        // Bytes must not outlive the record that explains them.
        LocalFiles.remove(documentID: doc.id)
        dismiss()
    }

    /// The land this paper is filed against, named.
    private var coveredHoldings: [(String, String)] {
        guard let h = holdings else { return [] }
        var out: [(String, String)] = []
        for p in h.parcels where p.id == doc.parcelId {
            let pb = h.passbooks.first { $0.id == p.passbookId }
            out.append(("Sy \(p.surveyNo)",
                        [areaText(p.extent, .acre), pb?.village ?? ""]
                            .filter { !$0.isEmpty }.joined(separator: " · ")))
        }
        for p in h.properties where p.id == doc.propertyId {
            out.append((p.label.isEmpty ? p.city : p.label,
                        [propertyAreaText(landArea: p.landArea, landUnit: p.landUnit), p.city]
                            .filter { !$0.isEmpty }.joined(separator: " · ")))
        }
        return out
    }

    private var filedLine: String {
        [doc.regYear.isEmpty ? "" : "Registered \(doc.regYear)",
         doc.sro.isEmpty ? "" : doc.sro,
         doc.createdAt.isEmpty ? "" : "filed \(relativeTime(doc.createdAt))"]
            .filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// A local notification a week out, so a caveat about somebody's land does
    /// not depend on them remembering to come back to this screen.
    private func remind() {
        let content = UNMutableNotificationContent()
        content.title = "Check \(doc.docType.isEmpty ? "a document" : doc.docType)"
        content.body = doc.caveatList.first ?? "Worth checking against the paper."
        content.sound = .default
        let when = UNTimeIntervalNotificationTrigger(timeInterval: 7 * 24 * 3600, repeats: false)
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: when))
        reminded = true
    }

    private var kicker: String {
        [doc.docType, doc.ref].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var paragraphs: [String] {
        doc.summary.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private var facts: [(String, String)] {
        [("Sub-registrar", doc.sro), ("Village", doc.village), ("Survey number", doc.surveyNo),
         ("Plot number", doc.plotNo), ("Extent", doc.extent),
         ("Consideration", doc.consideration > 0 ? rupees(doc.consideration) : "")]
            .filter { !$0.1.isEmpty }
    }
}


/// The four ways people ask for a paper: is it title, is it a revenue record,
/// is it a receipt, is it an agreement. Derived from the document kind rather
/// than a stored tag, so a scan files itself.
enum VaultFilter: String, CaseIterable, Identifiable {
    case everything, title, revenue, tax, agreements
    var id: String { rawValue }

    var title: String {
        switch self {
        case .everything: "Everything"
        case .title: "Title"
        case .revenue: "Revenue records"
        case .tax: "Tax"
        case .agreements: "Agreements"
        }
    }

    func matches(_ docType: String) -> Bool {
        switch documentKind(docType) {
        case .saleDeed, .giftDeed, .partition, .will: self == .title
        case .passbook, .mutation: self == .revenue
        case .taxReceipt: self == .tax
        case .powerOfAttorney, .encumbrance: self == .agreements
        case .identity, .other: self == .everything
        }
    }
}
