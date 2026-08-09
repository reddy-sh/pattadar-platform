import PDFKit
import PattadarKit
import SwiftUI

/// The document viewer's data — the full extraction, parsed once.
///
/// From `Document Viewer.dc.html`: the viewer needs what the LIST never
/// showed — the language, the Telugu summary, the one line that will bite
/// later, which pages hold what, and which fields deserve a second look.
/// All of it rides in the document's `reading` blob, stored verbatim at
/// filing time; a row filed before the blob existed simply has less to say.
struct DocReading {
    let language: String
    let summaryTe: String
    let watchOut: String
    /// Page ranges and what they are: ("1-9", "Sale Deed").
    let contents: [(pages: String, kind: String)]
    /// Field name → the page its value was read from.
    let fieldPages: [String: Int]
    /// Field name → "check" | "unsure". Absent means clean.
    let fieldConfidence: [String: String]
    let totalPages: Int
    /// The deed's own list of who parted with it and who received it.
    let parties: [(role: String, name: String, isGPA: Bool)]

    init(json: String) {
        let f = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:]
        language = f["language"] as? String ?? ""
        summaryTe = f["summary_te"] as? String ?? ""
        watchOut = f["watch_out"] as? String ?? ""
        contents = (f["contents"] as? [[String: Any]] ?? []).compactMap { c in
            guard let pages = c["pages"] as? String, let kind = c["kind"] as? String,
                  !pages.isEmpty else { return nil }
            return (pages, kind)
        }
        var pages: [String: Int] = [:]
        for (key, value) in f["field_pages"] as? [String: Any] ?? [:] {
            if let n = value as? Int { pages[key] = n }
            else if let d = value as? Double { pages[key] = Int(d) }
        }
        fieldPages = pages
        fieldConfidence = (f["field_confidence"] as? [String: String] ?? [:])
            .mapValues { $0.lowercased().contains("unsure") ? "unsure" : "check" }
        totalPages = (f["total_pages"] as? Int) ?? Int(f["total_pages"] as? Double ?? 0)
        parties = (f["parties"] as? [[String: Any]] ?? []).compactMap { p in
            guard let name = p["name"] as? String, !name.isEmpty else { return nil }
            let gpa = (p["is_gpa"] as? Bool)
                ?? ((p["is_gpa"] as? NSNumber).map { CFGetTypeID($0) == CFBooleanGetTypeID() && $0.boolValue } ?? false)
            return (role: p["role"] as? String ?? "", name: name, isGPA: gpa)
        }
    }

    var isEmpty: Bool {
        language.isEmpty && summaryTe.isEmpty && watchOut.isEmpty && contents.isEmpty
    }

    /// The kind of a given 1-based page, from the ranges.
    func kind(ofPage page: Int) -> String {
        for entry in contents {
            let bounds = entry.pages.split(whereSeparator: { "-–".contains($0) })
                .compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
            if bounds.count == 2, (bounds[0]...max(bounds[0], bounds[1])).contains(page) { return entry.kind }
            if bounds.count == 1, bounds[0] == page { return entry.kind }
        }
        return ""
    }
}

// MARK: - Confidence

/// The pill beside a value the agent is not certain of. No pill IS the
/// clean state — a green tick on every row would bury the two that matter.
struct ConfidencePill: View {
    /// "check" or "unsure".
    let level: String

