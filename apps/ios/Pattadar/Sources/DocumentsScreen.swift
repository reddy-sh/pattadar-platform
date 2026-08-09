import UserNotifications
import PattadarKit
import SwiftUI

struct DocumentsScreen: View {
    @Environment(AppModel.self) private var app
    /// Every document with its spine, parsed ONCE at load. Rows, search,
    /// grouping and badges all read this cache — re-parsing the reading blob
    /// per render stutters at a few hundred documents.
    @State private var rows: [VaultRow] = []
    @State private var loaded = false
    @State private var showAdd = false
    @State private var query = ""
    @State private var groupBy: VaultGrouping = .property
    /// "all", "review", or a family key.
    @State private var filter = "all"

    struct VaultRow: Identifiable {
        let doc: RegisteredDocument
        let spine: DocSpine
        let year: String
        var id: String { doc.id }
    }

    /// Search reads the spine — identity, place, parties, quantum: the things
    /// a person half-remembers about a paper — plus the type and the office.
    private var shown: [VaultRow] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return rows.filter { r in
            let inFilter = switch filter {
            case "all": true
            case "review": !r.spine.actionable.isEmpty
            default: r.spine.family == filter
            }
            guard inFilter else { return false }
            guard !q.isEmpty else { return true }
            return [r.spine.identityLabel, r.spine.placeLine, r.spine.partiesLine,
                    r.spine.quantumLine, r.doc.docType, r.doc.headline,
                    r.doc.regYear, r.doc.sro]
                .contains { $0.lowercased().contains(q) }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    // The controls live in the list rather than a toolbar so
                    // they scroll away — rows pinned above 40 documents eat
                    // the screen on a small phone.
                    Picker("Group by", selection: $groupBy) {
                        ForEach(VaultGrouping.allCases) { g in
                            Text(g.title).tag(g)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 2, trailing: 16))
                    .listRowBackground(Color.clear)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(filterChips, id: \.key) { chip in
                                filterChipView(chip)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 6, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                // ONE amber banner, and only when something is genuinely
                // unsettled. Tapping it applies the review filter — the
                // banner is the filter, offered.
                if filter != "review", needsYou.things > 0 {
                    Section {
                        Button {
                            withAnimation(.snappy) { filter = "review" }
                        } label: { reviewBanner }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16))
                        .listRowBackground(Color.clear)
                    }
                }

