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

                // Grouped by the PLACE the paper is about — the same way the
                // Properties list groups, and the way a family almirah is
                // actually organised: the Mangala Kunta papers together, the
                // Katragunta papers together.
                ForEach(groupedByVillage, id: \.village) { group in
                    Section {
                        ForEach(group.docs) { d in
                            NavigationLink { DocumentDetailScreen(doc: d) } label: {
                                HStack(spacing: 12) {
                                    DocumentIcon(docType: d.docType,
                                                 hasFile: LocalFiles.url(for: d.id) != nil)
                                    VStack(alignment: .leading, spacing: 3) {
                                        // WHAT IS INSIDE is the title — each row's
                                        // bold line is unique content ("Khata 567 ·
                                        // Telukutla Swetha"), because five rows all
                                        // titled "ROR/Adangal" distinguished
                                        // nothing. The kind and year demote to the
                                        // small line; the icon says the kind too.
                                        Text(masterLine(d))
                                            .fontWeight(.semibold)
                                            .lineLimit(1)
                                        Text([d.docType.isEmpty ? documentKind(d.docType).label : d.docType,
                                              rowYear(d)]
                                            .filter { !$0.isEmpty }.joined(separator: " · "))
                                            .font(.caption).foregroundStyle(.secondary)
                                        if LocalFiles.url(for: d.id) == nil {
                                            Text("Details only — no file stored")
                                                .font(.caption2).foregroundStyle(.tertiary)
                                        }
                                    }
                                }
                            }
                        }
                    } header: {
                        Text(group.village)
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

    /// The papers of one place, together. Documents naming no place file
    /// under their own heading at the end rather than polluting a village's.
    private var groupedByVillage: [(village: String, docs: [RegisteredDocument])] {
        let by = Dictionary(grouping: shown) { d in
            d.village.trimmingCharacters(in: .whitespaces).isEmpty
                ? "No place named" : d.village
        }
        return by.sorted {
            if $0.key == "No place named" { return false }
            if $1.key == "No place named" { return true }
            return $0.key < $1.key
        }.map { (village: $0.key, docs: $0.value) }
    }

    /// The kit picks the facts per kind; the headline is the last resort for
    /// a reading that produced nothing identifying at all.
    private func masterLine(_ d: RegisteredDocument) -> String {
        let reading = (try? JSONSerialization.jsonObject(
            with: Data(d.reading.utf8))) as? [String: Any] ?? [:]
        // village: "" ON PURPOSE — the section header already names the
        // place, and "Mangalakunta · Sy 01" under a "Mangalakunta" heading
        // said the village twice on every row.
        let line = vaultKeyInfo(docType: d.docType, documentNo: d.documentNo,
                                regYear: d.regYear, village: "",
                                surveyNo: d.surveyNo, extent: d.extent,
                                reading: reading)
        if !line.isEmpty { return line }
        if !d.headline.isEmpty { return d.headline }
        return d.docType.isEmpty ? documentKind(d.docType).label : d.docType
    }

    /// The year a person recognises the document by.
    private func rowYear(_ d: RegisteredDocument) -> String {
        if !d.regYear.isEmpty { return d.regYear }
        if let y = year(from: d.registrationDate) { return y }
        return year(from: d.createdAt) ?? ""
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
    /// The full extraction, parsed once per appearance.
    @State private var parsedReading: DocReading?
    /// The summary in the language of the source. One tap, both ways.
    @State private var showTelugu = false
    /// The page the full-screen scan opens on, when one was tapped.
    @State private var openAtPage: PageSelection?

    struct PageSelection: Identifiable { let id: Int }

    private var reading: DocReading {
        if let parsedReading { return parsedReading }
        return DocReading(json: doc.reading)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // The paper itself, named the way the registrar's index names
                // it: its kind as a chip, "Sale deed · 2815 / 2020" in serif,
                // where and when it was registered, then the file's own facts.
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Text((doc.docType.isEmpty ? "Document" : doc.docType).uppercased())
                            .font(.system(size: 10.5, weight: .semibold)).kerning(0.8)
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(documentTintColor(doc.docType).opacity(0.16), in: Capsule())
                            .foregroundStyle(documentTintColor(doc.docType))
                        if !reading.language.isEmpty {
                            Text(reading.language)
                                .font(.caption).foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Text(headerTitle)
                        .font(.system(size: 28, weight: .semibold, design: .serif))
                    if !registeredLine.isEmpty {
                        Text(registeredLine).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Text(metaLine)
                        .font(.caption).foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                // The pages themselves, labelled with what each one IS —
                // deed, endorsement, adangal. Tap opens the scan there.
                if let fileURL = LocalFiles.url(for: doc.id) {
                    PDFPageStrip(url: fileURL, reading: reading) { page in
                        openAtPage = PageSelection(id: page)
                    }
                }

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
                if !paragraphs.isEmpty || !reading.summaryTe.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("What this says").font(.headline)
                            Spacer()
                            // The source is Telugu; the reader should not have
                            // to be an English reader to check it.
                            if !reading.summaryTe.isEmpty {
                                Button(showTelugu ? "In English" : "తెలుగులో") {
                                    withAnimation(.snappy) { showTelugu.toggle() }
                                }
                                .font(.subheadline.weight(.medium))
                            }
                        }
                        ForEach(shownParagraphs, id: \.self) { para in
                            Text(para).font(.body)
                        }
                        if !reading.watchOut.isEmpty {
                            Divider()
                            // The one line most likely to bite later, in amber
                            // where the eye lands after the story.
                            Label(reading.watchOut, systemImage: "exclamationmark.triangle.fill")
                                .font(.subheadline)
                                .foregroundStyle(.orange)
                        }
                    }
                    .padding(16)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }

                if !doc.summary.isEmpty || !doc.headline.isEmpty {
                    HStack {
                        Label(readByLine, systemImage: "sparkles")
                            .font(.caption).foregroundStyle(.secondary)
                    }
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

                DocDetailsSection(groups: detailGroups, reading: reading) { page in
                    if LocalFiles.url(for: doc.id) != nil { openAtPage = PageSelection(id: page) }
                }

                FileContentsSection(reading: reading) { page in
                    if LocalFiles.url(for: doc.id) != nil { openAtPage = PageSelection(id: page) }
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
        .fullScreenCover(item: $openAtPage) { selection in
            if let url = LocalFiles.url(for: doc.id) {
                PDFFullScreen(url: url, title: headerTitle, startPage: selection.id)
            }
        }
        .onAppear { if parsedReading == nil { parsedReading = DocReading(json: doc.reading) } }
    }

    /// "Sale deed · 2815 / 2020" — kind, number, year, the registrar's own way
    /// of naming it. Falls back to the kind alone for papers with no number.
    private var headerTitle: String {
        let kind = doc.docType.isEmpty ? documentKind(doc.docType).label : doc.docType
        let number = [doc.documentNo, doc.regYear].filter { !$0.isEmpty }.joined(separator: " / ")
        return number.isEmpty ? kind : "\(kind) · \(number)"
    }

    private var registeredLine: String {
        var parts: [String] = []
        if !doc.registrationDate.isEmpty { parts.append("Registered \(humanDate(doc.registrationDate))") }
        if !doc.sro.isEmpty { parts.append(doc.sro) }
        return parts.joined(separator: " · ")
    }

    /// Pages · size · filed — the file's own facts, one quiet line.
    private var metaLine: String {
        var parts: [String] = []
        if reading.totalPages > 0 { parts.append("\(reading.totalPages) pages") }
        if let url = LocalFiles.url(for: doc.id),
           let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? Int {
            parts.append(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))
        }
        parts.append(filedLine)
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// The summary in whichever language is switched on.
    private var shownParagraphs: [String] {
        let text = showTelugu && !reading.summaryTe.isEmpty ? reading.summaryTe : doc.summary
        return text.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// "Read by the agent · 11 fields · 3 need you"
    private var readByLine: String {
        var line = "Read by the agent — it can be wrong; check it against the paper"
        if !reading.fieldPages.isEmpty {
            line = "Read by the agent · \(reading.fieldPages.count) fields"
            if !reading.fieldConfidence.isEmpty {
                line += " · \(reading.fieldConfidence.count) need you"
            }
        }
        return line
    }

    /// One standard schema for every document: Who · What · Money ·
    /// Registration.
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
