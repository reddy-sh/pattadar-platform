import PattadarKit
import SwiftUI

/// Record something that is on the land.
///
/// The kind is chosen first because it decides everything else: a borewell is
/// measured in feet, a motor in horsepower, an electricity connection by its
/// service number and not by any measurement at all. Offering one generic
/// "value" field for all of them is how you end up with "320" and no idea of
/// what.
struct AddFeatureSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let entityType: String
    let entityId: String
    let onSaved: () -> Void

    @State private var category: FeatureCategory = .water
    @State private var label = ""
    @State private var value = ""
    @State private var unit = ""
    @State private var reference = ""
    @State private var vendor = ""
    @State private var condition = ""
    @State private var note = ""
    /// A kind this person invented. Stored as typed and never offered to
    /// anybody else — one owner's "tamarind grove" is not a platform category,
    /// and promoting it to one would put their land in somebody else's list.
    @State private var customCategory = ""
    @State private var usingCustom = false
    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Kind", selection: $category) {
                        ForEach(FeatureCategory.allCases) { c in
                            Label(c.title, systemImage: c.icon).tag(c)
                        }
                    }
                    .pickerStyle(.menu)
                    .disabled(usingCustom)

                    Toggle("Something else", isOn: $usingCustom)
                    if usingCustom {
                        FormRow(label: "Call it", text: $customCategory,
                                prompt: "Tamarind grove, tenant hut…", required: true)
                    }
                } header: {
                    Text("What kind")
                } footer: {
                    Text(usingCustom
                         ? "Your own heading. It stays on your records and is never suggested to anybody else."
                         : "None of these fit? Turn on “Something else” and name it yourself.")
                }

                Section {
                    FormRow(label: "Name", text: $label,
                            prompt: category.examples.first ?? "Borewell", required: true)
                    if !category.examples.isEmpty {
                        // Suggestions, so nobody has to invent a vocabulary and
                        // so two parcels do not call the same thing two names.
                        FlowLayout(spacing: 8) {
                            ForEach(category.examples, id: \.self) { example in
                                Button { label = example } label: {
                                    Text(example)
                                        .font(.caption)
                                        .padding(.horizontal, 10).padding(.vertical, 6)
                                        .background(Color(.tertiarySystemFill), in: Capsule())
                                        .foregroundStyle(.primary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    Text(category.title)
                }

                Section {
                    HStack {
                        TextField("How much", text: $value)
                            .keyboardType(.decimalPad)
                        Picker("Unit", selection: $unit) {
                            Text("—").tag("")
                            ForEach(category.units, id: \.self) { Text($0).tag($0) }
                        }
                        .labelsHidden()
                    }
                    FormRow(label: "Number", text: $reference,
                            prompt: category == .power ? "Service number" : "Reference")
                    FormRow(label: "Who did it", text: $vendor,
                            prompt: "Sai Borewells, Sadasivpet")
                    FormRow(label: "Condition", text: $condition,
                            prompt: "Yields 1.5 inch after summer")
                } header: {
                    Text("Measurement")
                } footer: {
                    Text(category == .water
                         ? "How deep the borewell is, in feet. The figure nobody can recall five years later."
                         : "A measurement, or the number printed on the connection.")
                }

                Section("Anything else") {
                    TextField("Granite, 3 ft, painted white…", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(.red).font(.callout) }
                }

                Section {
                    PrimaryButton(title: "Save", busy: saving,
                                  disabled: label.trimmingCharacters(in: .whitespaces).isEmpty
                                         || (usingCustom && customCategory
                                                .trimmingCharacters(in: .whitespaces).isEmpty)) {
                        Task { await save() }
                    }
                }
            }
            .navigationTitle("Add a feature")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .onChange(of: category) { _, c in
                // The unit list changes with the kind, so a stale unit — "HP"
                // left over from a motor while naming a corner stone — is
                // cleared rather than silently saved.
                if !c.units.contains(unit) { unit = "" }
            }
        }
    }

    private func save() async {
        saving = true
        problem = ""
        defer { saving = false }
        struct Ack: Decodable { let addLandFeature: IDPayload? }
        let vars: [String: any Sendable] = [
            "entityType": entityType, "entityId": entityId,
            // The typed name wins when one was given, so it reads back exactly
            // as it was written.
            "category": usingCustom
                ? customCategory.trimmingCharacters(in: .whitespaces).lowercased()
                : category.rawValue,
            "label": label.trimmingCharacters(in: .whitespaces),
            "value": Double(value.filter { $0.isNumber || $0 == "." }) ?? 0,
            "unit": unit,
            "reference": reference.trimmingCharacters(in: .whitespaces),
            "vendor": vendor.trimmingCharacters(in: .whitespaces),
            "condition": condition.trimmingCharacters(in: .whitespaces),
            "note": note.trimmingCharacters(in: .whitespaces),
        ]
        guard await app.load(Mutations.addLandFeature, variables: vars,
                             as: Ack.self)?.addLandFeature != nil else {
            problem = app.lastFailure ?? "It could not be saved."
            return
        }
        onSaved()
        dismiss()
    }
}