                ForEach(grouped, id: \.key) { group in
                    Section {
                        ForEach(group.rows) { r in
                            NavigationLink { DocumentDetailScreen(doc: r.doc) } label: {
                                rowView(r)
                            }
                        }
                    } header: {
                        HStack(alignment: .firstTextBaseline) {
                            Text(group.key)
                            Spacer()
                            Text(group.rows.count == 1
                                 ? "1 document" : "\(group.rows.count) documents")
                        }
                    }
                }
                if loaded && rows.isEmpty {
                    ContentUnavailableView("No documents yet", systemImage: "doc.text",
                                           description: Text("Scan a deed and its details are read for you."))
                } else if loaded && shown.isEmpty {
                    ContentUnavailableView("Nothing matches", systemImage: "magnifyingglass",
                                           description: Text("Try the survey number, the khata, a name, or the year."))
                }
            }
            .navigationTitle("Vault")
            .searchable(text: $query, prompt: "Sy. 128/1A · Khata 397 · a name · 2016…")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    // A mirror, not a mystery: the pill follows the filter.
                    Text(filter == "all" && query.isEmpty
                         ? "\(rows.count) filed" : "\(shown.count) shown")
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

    // MARK: - Row

    @ViewBuilder private func rowView(_ r: VaultRow) -> some View {
        let hasFile = LocalFiles.url(for: r.doc.id) != nil
        HStack(spacing: 12) {
            VaultTile(docType: r.doc.docType, family: r.spine.family,
                      year: r.year, hasFile: hasFile)
            VStack(alignment: .leading, spacing: 3) {
                Text(primaryLine(r))
                    .fontWeight(.semibold)
                    .lineLimit(1)
                let secondary = secondaryLine(r)
                if !secondary.isEmpty {
                    Text(secondary)
                        .font(.caption).foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if !hasFile {
                    Text("Details only — no file stored")
                        .font(.caption2).foregroundStyle(.tertiary)
                }
            }
            Spacer(minLength: 0)
            if !r.spine.actionable.isEmpty {
                // Under the review filter the chip already says "to check";
                // the badge drops the words and keeps the count.
                Text(filter == "review"
                     ? "\(r.spine.actionable.count)"
                     : "\(r.spine.actionable.count) to check")
                    .font(.system(size: 11, weight: .bold)).monospacedDigit()
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Color.orange.opacity(0.15), in: Capsule())
                    .foregroundStyle(.orange)
            }
        }
    }

    /// Type + identity — "Sale Deed · 6337 / 2024", "ROR/Adangal · Khata 567"
    /// — the registrar's own way of naming a paper. A record with no number
    /// at all is titled by its headline, never by its bare kind.
    private func primaryLine(_ r: VaultRow) -> String {
        let type = r.doc.docType.isEmpty ? documentKind(r.doc.docType).label : r.doc.docType
        if !r.spine.identityLabel.isEmpty { return "\(type) · \(r.spine.identityLabel)" }
        if !r.doc.headline.isEmpty { return r.doc.headline }
        return type
    }

    /// The header never repeats inside its own rows: under a place heading
    /// the place is dropped; under a person heading the parties are. The
    /// suppressed slot returns the moment the heading stops naming it.
    private func secondaryLine(_ r: VaultRow) -> String {
        let s = r.spine
        let parts: [String] = switch groupBy {
        case .property: [s.quantumLine, s.partiesLine]
        case .person: [s.placeLine, s.quantumLine]
        case .type, .recent: [s.placeLine, s.quantumLine]
        }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    // MARK: - Filter chips & banner

    /// Only the families actually in this vault get chips — a chip that can
    /// only ever say "Nothing matches" is furniture.
    private var filterChips: [(key: String, label: String, tint: Color?)] {
        var chips: [(key: String, label: String, tint: Color?)] = [("all", "All", nil)]
        if rows.contains(where: { !$0.spine.actionable.isEmpty }) {
            chips.append(("review", "Needs review", .orange))
        }
        let families = ["title", "revenue", "map", "identity", "search", "old_record", "unsorted"]
        chips += families
            .filter { f in rows.contains { $0.spine.family == f } }
            .map { ($0, familyLabel($0), familyTintColor($0)) }
        return chips
    }

    @ViewBuilder private func filterChipView(_ chip: (key: String, label: String, tint: Color?)) -> some View {
        let active = filter == chip.key
        let tint = chip.tint ?? Color.accentColor
        Button { withAnimation(.snappy) { filter = chip.key } } label: {
            HStack(spacing: 6) {
                if let dot = chip.tint {
                    Circle().fill(dot).frame(width: 6, height: 6)
                }
                Text(chip.label)
                    .font(.subheadline.weight(active ? .semibold : .regular))
            }
            .padding(.horizontal, 13).padding(.vertical, 8)
            .background(active ? tint.opacity(0.18) : Color(.tertiarySystemFill),
                        in: Capsule())
            .foregroundStyle(active ? tint : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private var needsYou: (things: Int, docs: Int) {
        let flagged = rows.filter { !$0.spine.actionable.isEmpty }
        return (flagged.reduce(0) { $0 + $1.spine.actionable.count }, flagged.count)
    }

    private var reviewBanner: some View {
        HStack(spacing: 11) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 1) {
                Text(bannerHead)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.orange)
                Text("Tap to see only those papers")
                    .font(.caption).foregroundStyle(.orange.opacity(0.7))
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold)).foregroundStyle(.orange.opacity(0.6))
        }
        .padding(13)
        .background(Color.orange.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Color.orange.opacity(0.22), lineWidth: 1))
    }

    private var bannerHead: String {
        let (things, docCount) = needsYou
        if things == 1 { return "1 thing needs you" }
        if docCount == 1 { return "\(things) things need you in one document" }
        return "\(things) things need you across \(docCount) documents"
    }

    // MARK: - Grouping

    /// All four modes key off spine slots: Property → place, Type → family,
    /// Person → nameKey(primaryPerson), Recent → when it was filed.
    private var grouped: [(key: String, rows: [VaultRow])] {
        switch groupBy {
        case .property:
            // The holding key: village + BASE survey number, so Sy 1/1A files
            // with Sy 1 — the almirah shelf, not the FMB sheet. A multi-survey
            // paper (a 1B) shelves under its first survey; its full list stays
            // on the row and the page.
            return sortedGroups(by: { r in
                let v = r.spine.village.trimmingCharacters(in: .whitespaces)
                guard !v.isEmpty else { return "No place named" }
                let base = r.spine.surveys.first.map { surveyParts($0).no } ?? ""
                return base.isEmpty ? v : "\(v) · Sy \(base)"
            }, last: "No place named")
        case .type:
            let order = ["title", "revenue", "map", "identity", "search", "old_record", "unsorted"]
            let by = Dictionary(grouping: shown) { $0.spine.family }
            return order.compactMap { f in by[f].map { (familyLabel(f), $0) } }
        case .person:
            // People merge on the fuzzy key — "Telukutla Sankara Reddy" and
            // "Sankara Reddy Telukutla" are one shelf, shown by the first
            // spelling seen.
            var display: [String: String] = [:]
            var buckets: [String: [VaultRow]] = [:]
            for r in shown {
                let person = r.spine.primaryPerson.trimmingCharacters(in: .whitespaces)
                let key = person.isEmpty ? "" : nameKey(person)
                if display[key] == nil {
                    display[key] = person.isEmpty ? "No person named" : person
                }
                buckets[key, default: []].append(r)
            }
            return buckets.keys.sorted { a, b in
                if a.isEmpty { return false }
                if b.isEmpty { return true }
                return display[a]! < display[b]!
            }.map { (display[$0]!, buckets[$0]!) }
        case .recent:
            let now = Date()
            func bucket(_ r: VaultRow) -> String {
                guard let d = parseAuditTime(r.doc.createdAt) else { return "Earlier" }
                let days = now.timeIntervalSince(d) / 86_400
                if days < 1 { return "Today" }
                if days < 7 { return "This week" }
                if days < 30 { return "This month" }
                return "Earlier"
            }
            let by = Dictionary(grouping: shown, by: bucket)
            return ["Today", "This week", "This month", "Earlier"].compactMap { k in
                by[k].map { (k, $0.sorted { $0.doc.createdAt > $1.doc.createdAt }) }
            }
        }
    }

    private func sortedGroups(by key: (VaultRow) -> String, last: String)
        -> [(key: String, rows: [VaultRow])] {
        Dictionary(grouping: shown, by: key).sorted {
            if $0.key == last { return false }
            if $1.key == last { return true }
            return $0.key < $1.key
        }.map { ($0.key, $0.value) }
    }

    // MARK: - Load

    /// The year a person recognises the document by.
    private func rowYear(_ d: RegisteredDocument) -> String {
        if !d.regYear.isEmpty { return d.regYear }
        if let y = year(from: d.registrationDate) { return y }
        return year(from: d.createdAt) ?? ""
    }

    private func load() async {
        if let r = await app.load(Queries.documents, as: DocumentsResponse.self) {
            rows = r.registeredDocuments.map { d in
                let reading = (try? JSONSerialization.jsonObject(
                    with: Data(d.reading.utf8))) as? [String: Any] ?? [:]
                return VaultRow(
                    doc: d,
                    spine: docSpine(docType: d.docType, documentNo: d.documentNo,
                                    regYear: d.regYear, village: d.village,
                                    surveyNo: d.surveyNo, extent: d.extent,
                                    consideration: d.consideration, reading: reading),
                    year: rowYear(d))
            }
        }
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

                // WHAT IS INSIDE the file — every survey entry the record
                // lists, readable without opening the scan. The vault row
                // says "4 entries"; this is where the four are.
                if !recordEntries.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("INSIDE THIS RECORD — \(recordEntries.count) \(recordEntries.count == 1 ? "ENTRY" : "ENTRIES")")
                            .font(.caption.weight(.medium)).kerning(1.1)
                            .foregroundStyle(.secondary)
                        VStack(spacing: 0) {
                            ForEach(Array(recordEntries.enumerated()), id: \.offset) { i, e in
                                let row = entryLabel(e)
                                HStack {
                                    Text(row.name).font(.subheadline.weight(.medium))
                                    Spacer(minLength: 12)
                                    Text(row.detail)
                                        .font(.caption).foregroundStyle(.secondary)
                                        .multilineTextAlignment(.trailing)
                                }
                                .padding(.vertical, 9)
                                if i < recordEntries.count - 1 { Divider() }
                            }
                        }
                        .padding(.horizontal, 14)
                        .background(Color(.secondarySystemGroupedBackground),
                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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
        // Registered papers keep the registrar's own naming — "Sale Deed ·
        // 6337 / 2024". A record with NO number is titled by its content
        // ("Khata 567 · Telukutla Swetha"): the kind is already the chip
        // above, and repeating it in serif said nothing about THIS file.
        if !number.isEmpty { return "\(kind) · \(number)" }
        let spine = docSpine(docType: doc.docType, village: doc.village,
                             surveyNo: doc.surveyNo, extent: doc.extent,
                             reading: rawReading)
        let content = [spine.identityLabel, spine.partiesLine]
            .filter { !$0.isEmpty }.joined(separator: " · ")
        return content.isEmpty ? kind : content
    }

    /// The reading blob, raw — the entries table lives here.
    private var rawReading: [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(doc.reading.utf8))) as? [String: Any] ?? [:]
    }

    /// What is INSIDE the file: one row per survey entry the record lists.
    private var recordEntries: [[String: Any]] {
        rawReading["parcels"] as? [[String: Any]] ?? []
    }

    private func entryLabel(_ e: [String: Any]) -> (name: String, detail: String) {
        let sy = (e["survey_no"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        let sub = (e["subdivision"] as? String ?? "").trimmingCharacters(in: .whitespaces)
        let name = sy.isEmpty ? "Entry" : "Sy \(sy)" + (sub.isEmpty ? "" : "/\(sub)")
        let rawExtent = e["extent"]
        let parsed = parseExtent(rawExtent as? String, default: .acre)
        let value = (rawExtent as? Double) ?? parsed.value
        let unit = (e["unit"] as? String).map(unitKey) ?? parsed.unit
        var parts: [String] = []
        if value > 0 { parts.append(String(format: "%g %@", value, unit.label)) }
        if let c = e["classification"] as? String, !c.isEmpty { parts.append(humanize(c)) }
        if let a = e["acquisition_source"] as? String, !a.isEmpty { parts.append(humanize(a)) }
        return (name, parts.joined(separator: " · "))
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


/// The four ways a vault is asked for: by the land, by the kind of paper, by
/// the person, by when it arrived. All four key off the spine, so they are
/// modes of one list rather than four screens.
enum VaultGrouping: String, CaseIterable, Identifiable {
    case property, type, person, recent
    var id: String { rawValue }

    var title: String {
        switch self {
        case .property: "Property"
        case .type: "Type"
        case .person: "Person"
        case .recent: "Recent"
        }
    }
}
