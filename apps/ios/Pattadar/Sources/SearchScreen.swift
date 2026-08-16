import PattadarKit
import SwiftUI

/// Search (M13) — jumps to one thing; it never filters.
///
/// Three sections: the records, the papers, and the actions a match makes
/// sensible. Narrowing a list you are already looking at is Filter's job,
/// and the footnote says so — the two were one muddled feature everywhere
/// else this app has lived.
struct SearchScreen: View {
    let holdings: [Holding]
    let documents: [RegisteredDocument]
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var asking: RequestKind?

    var body: some View {
        NavigationStack {
            List {
                if trimmed.isEmpty {
                    Section {
                        Text("A survey number, a village, a document number, a name — search finds it wherever it is filed.")
                            .font(.bodyCopy).foregroundStyle(.secondary)
                    }
                } else {
                    if !matchedHoldings.isEmpty {
                        Section("Properties") {
                            ForEach(matchedHoldings) { h in
                                NavigationLink { HoldingDestination(holding: h) } label: {
                                    HStack(spacing: Space.md) {
                                        Image(systemName: h.kind.icon)
                                            .font(.scaled(15))
                                            .foregroundStyle(Palette.tint(for: h.kind))
                                            .frame(width: 24)
                                        VStack(alignment: .leading, spacing: Space.hair) {
                                            Text(highlighted(h.title))
                                                .font(.subheadline.weight(.semibold))
                                            Text(highlighted([h.extentText, h.village]
                                                .filter { !$0.isEmpty }.joined(separator: " · ")))
                                                .font(.note).foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if !matchedDocuments.isEmpty {
                        Section("Papers") {
                            ForEach(matchedDocuments) { doc in
                                NavigationLink { DocumentDetailScreen(doc: doc) } label: {
                                    HStack(spacing: Space.md) {
                                        DocumentIcon(docType: doc.docType, size: 30)
                                        VStack(alignment: .leading, spacing: Space.hair) {
                                            Text(highlighted(docLine(doc)))
                                                .font(.subheadline.weight(.semibold))
                                            Text(highlighted(docSubline(doc)))
                                                .font(.note).foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if let first = matchedHoldings.first {
                        Section("Actions") {
                            Button { asking = .errand } label: {
                                Label("Order an EC for \(first.title)",
                                      systemImage: "doc.text.magnifyingglass")
                            }
                            Button { asking = .survey } label: {
                                Label("Ask for a survey of \(first.title)",
                                      systemImage: "ruler")
                            }
                        }
                    }
                    if matchedHoldings.isEmpty && matchedDocuments.isEmpty {
                        Section {
                            Text("Nothing matches \"\(trimmed)\" — not in the records, not in the papers.")
                                .font(.bodyCopy).foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    Text("Searching finds records and papers wherever they are. To narrow a list you are already looking at, use Filter.")
                        .font(.note).foregroundStyle(.secondary)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
            }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: "Survey no., village, paper, name")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(item: $asking) { kind in
                AddRequestSheet(kind: kind) { }
            }
        }
    }

    // MARK: - Matching

    private var trimmed: String {
        query.trimmingCharacters(in: .whitespaces)
    }

    private var matchedHoldings: [Holding] {
        let q = trimmed.lowercased()
        guard !q.isEmpty else { return [] }
        return holdings.filter { h in
            [h.title, h.village, h.passbook, h.owner, h.typeLabel]
                .joined(separator: " ").lowercased().contains(q)
        }
    }

    private var matchedDocuments: [RegisteredDocument] {
        let q = trimmed.lowercased()
        guard !q.isEmpty else { return [] }
        return documents.filter { d in
            [d.documentNo, d.docType, d.surveyNo, d.village, d.sro, d.regYear]
                .joined(separator: " ").lowercased().contains(q)
        }
    }

    private func docLine(_ d: RegisteredDocument) -> String {
        let name = d.docType.isEmpty ? "Document" : d.docType.capitalized
        return d.documentNo.isEmpty ? name : "\(name) \(d.documentNo)"
    }

    private func docSubline(_ d: RegisteredDocument) -> String {
        [d.surveyNo.isEmpty ? "" : "Sy \(d.surveyNo)", d.village, d.regYear]
            .filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// The match, lit in the accent — the eye lands on WHY this row answered.
    private func highlighted(_ text: String) -> AttributedString {
        var attributed = AttributedString(text)
        let q = trimmed
        guard !q.isEmpty,
              let range = attributed.range(of: q, options: .caseInsensitive) else {
            return attributed
        }
        attributed[range].foregroundColor = Palette.accent
        attributed[range].font = .subheadline.weight(.bold)
        return attributed
    }
}
