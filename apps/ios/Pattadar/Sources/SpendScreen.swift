import Charts
import PattadarKit
import SwiftUI

/// What the land has cost — a different question from what it is worth.
///
/// Nobody can answer "how much have I put into this" from a drawer of receipts,
/// and it is asked at exactly the wrong moments: at tax time, when a co-owner
/// wants to know what was spent, and when computing capital gains, where every
/// rupee of improvement is deductible IF it can be evidenced.
struct SpendScreen: View {
    @Environment(AppModel.self) private var app

    @State private var expenses: [LandExpense] = []
    @State private var loaded = false
    @State private var adding = false

    private var total: Double { expenses.reduce(0) { $0 + $1.amount } }

    private struct Bucket: Identifiable {
        let id: String
        let amount: Double
        let count: Int
    }

    private var byCategory: [Bucket] {
        Dictionary(grouping: expenses) { $0.category.isEmpty ? "other" : $0.category.lowercased() }
            .map { Bucket(id: $0.key, amount: $0.value.reduce(0) { $0 + $1.amount },
                          count: $0.value.count) }
            .sorted { $0.amount > $1.amount }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: Space.sm) {
                    Text(total > 0 ? rupees(total) : "Nothing recorded")
                        .font(.system(.largeTitle, design: .serif).weight(.semibold))
                        .monospacedDigit()
                    Text(loaded && expenses.isEmpty
                         ? "Stamp duty, fencing, a survey, the tax — recorded here, it can be evidenced when it matters."
                         : "\(expenses.count) entr\(expenses.count == 1 ? "y" : "ies") recorded.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, Space.xs)
            }

            if !byCategory.isEmpty {
                Section("Where it went") {
                    ForEach(byCategory) { b in
                        VStack(alignment: .leading, spacing: Space.sm) {
                            HStack {
                                Text(humanize(b.id)).font(.subheadline.weight(.medium))
                                Spacer()
                                Text(rupees(b.amount)).font(.subheadline).monospacedDigit()
                            }
                            // Proportion of the total, so the big one is
                            // obvious without reading every figure.
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(Color(.tertiarySystemFill))
                                    Capsule().fill(Color.accentColor)
                                        .frame(width: geo.size.width * (total > 0 ? b.amount / total : 0))
                                }
                            }
                            .frame(height: 5)
                            Text("\(b.count) item\(b.count == 1 ? "" : "s")")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, Space.hair)
                    }
                }
            }

            if !expenses.isEmpty {
                Section("Everything recorded") {
                    ForEach(expenses) { e in
                        VStack(alignment: .leading, spacing: Space.hair) {
                            HStack {
                                Text(e.title).font(.subheadline.weight(.medium))
                                Spacer()
                                Text(rupees(e.amount)).font(.subheadline).monospacedDigit()
                            }
                            Text([humanDate(e.spentOn), e.vendor]
                                .filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .swipeActions {
                            Button(role: .destructive) { Task { await remove(e) } } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Spend")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { adding = true } label: { Label("Add", systemImage: "plus") }
            }
        }
        .sheet(isPresented: $adding) { AddExpenseSheet { Task { await load() } } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        expenses = (await app.load(Queries.landExpenses,
                                   as: LandExpensesResponse.self))?.landExpenses ?? []
        loaded = true
    }

    private func remove(_ e: LandExpense) async {
        struct Ack: Decodable { let deleteLandExpense: Bool }
        _ = await app.load(Mutations.deleteLandExpense, variables: ["id": e.id], as: Ack.self)
        await load()
    }
}

/// Record something the land cost.
struct AddExpenseSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let onSaved: () -> Void

    /// The headings a land record actually spends under. Free text underneath,
    /// so somebody can add their own without asking.
    private let suggestions = ["Stamp duty & registration", "Legal & document charges",
                               "Fencing & land work", "Land & property tax",
                               "Survey & office fees", "Water & power"]

    @State private var title = ""
    @State private var category = ""
    @State private var amount = ""
    @State private var vendor = ""
    @State private var spentOn = Date()
    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    FormRow(label: "What for", text: $title,
                            prompt: "Fencing, north side", required: true)
                    FormRow(label: "Amount", text: $amount, prompt: "₹", required: true)
                    DatePicker("When", selection: $spentOn, displayedComponents: .date)
                    FormRow(label: "Paid to", text: $vendor, prompt: "Contractor, office, advocate")
                }

                Section {
                    FormRow(label: "Heading", text: $category, prompt: "Fencing & land work")
                    FlowLayout(spacing: Space.sm) {
                        ForEach(suggestions, id: \.self) { s in
                            Button { category = s } label: {
                                Text(s).font(.caption)
                                    .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
                                    .background(Color(.tertiarySystemFill), in: Capsule())
                                    .foregroundStyle(.primary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } footer: {
                    Text("Or type your own — it stays on your records.")
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(Palette.danger).font(.callout) }
                }

                Section {
                    PrimaryButton(title: "Save", busy: saving,
                                  disabled: title.trimmingCharacters(in: .whitespaces).isEmpty
                                         || (Double(amount.filter { $0.isNumber || $0 == "." }) ?? 0) <= 0) {
                        Task { await save() }
                    }
                }
            }
            .navigationTitle("Add an expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private func save() async {
        saving = true
        problem = ""
        defer { saving = false }
        struct Ack: Decodable { let addLandExpense: IDPayload? }
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        let vars: [String: any Sendable] = [
            "title": title.trimmingCharacters(in: .whitespaces),
            "amount": Double(amount.filter { $0.isNumber || $0 == "." }) ?? 0,
            "category": category.trimmingCharacters(in: .whitespaces).isEmpty
                ? "other" : category.trimmingCharacters(in: .whitespaces),
            "entityType": "", "entityId": "",
            "spentOn": f.string(from: spentOn),
            "vendor": vendor.trimmingCharacters(in: .whitespaces), "note": "",
        ]
        guard await app.load(Mutations.addLandExpense, variables: vars,
                             as: Ack.self)?.addLandExpense != nil else {
            problem = app.lastFailure ?? "It could not be saved."
            return
        }
        onSaved()
        dismiss()
    }
}