    var body: some View {
        Text(level == "unsure" ? "The agent is unsure" : "Check this")
            .font(.system(size: 10.5, weight: .semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((level == "unsure" ? Color.red : Color.orange).opacity(0.16),
                        in: Capsule())
            .foregroundStyle(level == "unsure" ? Color.red : Color.orange)
    }
}

// MARK: - Page strip

/// Real page renders in a horizontal strip, labelled with what each page IS.
/// Tapping opens the file full screen at that page.
struct PDFPageStrip: View {
    let url: URL
    let reading: DocReading
    let onOpen: (Int) -> Void

    @State private var thumbs: [Int: UIImage] = [:]
    @State private var pageCount = 0

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(0..<pageCount, id: \.self) { index in
                    Button { onOpen(index) } label: {
                        VStack(spacing: 4) {
                            Group {
                                if let image = thumbs[index] {
                                    Image(uiImage: image)
                                        .resizable().scaledToFill()
                                } else {
                                    Text("\(index + 1)")
                                        .font(.headline).foregroundStyle(.tertiary)
                                }
                            }
                            .frame(width: 78, height: 104)
                            .background(Color(.tertiarySystemFill))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(Color.primary.opacity(0.1), lineWidth: 1))

                            Text(label(index))
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
        .task { await render() }
    }

    private func label(_ index: Int) -> String {
        let kind = reading.kind(ofPage: index + 1)
        return kind.isEmpty ? "Page \(index + 1)" : kind
    }

    /// Thumbnails off the main thread; the first eight are enough to draw,
    /// the rest fill in as they come.
    private func render() async {
        let rendered: [Int: UIImage] = await Task.detached(priority: .utility) {
            guard let pdf = PDFDocument(url: url) else { return [:] }
            var out: [Int: UIImage] = [:]
            for i in 0..<min(pdf.pageCount, 24) {
                if let page = pdf.page(at: i) {
                    out[i] = page.thumbnail(of: CGSize(width: 156, height: 208), for: .mediaBox)
                }
            }
            return out
        }.value
        pageCount = PDFDocument(url: url)?.pageCount ?? rendered.count
        thumbs = rendered
    }
}

// MARK: - Full-screen viewer

/// The scan itself, full screen, opened at the page that was tapped.
struct PDFFullScreen: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    let title: String
    var startPage: Int = 0

    var body: some View {
        NavigationStack {
            PDFKitView(url: url, startPage: startPage)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: url) { Image(systemName: "square.and.arrow.up") }
                    }
                }
        }
    }
}

private struct PDFKitView: UIViewRepresentable {
    let url: URL
    let startPage: Int

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.document = PDFDocument(url: url)
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.backgroundColor = .black
        if let doc = view.document, startPage > 0, startPage < doc.pageCount,
           let page = doc.page(at: startPage) {
            // After layout, or PDFView scrolls straight back to page one.
            DispatchQueue.main.async { view.go(to: page) }
        }
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {}
}

// MARK: - What is inside this file

/// A registered file is usually several documents bound together. Naming the
/// ranges is what stops "page 12 is sideways" being a mystery.
struct FileContentsSection: View {
    let reading: DocReading
    let onOpen: (Int) -> Void

