import PattadarKit
import SwiftUI

/// Ask for something — record work you want somebody to do.
struct AddRequestSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let kind: RequestKind
    let onSaved: () -> Void

    @State private var title = ""
    @State private var assignee = ""
    @State private var cost = ""
    @State private var note = ""
    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    FormRow(label: "What", text: $title, prompt: kind.title, required: true)
                    FormRow(label: "Who", text: $assignee, prompt: "Surveyor, advocate, agent")
                    FormRow(label: "Cost", text: $cost, prompt: "₹")
                } header: {
                    Text(kind.title)
                } footer: {
                    // Stated as a guide. Nobody here is contracted to do this
                    // work, so a firm figure would be an invention.
                    Text("\(kind.hint). This is \(kind.priceHint) — a guide, not a quote. You find the person; this keeps track of them.")
                }

                Section("Anything to remember") {
                    TextField("Be present, the neighbour disputes the west bund…",
                              text: $note, axis: .vertical)
                        .lineLimit(2...5)
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(.red).font(.callout) }
                }

                Section {
                    PrimaryButton(title: "Add to Get it done", busy: saving,
                                  disabled: title.trimmingCharacters(in: .whitespaces).isEmpty
                                         && assignee.trimmingCharacters(in: .whitespaces).isEmpty) {
                        Task { await save() }
                    }
                } footer: {
                    Text("It starts at “\(kind.stages.first ?? "Asked")”. Move it along as it happens.")
                }
            }
            .navigationTitle("Ask for something")
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
        struct Ack: Decodable { let addWorkRequest: IDPayload? }
        let vars: [String: any Sendable] = [
            "kind": kind.rawValue,
            "title": title.trimmingCharacters(in: .whitespaces).isEmpty
                ? kind.title : title.trimmingCharacters(in: .whitespaces),
            "entityType": "", "entityId": "",
            "assignee": assignee.trimmingCharacters(in: .whitespaces),
            "cost": Double(cost.filter { $0.isNumber || $0 == "." }) ?? 0,
            "note": note.trimmingCharacters(in: .whitespaces), "dueDate": "",
        ]
        guard await app.load(Mutations.addWorkRequest, variables: vars,
                             as: Ack.self)?.addWorkRequest != nil else {
            problem = app.lastFailure ?? "It could not be saved."
            return
        }
        onSaved()
        dismiss()
    }
}

/// Move a request along, or close it.
struct RequestDetailSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let request: WorkRequest
    let onChanged: () -> Void

    @State private var stage: Int
    @State private var needsYou: Bool
    @State private var working = false
    @State private var confirmDelete = false

    init(request: WorkRequest, onChanged: @escaping () -> Void) {
        self.request = request
        self.onChanged = onChanged
        _stage = State(initialValue: request.stage)
        _needsYou = State(initialValue: request.needsYou)
    }

    private var kind: RequestKind { RequestKind.of(request.kind) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Where it has got to", selection: $stage) {
                        ForEach(Array(kind.stages.enumerated()), id: \.offset) { i, name in
                            Text(name).tag(i)
                        }
                    }
                    .pickerStyle(.inline)
                } header: {
                    Text(request.title.isEmpty ? kind.title : request.title)
                }

                Section {
                    Toggle("Waiting on me", isOn: $needsYou)
                } footer: {
                    // The distinction that decides whether it moves at all.
                    Text("A request waiting on you looks exactly like one moving along — and only one of them will stall for a month.")
                }

                if !request.note.isEmpty {
                    Section("Noted when it was asked") {
                        Text(request.note).font(.callout)
                    }
                }

                Section {
                    PrimaryButton(title: "Save", busy: working, disabled: false) {
                        Task { await save(closed: request.closed) }
                    }
                    if !request.closed {
                        Button("Mark it done") { Task { await save(closed: true) } }
                    }
                    Button(role: .destructive) { confirmDelete = true } label: {
                        Text("Remove this request")
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .confirmationDialog("Remove this request?", isPresented: $confirmDelete,
                                titleVisibility: .visible) {
                Button("Remove", role: .destructive) { Task { await remove() } }
                Button("Keep it", role: .cancel) { }
            }
        }
    }

    private func save(closed: Bool) async {
        working = true
        defer { working = false }
        struct Ack: Decodable { let updateWorkRequest: IDPayload? }
        _ = await app.load(Mutations.updateWorkRequest,
                           variables: ["id": request.id, "stage": stage,
                                       "needsYou": needsYou, "closed": closed],
                           as: Ack.self)
        onChanged()
        dismiss()
    }

    private func remove() async {
        struct Ack: Decodable { let deleteWorkRequest: Bool }
        _ = await app.load(Mutations.deleteWorkRequest,
                           variables: ["id": request.id], as: Ack.self)
        onChanged()
        dismiss()
    }
}
