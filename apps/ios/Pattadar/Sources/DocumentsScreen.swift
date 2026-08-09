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
            // plotNo and summary ride along: urban papers have a plot where
            // the spine has no survey, and the story text catches the rest.
            return [r.spine.identityLabel, r.spine.placeLine, r.spine.partiesLine,
                    r.spine.quantumLine, r.doc.docType, r.doc.headline,
                    r.doc.regYear, r.doc.sro, r.doc.plotNo, r.doc.summary]
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
            // with Sy 1 — the almirah shelf, not the FMB sheet. The key is
            // NORMALISED (case, spacing, leading zeros) so "Mangala Kunta"
            // and "mangalakunta", Sy 01 and Sy 1, are one shelf shown by the
            // first spelling seen. A multi-survey paper shelves under its
            // first survey; its full list stays on the row and the page.
            var display: [String: String] = [:]
            var buckets: [String: [VaultRow]] = [:]
            for r in shown {
                let v = r.spine.village.trimmingCharacters(in: .whitespaces)
                var base = r.spine.surveys.first.map { surveyParts($0).no } ?? ""
                while base.count > 1, base.hasPrefix("0") { base.removeFirst() }
                let key: String
                if v.isEmpty {
                    key = ""
                    if display[key] == nil { display[key] = "No place named" }
                } else {
                    key = v.lowercased().filter { !$0.isWhitespace } + "|" + base.lowercased()
                    if display[key] == nil {
                        display[key] = base.isEmpty ? v : "\(v) · Sy \(base)"
                    }
                }
                buckets[key, default: []].append(r)
            }
            return buckets.keys.sorted { a, b in
                if a.isEmpty { return false }
                if b.isEmpty { return true }
                return display[a]! < display[b]!
            }.map { (display[$0]!, buckets[$0]!) }
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
            // A filter whose chip vanished with this reload (the last
            // needs-review paper settled, the last map deleted) must not
            // stay stuck invisibly emptying the list.
            if filter != "all", !filterChips.contains(where: { $0.key == filter }) {
                filter = "all"
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
    /// The six-slot spine, computed once alongside the reading.
    @State private var parsedSpine: DocSpine?
    /// The summary in the language of the source. One tap, both ways.
    @State private var showTelugu = false
    /// The review card, folded by default — one line loud, the rest on tap.
    @State private var showReview = false
    /// The page the full-screen scan opens on, when one was tapped.
    @State private var openAtPage: PageSelection?

    struct PageSelection: Identifiable { let id: Int }

    private var reading: DocReading {
        if let parsedReading { return parsedReading }
        return DocReading(json: doc.reading)
    }

    private var spine: DocSpine {
        if let parsedSpine { return parsedSpine }
        return computedSpine
    }

    private var computedSpine: DocSpine {
        docSpine(docType: doc.docType, documentNo: doc.documentNo,
                 regYear: doc.regYear, village: doc.village,
                 surveyNo: doc.surveyNo, extent: doc.extent,
                 consideration: doc.consideration, reading: rawReading)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // The paper itself, named once: the chip owns the kind, the
                // serif headline owns the identity, one subline carries where
                // and when. Nothing on this card repeats — the old header
                // said "Sale Deed" three times.
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Text((doc.docType.isEmpty ? "Document" : doc.docType).uppercased())
                            .font(.system(size: 10.5, weight: .semibold)).kerning(0.8)
                            .padding(.horizontal, 9).padding(.vertical, 4)
                            .background(familyTintColor(spine.family).opacity(0.16), in: Capsule())
                            .foregroundStyle(familyTintColor(spine.family))
                        if !reading.language.isEmpty {
                            Text(reading.language)
                                .font(.caption).foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Text(headerTitle)
                        .font(.system(size: 30, weight: .semibold, design: .serif))
                    if !registeredLine.isEmpty {
                        Text(registeredLine).font(.subheadline).foregroundStyle(.secondary)
                    }
                    if !metaLine.isEmpty {
                        Text(metaLine).font(.caption).foregroundStyle(.tertiary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                // The spine, made visible: ONE box, hairline-divided — the
                // template's grid, not four floating cards. What the reader
                // could not fill is NOT a tile; its absence sits in the
                // review card instead of rendering blank.
                if !spineTiles.isEmpty {
                    let cells = spineTiles.count.isMultiple(of: 2)
                        ? spineTiles : spineTiles + [(k: "", v: "", n: "")]
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 1),
                                        GridItem(.flexible(), spacing: 1)],
                              spacing: 1) {
                        ForEach(Array(cells.enumerated()), id: \.offset) { _, tile in
                            VStack(alignment: .leading, spacing: 4) {
                                if !tile.k.isEmpty {
                                    Text(tile.k.uppercased())
                                        .font(.system(size: 10, weight: .bold)).kerning(0.7)
                                        .foregroundStyle(.secondary)
                                    Text(tile.v)
                                        .font(.system(size: 17, weight: .semibold))
                                        .lineLimit(2).minimumScaleFactor(0.75)
                                    if !tile.n.isEmpty {
                                        Text(tile.n)
                                            .font(.caption).foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
                            .padding(13)
                            .background(Color(.secondarySystemGroupedBackground))
                        }
                    }
                    .background(Color(.separator).opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }

                // A paper filed before deep reading degrades QUIETLY — grey
                // information, never amber alarm. Amber keeps its meaning.
                if doc.reading.isEmpty {
                    HStack(spacing: 11) {
                        Image(systemName: "arrow.clockwise.circle")
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Filed before deep reading")
                                .font(.subheadline.weight(.semibold))
                            Text("Pages, checks and the paper trail arrive when a fresh scan is read.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(13)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                // ONE review card. The caveat prose, the watch-out line and
                // the "read by the agent" caption all collapse into it —
                // itemised, severity-ordered, placed on its page.
                if !spine.review.isEmpty { reviewCard }

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

                // The paper trail this deed itself cites — honest about its
                // source: the deed's own words, not asserted links. Reader
                // links[] upgrade these cards the day they exist.
                if !railCards.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("PAPER TRAIL")
                            .font(.caption.weight(.medium)).kerning(1.1)
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 9) {
                                ForEach(railCards, id: \.title) { card in
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(card.role.uppercased())
                                            .font(.system(size: 9.5, weight: .bold)).kerning(0.6)
                                            .foregroundStyle(card.missing
                                                             ? Color.orange
                                                             : familyTintColor(spine.family))
                                        Text(card.title)
                                            .font(.system(size: 13.5, weight: .semibold))
                                            .lineLimit(2)
                                        if !card.meta.isEmpty {
                                            Text(card.meta)
                                                .font(.caption2).foregroundStyle(.secondary)
                                        }
                                    }
                                    .frame(width: 150, alignment: .topLeading)
                                    .padding(11)
                                    .background(card.missing
                                                ? Color.orange.opacity(0.05)
                                                : Color(.secondarySystemGroupedBackground),
                                                in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous)
                                        .strokeBorder(card.missing ? Color.orange.opacity(0.5) : .clear,
                                                      style: StrokeStyle(lineWidth: 1,
                                                                         dash: card.missing ? [4, 3] : [])))
                                }
                            }
                        }
                    }
                }

                // In plain words — the story, then the key facts, in either
                // language. Paragraphs stay paragraphs. The warnings left for
                // the review card; settled and unsettled are different facts.
                if !paragraphs.isEmpty || !reading.summaryTe.isEmpty || !doc.keyPointList.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("In plain words").font(.headline)
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
                        if !doc.keyPointList.isEmpty {
                            if !shownParagraphs.isEmpty { Divider() }
                            ForEach(doc.keyPointList, id: \.self) { point in
                                HStack(alignment: .top, spacing: 8) {
                                    Text("•").foregroundStyle(.tint)
                                    Text(point).font(.subheadline)
                                }
                            }
                        }
                    }
                    .padding(16)
                    .background(Color(.secondarySystemGroupedBackground),
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

                // Page 2 of 2: every field, its page, its flags, the file
                // map. Page 1 answers; that page proves.
                NavigationLink {
                    DocumentAllDetailsScreen(doc: doc, reading: reading, spine: spine)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("All the details")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.primary)
                            Text(detailsMeta)
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 12)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                    }
                    .padding(14)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)

                if !problem.isEmpty { Text(problem).foregroundStyle(.red).font(.callout) }
            }
            .padding()
        }
        // The last card must clear the floating tab bar when fully scrolled.
        .contentMargins(.bottom, 28, for: .scrollContent)
        .navigationTitle(doc.docType.isEmpty ? "Document" : doc.docType)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // The destructive action leaves the scroll flow entirely.
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label("Delete this document", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
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
        .onAppear {
            if parsedReading == nil { parsedReading = DocReading(json: doc.reading) }
            if parsedSpine == nil { parsedSpine = computedSpine }
        }
    }

    /// At most four tiles, absent slots omitted — the grid reflows to what
    /// is actually known.
    private var spineTiles: [(k: String, v: String, n: String)] {
        var tiles: [(k: String, v: String, n: String)] = []
        if !spine.identityLabel.isEmpty {
            tiles.append((identitySlotName, spine.identityLabel, doc.sro))
        }
        let placeNote = [doc.village, doc.mandal].filter { !$0.isEmpty }.joined(separator: ", ")
        if !spine.surveys.isEmpty {
            tiles.append(("Property", "Sy " + spine.surveys.joined(separator: ", "), placeNote))
        } else if !doc.village.isEmpty {
            tiles.append(("Property", doc.village, doc.mandal))
        }
        if !doc.extent.isEmpty { tiles.append(("Extent", doc.extent, "")) }
        if doc.consideration > 0 { tiles.append(("Consideration", rupees(doc.consideration), "")) }
        if tiles.count < 4, !spine.partiesLine.isEmpty {
            tiles.append((spine.partiesLine.contains("→") ? "From → To" : "Holder",
                          spine.partiesLine, ""))
        }
        return Array(tiles.prefix(4))
    }

    /// What the identity slot is CALLED depends on who issued it.
    private var identitySlotName: String {
        switch spine.family {
        case "revenue": "Account"
        case "map": "Sheet / survey"
        case "identity": "Number"
        case "search": "Certificate"
        case "old_record": "Record"
        default: "Document no."
        }
    }

    /// The one amber card: itemised, severity-dotted, placed on its page.
    private var reviewCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.snappy) { showReview.toggle() } } label: {
                HStack(spacing: 10) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.orange)
                    Text(spine.review.count == 1
                         ? "1 thing needs you"
                         : "\(spine.review.count) things need you")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(.orange)
                    Spacer(minLength: 0)
                    Text(showReview ? "Hide" : "Show")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange.opacity(0.75))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if showReview {
                VStack(alignment: .leading, spacing: 11) {
                    ForEach(spine.review) { item in
                        HStack(alignment: .top, spacing: 9) {
                            Circle()
                                .fill(item.severity == "high" ? Color.red : Color.orange)
                                .frame(width: 6, height: 6)
                                .padding(.top, 6)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.text).font(.subheadline)
                                    .fixedSize(horizontal: false, vertical: true)
                                // Items promoted from legacy prose have no
                                // page — the sentence renders alone, never a
                                // dead chip or a "page 0".
                                if item.page > 0, LocalFiles.url(for: doc.id) != nil {
                                    Button {
                                        openAtPage = PageSelection(id: item.page - 1)
                                    } label: {
                                        Label("page \(item.page)", systemImage: "doc.text.magnifyingglass")
                                            .font(.caption.weight(.semibold))
                                            .padding(.horizontal, 8).padding(.vertical, 4)
                                            .background(Color.accentColor.opacity(0.12), in: Capsule())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    // The reminder belongs to the items it snoozes.
                    Button { remind() } label: {
                        Label(reminded ? "Reminder set" : "Remind me in 7 days",
                              systemImage: reminded ? "checkmark" : "bell.badge")
                            .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.orange)
                    .disabled(reminded)
                }
                .padding(.top, 12)
            }
        }
        .padding(13)
        .background(Color.orange.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Color.orange.opacity(0.22), lineWidth: 1))
    }

    /// v1 of the rail: reader-emitted links[] when they exist, else the prior
    /// document this deed cites in its own recitals.
    private var railCards: [(role: String, title: String, meta: String, missing: Bool)] {
        var out: [(role: String, title: String, meta: String, missing: Bool)] = []
        if let links = rawReading["links"] as? [[String: Any]], !links.isEmpty {
            for link in links {
                let cited = ((link["cited_as"] as? String) ?? "").trimmingCharacters(in: .whitespaces)
                guard !cited.isEmpty else { continue }
                let role = (link["role"] as? String) ?? "linked"
                let missing = role == "referenced_missing" || link["to"] == nil || link["to"] is NSNull
                out.append((missing ? "Missing" : humanize(role.replacingOccurrences(of: "_", with: " ")),
                            cited, missing ? "Cited, not filed" : "", missing))
            }
        } else if let pd = rawReading["prior_document_details"] as? [String: Any] {
            let number = ((pd["number"] as? String) ?? "").trimmingCharacters(in: .whitespaces)
            if !number.isEmpty {
                let meta = [(pd["office"] as? String) ?? "",
                            humanDate((pd["registration_date"] as? String) ?? "")]
                    .filter { !$0.isEmpty }.joined(separator: " · ")
                out.append(("Prior title", "Document \(number)",
                            meta.isEmpty ? "Cited by this deed" : meta, false))
            }
        }
        return out
    }

    private var detailsMeta: String {
        var parts: [String] = []
        if !reading.fieldPages.isEmpty { parts.append("\(reading.fieldPages.count) fields read") }
        if !spine.review.isEmpty { parts.append("\(spine.review.count) need you") }
        if reading.totalPages > 0 { parts.append("\(reading.totalPages) pages") }
        return parts.isEmpty ? "Every field, its page, its flags" : parts.joined(separator: " · ")
    }

    /// "Sale deed · 2815 / 2020" — kind, number, year, the registrar's own way
    /// of naming it. Falls back to the kind alone for papers with no number.
    private var headerTitle: String {
        let kind = doc.docType.isEmpty ? documentKind(doc.docType).label : doc.docType
        // displayIdentity: a documentNo that IS an Aadhaar/PAN renders masked
        // here too — the details rows are the one reveal surface.
        let number = [displayIdentity(doc.documentNo), doc.regYear]
            .filter { !$0.isEmpty }.joined(separator: " / ")
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

    /// Where and when, ONCE: "Registered 7 March 2024 · Podili · 14 pages".
    /// The old header said "Registered … Podili" twice in consecutive lines.
    private var registeredLine: String {
        var parts: [String] = []
        if !doc.registrationDate.isEmpty {
            parts.append("Registered \(humanDate(doc.registrationDate))")
        } else if !doc.regYear.isEmpty {
            parts.append("Registered \(doc.regYear)")
        }
        if !doc.sro.isEmpty { parts.append(doc.sro) }
        if reading.totalPages > 0 { parts.append("\(reading.totalPages) pages") }
        return parts.joined(separator: " · ")
    }

    /// Size · filed — the file's own facts, one quiet line, nothing the
    /// subline already said.
    private var metaLine: String {
        var parts: [String] = []
        if let url = LocalFiles.url(for: doc.id),
           let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? Int {
            parts.append(ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file))
        }
        if !doc.createdAt.isEmpty { parts.append("filed \(relativeTime(doc.createdAt))") }
        return parts.joined(separator: " · ")
    }

    /// The summary in whichever language is switched on.
    private var shownParagraphs: [String] {
        let text = showTelugu && !reading.summaryTe.isEmpty ? reading.summaryTe : doc.summary
        return text.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
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
            let passbook = h.passbooks.first { $0.id == p.passbookId }
            let name = "Sy \(p.surveyNo)"
            out.append((name,
                        [areaText(p.extent, .acre), passbook?.village ?? ""]
                            .filter { !$0.isEmpty && $0 != name }.joined(separator: " · ")))
        }
        for p in h.properties where p.id == doc.propertyId {
            let name = p.label.isEmpty ? p.city : p.label
            // The card must not say the place twice — "Mangalakunta ·
            // 25 Acres · Mangalakunta" named nothing the title had not.
            out.append((name,
                        [propertyAreaText(landArea: p.landArea, landUnit: p.landUnit), p.city]
                            .filter { !$0.isEmpty && $0 != name }.joined(separator: " · ")))
        }
        return out
    }

    /// A local notification a week out, so a review item about somebody's
    /// land does not depend on them remembering to come back to this screen.
    private func remind() {
        let content = UNMutableNotificationContent()
        content.title = "Check \(doc.docType.isEmpty ? "a document" : doc.docType)"
        content.body = spine.review.first?.text ?? "Worth checking against the paper."
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
