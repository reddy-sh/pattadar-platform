import PattadarKit
import SwiftUI

/// The catalogue, parcels and confirmations all come from the authenticated
/// server. A local preference cannot be evidence that an order was placed.
struct ServicesScreen: View {
    @Environment(AppModel.self) private var app
    @State private var data: NativeServicesResponse.Web?
    @State private var category = "All"
    @State private var selection: ServiceSelection?
    @State private var dismissedBundle = false
    @State private var loading = true
    @State private var failure: String?

    private var groups: [String] {
        ["All"] + Array(Set(data?.servicesOffered.map(\.group) ?? [])).sorted()
    }
    private var bundle: [NativeServiceOffer] {
        (data?.servicesOffered ?? []).filter { $0.key == "ec" || $0.key == "survey" }
    }

    var body: some View {
        List {
            if loading { ProgressView("Loading services…") }
            if let failure {
                Section {
                    Text(failure).foregroundStyle(Palette.danger)
                    Button("Try again") { Task { await load() } }
                }
            }
            if let data {
                Section {
                    Text("Services for your \(data.properties.cards.count) land records")
                        .font(.note).foregroundStyle(.secondary)
                    Text("Placing an order records a request. Payment and provider assignment are shown separately.")
                        .font(.note).foregroundStyle(.secondary)
                }
                if !dismissedBundle, bundle.count == 2 {
                    Section("Prepare for a sale") {
                        Text("An EC and boundary survey for a record you choose.")
                        Text(rupees(bundle.reduce(0) { $0 + $1.price })).font(.headline)
                        Button("Order both") { selection = ServiceSelection(offers: bundle) }
                            .disabled(data.properties.cards.isEmpty)
                        Button("Not now") { dismissedBundle = true }
                    }
                }
                Section {
                    Picker("Category", selection: $category) {
                        ForEach(groups, id: \.self) { Text($0).tag($0) }
                    }
                    ForEach(data.servicesOffered.filter { category == "All" || $0.group == category }) { offer in
                        Button { selection = ServiceSelection(offers: [offer]) } label: {
                            VStack(alignment: .leading, spacing: Space.xs) {
                                HStack {
                                    Text(offer.label).font(.headline)
                                    Spacer()
                                    Text(rupees(offer.price)).font(.callout)
                                }
                                Text(offer.blurb).font(.note).foregroundStyle(.secondary)
                                Text("Typically \(offer.days) days").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, Space.xs)
                        }.buttonStyle(.plain).disabled(data.properties.cards.isEmpty)
                    }
                    if data.properties.cards.isEmpty {
                        Text("Add a land record before ordering a service.").font(.note)
                    }
                    NavigationLink { GetItDoneScreen() } label: {
                        Label("Other work and your requests", systemImage: "list.bullet.rectangle")
                    }
                }
                Section("Your orders") {
                    if data.orders.isEmpty { Text("No orders yet.").foregroundStyle(.secondary) }
                    ForEach(data.orders) { order in
                        NavigationLink { ConfirmedOrderDetail(order: order) } label: {
                            VStack(alignment: .leading, spacing: Space.hair) {
                                Text(order.title)
                                Text("\(order.recordTitle) · \(order.statusLabel)")
                                    .font(.note).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Services")
        .task(id: app.sessionID) { await load() }
        .refreshable { await load() }
        .sheet(item: $selection) { picked in
            ServiceOrderSheet(offers: picked.offers, records: data?.properties.cards ?? []) {
                Task { await load() }
            }
        }
    }

    private func load() async {
        let session = app.sessionID
        loading = true
        let result = await app.fetch(Queries.nativeServices, as: NativeServicesResponse.self)
        guard session == app.sessionID else { return }
        data = result.value?.web
        failure = result.failure
        loading = false
    }
}

private struct ServiceSelection: Identifiable {
    let id = UUID()
    let offers: [NativeServiceOffer]
}

private struct ServiceOrderSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let offers: [NativeServiceOffer]
    let records: [NativeServiceRecord]
    var onChanged: () -> Void
    @State private var recordID = ""
    @State private var answers: [String: String] = [:]
    @State private var confirmed: Set<String> = []
    @State private var requestKeys: [String: String] = [:]
    @State private var busy = false
    @State private var attempted = false
    @State private var problem = ""

    private var complete: Bool { confirmed.count == offers.count }
    private var ready: Bool {
        !recordID.isEmpty && offers.allSatisfy { offer in
            offer.fields.allSatisfy { !$0.required || !(answers["\(offer.key).\($0.name)"] ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
    }
    var body: some View {
        NavigationStack {
            Form {
                Section("Land record") {
                    Picker("Record", selection: $recordID) {
                        Text("Choose a record").tag("")
                        ForEach(records) { Text("\($0.title) · \($0.subtitle)").tag($0.id) }
                    }.disabled(attempted)
                }
                ForEach(offers) { offer in
                    Section {
                        HStack {
                            Text(offer.label)
                            Spacer()
                            Text(rupees(offer.price))
                        }
                        if confirmed.contains(offer.key) {
                            Label("Order confirmed", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(Palette.success)
                        } else {
                            ForEach(offer.fields) { field in
                                answerField(field, offer: offer).disabled(attempted)
                            }
                        }
                    }
                }
                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(Palette.danger) }
                }
                Section {
                    if complete {
                        Text("All \(confirmed.count) orders were confirmed by the server.")
                        Button("Done") { dismiss() }
                    } else {
                        Button {
                            Task { await placeOrders() }
                        } label: {
                            if busy { ProgressView() }
                            else { Text(attempted ? "Retry unconfirmed orders" : offers.count > 1 ? "Place both orders" : "Place order") }
                        }.disabled(!ready || busy)
                    }
                } footer: {
                    Text("No payment is taken here. If a connection is interrupted, retrying the same request will not create a duplicate.")
                }
            }
            .navigationTitle(offers.count > 1 ? "Order both" : "Order service")
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }.disabled(busy)
            } }
            .interactiveDismissDisabled(busy)
        }
    }

    @ViewBuilder
    private func answerField(_ field: NativeServiceField, offer: NativeServiceOffer) -> some View {
        let binding = Binding<String>(get: { answers["\(offer.key).\(field.name)"] ?? "" },
                                      set: { answers["\(offer.key).\(field.name)"] = $0 })
        if field.kind == "select" {
            Picker(field.label + (field.required ? " *" : ""), selection: binding) {
                Text("Choose").tag("")
                ForEach(field.options, id: \.self) { Text($0).tag($0) }
            }
        } else {
            TextField(field.label + (field.required ? " *" : ""), text: binding,
                      axis: field.kind == "textarea" ? .vertical : .horizontal)
        }
        if !field.help.isEmpty { Text(field.help).font(.caption).foregroundStyle(.secondary) }
    }

    private func placeOrders() async {
        guard ready, !busy else { return }
        let session = app.sessionID
        busy = true
        attempted = true
        problem = ""
        defer { busy = false }
        for offer in offers where !confirmed.contains(offer.key) {
            let params = Dictionary(uniqueKeysWithValues: offer.fields.map {
                ($0.name, answers["\(offer.key).\($0.name)"] ?? "")
            })
            guard let json = try? JSONSerialization.data(withJSONObject: params),
                  let encoded = String(data: json, encoding: .utf8) else { return }
            let key = requestKeys[offer.key] ?? UUID().uuidString
            requestKeys[offer.key] = key
            let response = await app.load(Mutations.nativeOrderService, variables: [
                "recordIds": [recordID], "kind": offer.key, "params": encoded, "idempotencyKey": key,
            ], as: NativeOrderConfirmation.self)
            guard session == app.sessionID else { return }
            guard response?.web.orderService == 1 else {
                problem = "\(confirmed.count) of \(offers.count) orders confirmed. "
                    + (app.lastFailure ?? "This order was not accepted; check your record and answers.")
                onChanged()
                return
            }
            confirmed.insert(offer.key)
        }
        onChanged()
    }
}

private struct ConfirmedOrderDetail: View {
    @Environment(AppModel.self) private var app
    let order: NativeServiceOrder
    var body: some View {
        List {
            Section {
                Text(order.title).font(.recordTitle)
                Text(order.recordTitle).foregroundStyle(.secondary)
                if !order.detail.isEmpty { Text(order.detail) }
            }
            Section {
                Fact(label: "Status", value: order.statusLabel)
                Fact(label: "Quoted", value: rupees(order.cost))
                Fact(label: "Assigned to", value: order.assignee.isEmpty ? "Awaiting assignment" : order.assignee)
                if !order.dueDate.isEmpty { Fact(label: "Due", value: order.dueDate) }
            }
            if app.api.config.baseURL.host() == "pattadar.com" {
                Section {
                    Link("Payment and settlement status", destination: URL(string: "https://pattadar.com")!
                        .appendingPathComponent("app/tickets").appendingPathComponent(order.id).appendingPathComponent("pay"))
                    Text("Opens the secure web checkout. Sign in with the same account if asked.")
                        .font(.note).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(order.ref.isEmpty ? "Order" : order.ref)
        .navigationBarTitleDisplayMode(.inline)
    }
}
