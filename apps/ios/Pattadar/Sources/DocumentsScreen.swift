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
    /// Picking several papers at once, to send them somewhere as one file.
    @State private var selection = Set<String>()
    @State private var editMode: EditMode = .inactive
    /// The archive being built, then the one waiting to be shared.
    @State private var archiving = false
    @State private var archive: URL?
    @State private var archiveProblem = ""
    /// Papers filed with no reading — layer 1 of the vault. They have no spine
    /// to group by, so they get their own shelf rather than being forced into
    /// a grouping built out of things nobody has read.
    @State private var unread: [VaultFile] = []

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
            List(selection: $selection) {
                if landing {
                    // The M07 landing: what the vault promises, said once.
                    Section {
                        encryptedBanner
                            .listRowInsets(EdgeInsets(top: Space.sm, leading: Space.xl,
                                                      bottom: Space.hair, trailing: Space.xl))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                }
                if !landing {
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
                    .listRowInsets(EdgeInsets(top: Space.sm, leading: Space.lg, bottom: Space.hair, trailing: Space.lg))
                    .listRowBackground(Color.clear)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Space.sm) {
                            ForEach(filterChips, id: \.key) { chip in
                                filterChipView(chip)
                            }
                        }
                        .padding(.vertical, Space.hair)
                    }
                    .listRowInsets(EdgeInsets(top: Space.hair, leading: Space.lg, bottom: Space.sm, trailing: Space.lg))
                    .listRowBackground(Color.clear)
                }
                }

                // ONE amber banner, and only when something is genuinely
                // unsettled. Tapping it applies the review filter — the
                // banner is the filter, offered.
                if filter != "review", needsYou.things > 0 {
                    Section {
                        Button {
                            withAnimation(Motion.standard()) { filter = "review" }
                        } label: { reviewBanner }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: Space.hair, leading: Space.lg, bottom: Space.hair, trailing: Space.lg))
                        .listRowBackground(Color.clear)
                    }
                }

                // Filings the server has not confirmed yet. Undramatic on
                // purpose: a queued write is a success from the person's
                // point of view — the paper is filed, the sync is plumbing.
                if !SyncEngine.shared.pendingFilings.isEmpty {
                    Section("Waiting to sync") {
                        ForEach(SyncEngine.shared.pendingFilings) { entry in
                            pendingRow(entry)
                        }
                    }
                }

                // Filed, not read. Undramatic: keeping a paper without paying
                // to have it read is an ordinary thing to want, so this reads
                // as a shelf rather than a warning.
                if !unreadShown.isEmpty {
                    Section {
                        ForEach(unreadShown) { file in
                            unreadRow(file)
                        }
                    } header: {
                        HStack(alignment: .firstTextBaseline) {
                            Text("Not read yet")
                            Spacer()
                            Text(unreadShown.count == 1
                                 ? "1 file" : "\(unreadShown.count) files")
                        }
                    }
                }

                if landing, !shelves.isEmpty {
                    // The eight shelves (M07): the vault answered as an index
                    // rather than a hundred rows. A shelf opens its family;
                    // the chips take over from there.
                    Section {
                        shelfGrid
                            .listRowInsets(EdgeInsets(top: Space.hair, leading: Space.xl,
                                                      bottom: Space.sm, trailing: Space.xl))
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    } header: {
                        Text("\(rows.count + unread.count) papers · encrypted at rest")
                    }
                } else if !landing {
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
                }
                if loaded && rows.isEmpty && unread.isEmpty && SyncEngine.shared.pendingFilings.isEmpty {
                    ContentUnavailableView("No documents yet", systemImage: "doc.text",
                                           description: Text("Scan a deed and its details are read for you — or just add a file and keep it as it is."))
                } else if loaded && !(rows.isEmpty && unread.isEmpty) && shown.isEmpty && unreadShown.isEmpty {
                    ContentUnavailableView("Nothing matches", systemImage: "magnifyingglass",
                                           description: Text("Try the survey number, the khata, a name, or the year."))
                }
            }
            .navigationTitle("Papers")
            .searchable(text: $query, prompt: "Sy. 128/1A · Khata 397 · a name · 2016…")
            .environment(\.editMode, $editMode)
            .toolbar {
                // Picking several papers to send at once. Off the critical
                // path: the button is quiet until it is used.
                ToolbarItem(placement: .topBarLeading) {
                    Button(editMode.isEditing ? "Done" : "Select") {
                        withAnimation(Motion.standard()) {
                            editMode = editMode.isEditing ? .inactive : .active
                            if !editMode.isEditing { selection.removeAll() }
                        }
                    }
                    .disabled(rows.isEmpty)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if editMode.isEditing {
                        // The count is the useful number while selecting.
                        Text(selection.isEmpty ? "None selected"
                             : "\(selection.count) selected")
                            .font(.subheadline).foregroundStyle(.secondary)
                    } else {
                        // A mirror, not a mystery: the pill follows the filter.
                        Text(filter == "all" && query.isEmpty
                             ? "\(rows.count + unread.count) filed"
                             : "\(shown.count + unreadShown.count) shown")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    if editMode.isEditing {
                        Button {
                            Task { await shareSelected() }
                        } label: {
                            if archiving {
                                ProgressView()
                            } else {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                        }
                        .disabled(selection.isEmpty || archiving)
                    } else {
                        Button { showAdd = true } label: { Label("Add", systemImage: "plus") }
                    }
                }
            }
            // Several documents leave as ONE file. Six trips through the share
            // sheet is six chances to send the wrong one, and the person on the
            // other end cannot tell what arrived together.
            .sheet(item: Binding(get: { archive.map(SharedArchive.init) },
                                 set: { if $0 == nil { archive = nil } })) { item in
                ShareSheet(url: item.url)
            }
            .alert("Couldn’t share those", isPresented: Binding(
                get: { !archiveProblem.isEmpty },
                set: { if !$0 { archiveProblem = "" } })) {
                Button("OK", role: .cancel) { archiveProblem = "" }
            } message: {
                Text(archiveProblem)
            }
            .sheet(isPresented: $showAdd) {
                AddDocumentSheet { Task { await load() } }
            }
            .refreshable {
                SyncEngine.shared.kick(.userPull)
                await load()
            }
            // One task, keyed: runs on appearance like a plain .task, and
            // again whenever a filing lands so its "waiting" row becomes a
            // real one. A second plain .task would double every load.
            .task(id: SyncEngine.shared.drainedTick) { await load() }
        }
    }

    /// A built archive, waiting to be shared. Identifiable so the sheet can be
    /// driven by its presence rather than a second boolean.
    private struct SharedArchive: Identifiable {
        let url: URL
        var id: String { url.path }
    }

    /// Zip what is selected and hand it to the share sheet.
    ///
    /// Documents with no file stored on this phone are skipped rather than
    /// failing the whole archive — "details only, no file" is a real state,
    /// and one of them must not cost the person the other five.
    private func shareSelected() async {
        archiving = true
        defer { archiving = false }
        let picked = rows.filter { selection.contains($0.id) }
        let files: [(name: String, url: URL)] = picked.compactMap { r in
            guard let url = LocalFiles.url(for: r.doc.id) else { return nil }
            let name = shareFileName(
                docType: r.doc.docType, village: r.doc.village,
                date: [r.doc.registrationDate, r.doc.regYear, r.doc.createdAt]
                    .first { !$0.isEmpty } ?? "",
                fallbackExtension: url.pathExtension)
            return (name, url)
        }
        // One document is that document, not an archive containing it.
        if files.count == 1 {
            archive = files[0].url
            return
        }
        do {
            archive = try VaultArchive.zip(files)
        } catch {
            archiveProblem = error.localizedDescription
        }
    }

    /// The unread files the current filter and search let through. They carry
    /// no spine, so only the fields they actually have are searched.
    private var unreadShown: [VaultFile] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return unread.filter { f in
            // "Needs review" is a statement about a READING; a file with none
            // cannot be on that shelf.
            switch filter {
            case "all": break
            case "review": return false
            default: if f.family != filter { return false }
            }
            return q.isEmpty || f.name.lowercased().contains(q)
        }
    }

    @ViewBuilder private func unreadRow(_ file: VaultFile) -> some View {
        HStack(spacing: Space.md) {
            DocumentIcon(docType: file.docType, size: 34)
            VStack(alignment: .leading, spacing: Space.xs) {
                Text(file.name).lineLimit(1)
                // Size and when it arrived — the only honest facts about a
                // paper nothing has read.
                Text([file.sizeText, relativeTime(file.createdAt)]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Pending filings

    @ViewBuilder private func pendingRow(_ entry: WriteQueue.Entry) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: entry.needsReview
                  ? "exclamationmark.triangle" : "arrow.triangle.2.circlepath")
                .foregroundStyle(entry.needsReview ? Palette.caution : .secondary)
            VStack(alignment: .leading, spacing: Space.hair) {
                Text(entry.displayName).lineLimit(1)
                if entry.needsReview {
                    // The server said no; retrying is not the answer. Say so.
                    Text(entry.lastError ?? "The server refused this filing.")
                        .font(.caption).foregroundStyle(Palette.caution).lineLimit(2)
                } else {
                    Text("Will sync when the server is reachable")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .swipeActions(edge: .trailing) {
            // Every waiting entry can be given up on, not just parked ones —
            // a person must never be trapped watching a retry loop they
            // cannot end.
            Button(role: .destructive) {
                SyncEngine.shared.discard(entry.id)
            } label: { Label("Discard", systemImage: "trash") }
        }
    }

    // MARK: - Row

    @ViewBuilder private func rowView(_ r: VaultRow) -> some View {
        let hasFile = LocalFiles.url(for: r.doc.id) != nil
        HStack(spacing: Space.md) {
            VaultTile(docType: r.doc.docType, family: r.spine.family,
                      year: r.year, hasFile: hasFile)
            VStack(alignment: .leading, spacing: Space.xs) {
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
                    .font(.scaled(11, weight: .bold)).monospacedDigit()
                    .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                    .background(Palette.caution.opacity(0.15), in: Capsule())
                    .foregroundStyle(Palette.caution)
            }
        }
    }

    /// Type + identity — "Sale Deed · 6337 / 2024", "ROR/Adangal · Khata 567"
    /// — the registrar's own way of naming a paper. A record with no number
    /// at all is titled by its headline, never by its bare kind.
    private func primaryLine(_ r: VaultRow) -> String {
        let type = r.doc.docType.isEmpty ? documentKind(r.doc.docType).label : r.doc.docType
        // An identity card is known by its PERSON — "Aadhaar · Ravi
        // Rathamma"; the masked number demotes to the second line.
        if r.spine.family == "identity", !r.spine.primaryPerson.isEmpty {
            return "\(type) · \(r.spine.primaryPerson)"
        }
        if !r.spine.identityLabel.isEmpty { return "\(type) · \(r.spine.identityLabel)" }
        if !r.doc.headline.isEmpty { return maskSensitiveText(r.doc.headline) }
        return type
    }

    /// The header never repeats inside its own rows: under a place heading
    /// the place is dropped; under a person heading the parties are. The
    /// suppressed slot returns the moment the heading stops naming it.
    private func secondaryLine(_ r: VaultRow) -> String {
        let s = r.spine
        // Identity papers: masked number + DOB, whatever the grouping — the
        // address village is where the person lives, not where land is.
        if s.family == "identity" {
            return [s.identityLabel, s.quantumLine].filter { !$0.isEmpty }.joined(separator: " · ")
        }
        // A map sheet: subdivisions when the reading names them, then the
        // mapped extent. The title already says the survey, so outside
        // property grouping the place slot carries only the village.
        if s.family == "map" {
            let subs = s.surveys.filter { !surveyParts($0).sub.isEmpty }.count
            let parts: [String] = switch groupBy {
            case .property: [subs > 1 ? "\(subs) subdivisions" : "", s.quantumLine]
            default: [s.village, s.quantumLine]
            }
            return parts.filter { !$0.isEmpty }.joined(separator: " · ")
        }
        let parts: [String] = switch groupBy {
        case .property: [s.quantumLine, s.partiesLine]
        case .person: [s.placeLine, s.quantumLine]
        case .type, .recent: [s.placeLine, s.quantumLine]
        }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    // MARK: - The M07 landing

    /// True when nothing narrows the vault: no filter, no search, no
    /// selection under way. That is when the shelves answer instead of rows.
    private var landing: Bool {
        filter == "all" && query.trimmingCharacters(in: .whitespaces).isEmpty
            && !editMode.isEditing
    }

    /// The vault's promise, in the words that are actually true of it.
    private var encryptedBanner: some View {
        HStack(alignment: .top, spacing: Space.sm) {
            Image(systemName: "checkmark.shield")
                .foregroundStyle(Palette.success)
            Text("Stored encrypted in Mumbai (ap-south-1). Identity papers stay masked until Face ID.")
                .font(.note).foregroundStyle(Palette.success)
        }
        .padding(Space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.success.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
    }

    /// The families that actually hold papers, as 2-up shelf cards, each
    /// wearing its spine colour on the left edge — the packages/core eight.
    private var shelfGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: Space.md),
                            GridItem(.flexible(), spacing: Space.md)],
                  spacing: Space.md) {
            ForEach(shelves, id: \.key) { shelf in
                Button {
                    withAnimation(Motion.standard()) { filter = shelf.key }
                } label: {
                    shelfCard(shelf.key, count: shelf.count)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var shelves: [(key: String, count: Int)] {
        documentFamilies.compactMap { f in
            let count = rows.filter { $0.spine.family == f }.count
            return count > 0 ? (f, count) : nil
        }
    }

    private func shelfCard(_ family: String, count: Int) -> some View {
        HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 1.5)
                .fill(familyTintColor(family))
                .frame(width: 3)
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack {
                    Image(systemName: Self.familySymbol(family))
                        .font(.scaled(17))
                        .foregroundStyle(familyTintColor(family))
                    Spacer()
                    Text("\(count)")
                        .font(.callout.weight(.medium)).monospacedDigit()
                }
                VStack(alignment: .leading, spacing: Space.hair) {
                    Text(familyLabel(family))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    Text(Self.familyBlurb(family))
                        .font(.note).foregroundStyle(.secondary)
                        .lineLimit(2, reservesSpace: true)
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(Space.md)
        }
        .background(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .fill(Color(.secondarySystemGroupedBackground)))
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(familyLabel(family)), \(count) papers")
    }

    private static func familySymbol(_ family: String) -> String {
        switch family {
        case "title": "doc.text"
        case "revenue": "text.book.closed"
        case "map": "map"
        case "identity": "person.text.rectangle"
        case "search": "doc.text.magnifyingglass"
        case "old_record": "scroll"
        case "photo": "photo.on.rectangle"
        default: "questionmark.folder"
        }
    }

    private static func familyBlurb(_ family: String) -> String {
        switch family {
        case "title": "Deeds, wills, agreements"
        case "revenue": "Passbooks, ROR, mutations"
        case "map": "FMB, tippons, sketches"
        case "identity": "Masked until you unlock"
        case "search": "ECs, receipts, challans"
        case "old_record": "Sethwar, khasra"
        case "photo": "Of the land itself"
        default: "Nothing recognised it"
        }
    }

    // MARK: - Filter chips & banner

    /// Only the families actually in this vault get chips — a chip that can
    /// only ever say "Nothing matches" is furniture.
    private var filterChips: [(key: String, label: String, tint: Color?)] {
        var chips: [(key: String, label: String, tint: Color?)] = [("all", "All", nil)]
        if rows.contains(where: { !$0.spine.actionable.isEmpty }) {
            chips.append(("review", "Needs review", Palette.caution))
        }
        chips += documentFamilies
            .filter { f in rows.contains { $0.spine.family == f } }
            .map { ($0, familyLabel($0), familyTintColor($0)) }
        return chips
    }

    @ViewBuilder private func filterChipView(_ chip: (key: String, label: String, tint: Color?)) -> some View {
        let active = filter == chip.key
        let tint = chip.tint ?? Color.accentColor
        Button { withAnimation(Motion.standard()) { filter = chip.key } } label: {
            HStack(spacing: Space.sm) {
                if let dot = chip.tint {
                    Circle().fill(dot).frame(width: 6, height: 6)
                }
                Text(chip.label)
                    .font(.subheadline.weight(active ? .semibold : .regular))
            }
            .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
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
        HStack(spacing: Space.md) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(Palette.caution)
            VStack(alignment: .leading, spacing: Space.hair) {
                Text(bannerHead)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.caution)
                Text("Tap to see only those papers")
                    .font(.caption).foregroundStyle(Palette.caution.opacity(0.7))
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold)).foregroundStyle(Palette.caution.opacity(0.6))
        }
        .padding(Space.md)
        .background(Palette.caution.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .stroke(Palette.caution.opacity(0.22), lineWidth: 1))
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
                if r.spine.family == "identity" {
                    // An Aadhaar's village is an ADDRESS. Identity papers get
                    // their own shelf instead of posing as a holding's.
                    key = "person·identity"
                    if display[key] == nil { display[key] = "Personal & identity" }
                } else if v.isEmpty {
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
            let by = Dictionary(grouping: shown) { $0.spine.family }
            return documentFamilies.compactMap { f in by[f].map { (familyLabel(f), $0) } }
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

    /// The year a person recognises the document by. A map sheet is the
    /// exception: its vintage is the survey era, and the FILING year would
    /// misstate it — an FMB tile saying "2026" claims a sheet that new.
    /// Better an empty line than a wrong one.
    private func rowYear(_ d: RegisteredDocument, spine: DocSpine,
                         reading: [String: Any]) -> String {
        if spine.family == "map" {
            let text = [d.docType, d.headline,
                        reading["layout_name"] as? String ?? "",
                        reading["classification"] as? String ?? ""]
                .joined(separator: " ").lowercased()
            if text.contains("re-survey") || text.contains("resurvey") { return "Re-survey" }
            if !d.regYear.isEmpty { return d.regYear }
            return year(from: d.registrationDate) ?? ""
        }
        if !d.regYear.isEmpty { return d.regYear }
        if let y = year(from: d.registrationDate) { return y }
        return year(from: d.createdAt) ?? ""
    }

    private func load() async {
        if let r = await app.load(Queries.documents, as: DocumentsResponse.self) {
            // A file with a reading is shown by its reading; this shelf is for
            // the ones nothing has looked at.
            unread = (r.documents ?? []).filter { $0.readingId.isEmpty }
            rows = r.registeredDocuments.map { d in
                let reading = (try? JSONSerialization.jsonObject(
                    with: Data(d.reading.utf8))) as? [String: Any] ?? [:]
                let spine = docSpine(docType: d.docType, documentNo: d.documentNo,
                                     regYear: d.regYear, village: d.village,
                                     surveyNo: d.surveyNo, extent: d.extent,
                                     consideration: d.consideration, reading: reading)
                return VaultRow(doc: d, spine: spine,
                                year: rowYear(d, spine: spine, reading: reading))
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
    /// The FMB's measurable shape, when the sheet gave one up.
    @State private var parsedGeometry: FMBGeometry?
    /// The summary in the language of the source. One tap, both ways.
    @State private var showTelugu = false
    /// The review card, folded by default — one line loud, the rest on tap.
    @State private var showReview = false
    /// The identity tile's number while revealed — read off the local scan,
    /// re-masked a minute later.
    @State private var revealedTileNumber: String?
    @State private var revealedTileStamp: Date?
    /// A temp copy of the file under its OUTGOING name, for the title-bar
    /// share — the stored UUID never travels.
    @State private var sharedCopy: URL?
    /// The page the full-screen scan opens on, when one was tapped.
    @State private var openAtPage: PageSelection?
    /// Renaming: the name being typed, and whether it is going to the server.
    @State private var renaming = false
    @State private var newName = ""
    @State private var renamingBusy = false

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
            VStack(alignment: .leading, spacing: Space.lg) {
                // The paper itself, named once: the chip owns the kind, the
                // serif headline owns the identity, one subline carries where
                // and when. Nothing on this card repeats — the old header
                // said "Sale Deed" three times.
                // The M44 dark hero: a paper's head is a printed record and
                // wears the record surface in both appearances. Chips go
                // glass — the family tints resolve per-appearance and cannot
                // be trusted on a surface that is always dark.
                VStack(alignment: .leading, spacing: Space.md) {
                    if let g = parsedGeometry, spine.family == "map" {
                        // A georeferenced sheet says so up front — the
                        // founder's frame, word for word.
                        HStack(spacing: Space.sm) {
                            Image(systemName: "map")
                                .font(.scaled(13))
                                .foregroundStyle(Palette.inkSoftOnRecord)
                            Text("FMB · GEOREFERENCED")
                                .font(.scaled(10.5, weight: .semibold)).kerning(0.8)
                                .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                                .background(Palette.ruleOnRecord, in: Capsule())
                                .foregroundStyle(Palette.inkOnRecord)
                            Text("\(g.points.count) corners · WGS 84"
                                 + (g.utmZoneLabel.map { " · \($0)" } ?? ""))
                                .font(.caption).foregroundStyle(Palette.inkSoftOnRecord)
                                .lineLimit(1)
                        }
                        Text(fmbHeadline)
                            .font(.scaled(30, weight: .semibold, design: .serif))
                            .foregroundStyle(Palette.inkOnRecord)
                        if !fmbSubline.isEmpty {
                            Text(fmbSubline).font(.subheadline)
                                .foregroundStyle(Palette.inkSoftOnRecord)
                        }
                    } else {
                        HStack(spacing: Space.sm) {
                            Image(systemName: documentKind(doc.docType).icon)
                                .font(.scaled(13))
                                .foregroundStyle(Palette.inkSoftOnRecord)
                            Text((doc.docType.isEmpty ? "Document" : doc.docType).uppercased())
                                .font(.scaled(10.5, weight: .semibold)).kerning(0.8)
                                .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                                .background(Palette.ruleOnRecord, in: Capsule())
                                .foregroundStyle(Palette.inkOnRecord)
                            if !reading.language.isEmpty {
                                Text(reading.language)
                                    .font(.caption).foregroundStyle(Palette.inkSoftOnRecord)
                                    .lineLimit(1)
                            }
                        }
                        Text(headerTitle)
                            .font(.scaled(30, weight: .semibold, design: .serif))
                            .foregroundStyle(Palette.inkOnRecord)
                        if !registeredLine.isEmpty {
                            Text(registeredLine).font(.subheadline)
                                .foregroundStyle(Palette.inkSoftOnRecord)
                        }
                        if !metaLine.isEmpty {
                            Text(metaLine).font(.caption)
                                .foregroundStyle(Palette.inkSoftOnRecord.opacity(0.8))
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Space.xl)
                .background(LinearGradient(colors: [Palette.record, Palette.recordDeep],
                                           startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))

                // The spine, made visible: ONE box, hairline-divided — the
                // template's grid, not four floating cards. What the reader
                // could not fill is NOT a tile; its absence sits in the
                // review card instead of rendering blank. A georeferenced
                // FMB carries its facts in the map screens instead.
                if !spineTiles.isEmpty, !(spine.family == "map" && parsedGeometry != nil) {
                    let cells = spineTiles.count.isMultiple(of: 2)
                        ? spineTiles : spineTiles + [(k: "", v: "", n: "")]
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: Space.hair),
                                        GridItem(.flexible(), spacing: Space.hair)],
                              spacing: Space.hair) {
                        ForEach(Array(cells.enumerated()), id: \.offset) { _, tile in
                            let revealable = !tile.k.isEmpty && tile.k == identityNumberTileKey
                            Button {
                                if revealable { toggleTileReveal() }
                            } label: {
                                VStack(alignment: .leading, spacing: Space.xs) {
                                    if !tile.k.isEmpty {
                                        HStack(alignment: .top, spacing: Space.sm) {
                                            Text(tile.k.uppercased())
                                                .font(.scaled(10, weight: .bold)).kerning(0.7)
                                                .foregroundStyle(.secondary)
                                            if revealable {
                                                Spacer(minLength: 4)
                                                Image(systemName: revealedTileNumber == nil
                                                      ? "eye" : "eye.slash")
                                                    .font(.scaled(12, weight: .semibold))
                                                    .foregroundStyle(Color.accentColor)
                                            }
                                        }
                                        Text(tile.v)
                                            .font(.scaled(17, weight: .semibold))
                                            .foregroundStyle(.primary)
                                            .lineLimit(2).minimumScaleFactor(0.75)
                                        if !tile.n.isEmpty {
                                            Text(tile.n)
                                                .font(.caption).foregroundStyle(.secondary)
                                                .lineLimit(1)
                                        }
                                    }
                                }
                                .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
                                .padding(Space.md)
                                .background(Color(.secondarySystemGroupedBackground))
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(!revealable)
                            .accessibilityLabel(revealable
                                ? (revealedTileNumber == nil ? "Reveal the number" : "Hide the number")
                                : "\(tile.k), \(tile.v)")
                        }
                    }
                    .background(Color(.separator).opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                }

                // An FMB with a corner table becomes a map you can measure —
                // drawn entirely from the server-derived geometry; this
                // screen computes nothing but unit conversion.
                if spine.family == "map", let g = parsedGeometry {
                    FMBMapSection(
                        geometry: g,
                        doc: doc,
                        sheetExtentRaw: (rawReading["portion_extent"] as? String) ?? "",
                        fieldExtentRaw: (rawReading["parent_survey_extent"] as? String)
                            ?? doc.extent,
                        neighbours: [
                            "north": doc.boundaryNorth, "south": doc.boundarySouth,
                            "east": doc.boundaryEast, "west": doc.boundaryWest,
                        ].filter { !$0.value.isEmpty })
                }

                // A paper filed before deep reading degrades QUIETLY — grey
                // information, never amber alarm. Amber keeps its meaning.
                if doc.reading.isEmpty {
                    HStack(spacing: Space.md) {
                        Image(systemName: "arrow.clockwise.circle")
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: Space.hair) {
                            Text("Filed before deep reading")
                                .font(.subheadline.weight(.semibold))
                            Text("Pages, checks and the paper trail arrive when a fresh scan is read.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Space.md)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                }

                // ONE review card. The caveat prose, the watch-out line and
                // the "read by the agent" caption all collapse into it —
                // itemised, severity-ordered, placed on its page.
                if !spine.review.isEmpty { reviewCard }

                // WHAT IS INSIDE the file — every survey entry the record
                // lists, readable without opening the scan. The vault row
                // says "4 entries"; this is where the four are.
                if !recordEntries.isEmpty {
                    VStack(alignment: .leading, spacing: Space.sm) {
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
                                .padding(.vertical, Space.sm)
                                if i < recordEntries.count - 1 { Divider() }
                            }
                        }
                        .padding(.horizontal, Space.lg)
                        .background(Color(.secondarySystemGroupedBackground),
                                    in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                    }
                }

                // What this paper covers. A passbook naming two survey numbers
                // is filed against both, and the link has to run in this
                // direction too — otherwise a document is a dead end.
                if !coveredHoldings.isEmpty {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        Text("COVERS \(coveredHoldings.count) \(coveredHoldings.count == 1 ? "HOLDING" : "HOLDINGS")")
                            .font(.caption.weight(.medium)).kerning(1.1)
                            .foregroundStyle(.secondary)
                        ForEach(coveredHoldings, id: \.0) { name, detail in
                            HStack(spacing: Space.md) {
                                DocumentIcon(docType: doc.docType, size: 34)
                                VStack(alignment: .leading, spacing: Space.hair) {
                                    Text(name).font(.subheadline.weight(.medium))
                                    Text(detail).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(Space.md)
                            .background(Color(.secondarySystemGroupedBackground),
                                        in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                        }
                    }
                }

                // The paper trail this deed itself cites — honest about its
                // source: the deed's own words, not asserted links. Reader
                // links[] upgrade these cards the day they exist.
                if !railCards.isEmpty {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        Text("PAPER TRAIL")
                            .font(.caption.weight(.medium)).kerning(1.1)
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Space.sm) {
                                ForEach(railCards, id: \.title) { card in
                                    VStack(alignment: .leading, spacing: Space.xs) {
                                        Text(card.role.uppercased())
                                            .font(.scaled(9.5, weight: .bold)).kerning(0.6)
                                            .foregroundStyle(card.missing
                                                             ? Palette.caution
                                                             : familyTintColor(spine.family))
                                        Text(card.title)
                                            .font(.scaled(13.5, weight: .semibold))
                                            .lineLimit(2)
                                        if !card.meta.isEmpty {
                                            Text(card.meta)
                                                .font(.caption2).foregroundStyle(.secondary)
                                        }
                                    }
                                    .frame(width: 150, alignment: .topLeading)
                                    .padding(Space.md)
                                    .background(card.missing
                                                ? Palette.caution.opacity(0.05)
                                                : Color(.secondarySystemGroupedBackground),
                                                in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                                        .strokeBorder(card.missing ? Palette.caution.opacity(0.5) : .clear,
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
                    VStack(alignment: .leading, spacing: Space.md) {
                        HStack {
                            Text("In plain words").font(.headline)
                            Spacer()
                            // The source is Telugu; the reader should not have
                            // to be an English reader to check it.
                            if !reading.summaryTe.isEmpty {
                                Button(showTelugu ? "In English" : "తెలుగులో") {
                                    withAnimation(Motion.standard()) { showTelugu.toggle() }
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
                                HStack(alignment: .top, spacing: Space.sm) {
                                    Text("•").foregroundStyle(.tint)
                                    Text(maskSensitiveText(point)).font(.subheadline)
                                }
                            }
                        }
                    }
                    .padding(Space.lg)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
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
                        VStack(alignment: .leading, spacing: Space.hair) {
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
                    .padding(Space.lg)
                    .background(Color(.secondarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                }
                .buttonStyle(.plain)

                if !problem.isEmpty { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
            }
            .padding()
        }
        // The last card must clear the floating tab bar when fully scrolled.
        .contentMargins(.bottom, 28, for: .scrollContent)
        .navigationTitle(doc.docType.isEmpty ? "Document" : doc.docType)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // The file leaves under the platform's name, straight from the
            // title bar — the founder's frame puts share up here.
            if let url = sharedCopy {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                }
            }
            // The destructive action leaves the scroll flow entirely.
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        newName = LocalFiles.all()[doc.id]?.name ?? headerTitle
                        renaming = true
                    } label: {
                        Label("Rename", systemImage: "pencil")
                    }
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Label("Delete this document", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("More actions for this document")
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
        // Renaming writes BOTH copies: the local index, so the new name is
        // there with no network, and the server row, so the laptop agrees.
        .alert("Rename document", isPresented: $renaming) {
            TextField("Name", text: $newName)
            Button("Cancel", role: .cancel) { }
            Button("Rename") { Task { await rename() } }
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || renamingBusy)
        } message: {
            Text("The name you will find this paper by.")
        }
        .fullScreenCover(item: $openAtPage) { selection in
            if let url = LocalFiles.url(for: doc.id) {
                PDFFullScreen(url: url, title: headerTitle, startPage: selection.id)
            }
        }
        .onAppear {
            if parsedReading == nil { parsedReading = DocReading(json: doc.reading) }
            if parsedSpine == nil { parsedSpine = computedSpine }
            if parsedGeometry == nil { parsedGeometry = fmbGeometry(rawReading) }
            if sharedCopy == nil, let url = LocalFiles.url(for: doc.id) {
                let name = shareFileName(
                    docType: doc.docType, village: doc.village,
                    date: [doc.registrationDate, doc.regYear, doc.createdAt]
                        .first { !$0.isEmpty } ?? "",
                    fallbackExtension: url.pathExtension)
                let dest = FileManager.default.temporaryDirectory.appendingPathComponent(name)
                try? FileManager.default.removeItem(at: dest)
                if (try? FileManager.default.copyItem(at: url, to: dest)) != nil {
                    sharedCopy = dest
                }
            }
        }
    }

    /// "Field No. 1 · Mangalakunta" — the sheet's own way of naming itself.
    private var fmbHeadline: String {
        var field = doc.surveyNo.trimmingCharacters(in: .whitespaces)
        if let n = Int(field) { field = "\(n)" }
        let parts = [field.isEmpty ? "" : "Field No. \(field)", doc.village]
            .filter { !$0.isEmpty }
        return parts.isEmpty ? "FMB" : parts.joined(separator: " · ")
    }

    /// "Tarlupadu mandal, Prakasam · sheet extent Ac 197-05"
    private var fmbSubline: String {
        var placeParts: [String] = []
        if !doc.mandal.isEmpty { placeParts.append("\(doc.mandal) mandal") }
        if !doc.district.isEmpty { placeParts.append(doc.district) }
        var parts: [String] = []
        if !placeParts.isEmpty { parts.append(placeParts.joined(separator: ", ")) }
        let raw = ((rawReading["parent_survey_extent"] as? String) ?? doc.extent)
            .replacingOccurrences(of: "Cent", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: " ."))
        if !raw.isEmpty { parts.append("sheet extent \(raw)") }
        return parts.joined(separator: " · ")
    }

    /// At most four tiles, absent slots omitted — the grid reflows to what
    /// is actually known.
    private var spineTiles: [(k: String, v: String, n: String)] {
        // An identity card's four slots are the card's own: number (masked),
        // name, date of birth, address. Land vocabulary would mislabel every
        // one of them.
        if spine.family == "identity" {
            var tiles: [(k: String, v: String, n: String)] = []
            if !spine.identityLabel.isEmpty {
                // The card's own word for its number — "Aadhaar no.", "PAN" —
                // never a generic "Number". The tile reveals on tap; the eye
                // icon says so without a sentence.
                tiles.append((identityNumberTileKey,
                              revealedTileNumber ?? spine.identityLabel, ""))
            }
            if !spine.partiesLine.isEmpty {
                tiles.append(("Full name", spine.partiesLine, ""))
            }
            if !spine.quantumLine.isEmpty {
                tiles.append(("Date of birth",
                              spine.quantumLine.replacingOccurrences(of: "DOB ", with: ""), ""))
            }
            if !doc.village.isEmpty {
                tiles.append(("Address on card", doc.village, doc.mandal))
            }
            return Array(tiles.prefix(4))
        }
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

    /// "Aadhaar no." / "PAN" — also how the grid knows which tile reveals.
    private var identityNumberTileKey: String {
        guard spine.family == "identity" else { return "" }
        return doc.docType.lowercased().contains("pan") ? "PAN" : "Aadhaar no."
    }

    private func toggleTileReveal() {
        if revealedTileNumber != nil {
            revealedTileNumber = nil
            return
        }
        guard let number = identityNumberFromLocalScan(documentID: doc.id) else {
            // A scan with no text layer cannot be read back — show the card
            // itself instead of a tap that does nothing.
            if LocalFiles.url(for: doc.id) != nil { openAtPage = PageSelection(id: 0) }
            return
        }
        let stamp = Date()
        revealedTileStamp = stamp
        revealedTileNumber = number
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
            if revealedTileStamp == stamp { revealedTileNumber = nil }
        }
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
            Button { withAnimation(Motion.standard()) { showReview.toggle() } } label: {
                HStack(spacing: Space.md) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Palette.caution)
                    Text(spine.review.count == 1
                         ? "1 thing needs you"
                         : "\(spine.review.count) things need you")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.caution)
                    Spacer(minLength: 0)
                    Text(showReview ? "Hide" : "Show")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Palette.caution.opacity(0.75))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if showReview {
                VStack(alignment: .leading, spacing: Space.md) {
                    ForEach(spine.review) { item in
                        HStack(alignment: .top, spacing: Space.sm) {
                            Circle()
                                .fill(item.severity == "high" ? Palette.danger : Palette.caution)
                                .frame(width: 6, height: 6)
                                .padding(.top, Space.sm)
                            VStack(alignment: .leading, spacing: Space.xs) {
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
                                            .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
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
                    .foregroundStyle(Palette.caution)
                    .disabled(reminded)
                }
                .padding(.top, Space.md)
            }
        }
        .padding(Space.md)
        .background(Palette.caution.opacity(0.10),
                    in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
            .stroke(Palette.caution.opacity(0.22), lineWidth: 1))
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
        // An identity card is known by its PERSON — "Aadhaar · Ravi
        // Rathamma", the design's own naming. The masked number lives in
        // the tile, not the headline.
        if spine.family == "identity", !spine.primaryPerson.isEmpty {
            return "\(kind) · \(spine.primaryPerson)"
        }
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
    /// An identity card's subline speaks its own vocabulary: "Downloaded
    /// 29 July 2017 · masked by default".
    private var registeredLine: String {
        var parts: [String] = []
        if spine.family == "identity" {
            let downloaded = (rawReading["downloaded_on"] as? String) ?? ""
            if !downloaded.isEmpty { parts.append("Downloaded \(humanDate(downloaded))") }
            parts.append("masked by default")
            if reading.totalPages > 0 { parts.append("\(reading.totalPages) pages") }
            return parts.joined(separator: " · ")
        }
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

    /// The summary in whichever language is switched on. Identity numbers
    /// inside the prose render masked — the details rows are the one reveal
    /// surface.
    private var shownParagraphs: [String] {
        let text = showTelugu && !reading.summaryTe.isEmpty ? reading.summaryTe : doc.summary
        return text.components(separatedBy: "\n\n")
            .map { maskSensitiveText($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
            .filter { !$0.isEmpty }
    }

    /// Give this paper the name its owner wants to find it by.
    ///
    /// The local index is authoritative for what the phone shows and for the
    /// filename the document leaves under, so it is written first and never
    /// depends on the network. The server copy follows so the web vault agrees;
    /// `renameDocument` accepts a reading id as well as a file id precisely so
    /// this call does not have to know which of the two it is holding.
    private func rename() async {
        let wanted = newName.trimmingCharacters(in: .whitespaces)
        guard !wanted.isEmpty else { return }
        renamingBusy = true
        defer { renamingBusy = false }
        if let url = LocalFiles.url(for: doc.id) {
            // Keep the extension: a name without one will not open anywhere.
            let ext = url.pathExtension
            let named = (wanted as NSString).pathExtension.isEmpty && !ext.isEmpty
                ? "\(wanted).\(ext)" : wanted
            try? LocalFiles.rename(documentID: doc.id, to: named)
        }
        struct Renamed: Decodable { let renameDocument: IDOnly?
            struct IDOnly: Decodable { let id: String } }
        if await app.load(Mutations.renameDocument,
                          variables: ["id": doc.id, "name": wanted],
                          as: Renamed.self) == nil {
            // The phone still shows the new name; say plainly that the other
            // devices do not yet.
            problem = "Renamed on this phone — the server could not be reached."
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


/// The system share sheet, presented from code.
///
/// `ShareLink` covers the ordinary case — a button that shares a thing already
/// in hand — but a zip of six documents does not exist until the person asks
/// for it, and there is no ShareLink for "whatever I am about to build". This
/// is the small representable that closes that gap.
struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
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