    var body: some View {
        let runs = mergedRuns
        if !runs.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("WHAT IS INSIDE THIS FILE")
                    .font(.caption.weight(.medium)).kerning(1.1)
                    .foregroundStyle(.secondary)
                VStack(spacing: 0) {
                    ForEach(Array(runs.enumerated()), id: \.offset) { i, entry in
                        if i > 0 { Divider() }
                        Button {
                            let first = Int(entry.pages.split(whereSeparator: { "-–".contains($0) })
                                .first.map(String.init) ?? "1") ?? 1
                            onOpen(first - 1)
                        } label: {
                            HStack {
                                let family = documentFamily(entry.kind)
                                Text(documentMono(entry.kind))
                                    .font(.system(size: 10.5, weight: .heavy)).kerning(0.3)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                    .frame(width: 28, height: 28)
                                    .background(familyTintColor(family).opacity(0.14),
                                                in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                                    .foregroundStyle(familyTintColor(family))
                                Text(entry.kind).font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary)
                                Spacer(minLength: 8)
                                Text("p. \(entry.pages)")
                                    .font(.caption).monospacedDigit()
                                    .foregroundStyle(.secondary)
                                Image(systemName: "chevron.right")
                                    .font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
                            }
                            .padding(.vertical, 9)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }

    /// Consecutive same-kind pages are ONE run — "Sale deed body · p. 3–9",
    /// not eleven alternating rows. A per-page classifier dump is not a table
    /// of contents.
    private var mergedRuns: [(pages: String, kind: String)] {
        var out: [(pages: String, kind: String)] = []
        for entry in reading.contents {
            if let last = out.last, last.kind == entry.kind,
               let lastBounds = bounds(last.pages), let cur = bounds(entry.pages),
               cur.0 == lastBounds.1 + 1 {
                out[out.count - 1] = ("\(lastBounds.0)–\(cur.1)", entry.kind)
            } else {
                out.append(entry)
            }
        }
        return out
    }

    private func bounds(_ pages: String) -> (Int, Int)? {
        let nums = pages.split(whereSeparator: { "-–".contains($0) })
            .compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        if nums.count == 2 { return (nums[0], max(nums[0], nums[1])) }
        if nums.count == 1 { return (nums[0], nums[0]) }
        return nil
    }
}

// MARK: - The details

/// One standard schema for every document type: Who · What · Money ·
/// Registration. Each row carries the page it was read from, and a pill
/// when the agent is not sure.
struct DocDetailRow: Identifiable {
    var id: String { label }
    let label: String
    let value: String
    /// The extraction field name, for page + confidence lookups.
    let field: String
}

struct DocDetailsSection: View {
    let groups: [(title: String, rows: [DocDetailRow])]
    let reading: DocReading
    let onOpenPage: (Int) -> Void
    /// Rows whose identity number is currently open. A reveal re-masks itself:
    /// sixty seconds is enough to read a number to a clerk, not enough to
    /// forget the screen is on.
    @State private var revealed: Set<String> = []
    /// One cancellable re-mask per row — a Hide followed by a fresh reveal
    /// must not be cut short by the FIRST reveal's stale timer.
    @State private var remaskers: [String: DispatchWorkItem] = [:]

    var body: some View {
        ForEach(groups.filter { !$0.rows.isEmpty }, id: \.title) { group in
            VStack(alignment: .leading, spacing: 8) {
                Text(group.title.uppercased())
                    .font(.caption.weight(.medium)).kerning(1.1)
                    .foregroundStyle(.secondary)
                VStack(spacing: 0) {
                    // Positional identity: two "Seller" rows on a joint deed
                    // share a label, and rows are an immutable snapshot for
                    // the screen's lifetime.
                    ForEach(Array(group.rows.enumerated()), id: \.offset) { i, row in
                        if i > 0 { Divider() }
                        rowView(row, id: "\(group.title)-\(i)")
                    }
                }
                .padding(.horizontal, 14)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }

    @ViewBuilder private func rowView(_ row: DocDetailRow, id rowID: String) -> some View {
        let page = reading.fieldPages[row.field]
        let confidence = reading.fieldConfidence[row.field]
        let sensitive = isSensitiveIdentityValue(row.value)
        let isOpen = revealed.contains(rowID)
        Button {
            // The row keeps its provenance meaning: tap opens the page. The
            // reveal has its own button below — a masked value must not cost
            // a field its page.
            if let page { onOpenPage(page - 1) }
            else if sensitive { toggleReveal(rowID) }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.label).font(.subheadline).foregroundStyle(.secondary)
                    if let page {
                        Text("page \(page)")
                            .font(.system(size: 10.5)).monospacedDigit()
                            .foregroundStyle(.tertiary)
                    }
                }
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 3) {
                    Text(sensitive && !isOpen ? maskedIdentity(row.value) : row.value)
                        .font(sensitive
                              ? .system(.subheadline, design: .monospaced).weight(.medium)
                              : .subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.trailing)
                    if sensitive {
                        Button { toggleReveal(rowID) } label: {
                            Text(isOpen ? "Hide" : "Tap to reveal")
                                .font(.system(size: 10.5, weight: .semibold))
                                .foregroundStyle(.tint)
                        }
                        .buttonStyle(.borderless)
                    }
                    if let confidence { ConfidencePill(level: confidence) }
                }
            }
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!sensitive && page == nil)
    }

    private func toggleReveal(_ id: String) {
        remaskers.removeValue(forKey: id)?.cancel()
        if revealed.contains(id) {
            revealed.remove(id)
        } else {
            revealed.insert(id)
            let work = DispatchWorkItem {
                revealed.remove(id)
                remaskers[id] = nil
            }
            remaskers[id] = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: work)
        }
    }
}
