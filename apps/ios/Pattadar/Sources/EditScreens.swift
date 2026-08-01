import PattadarKit
import SwiftUI

/// Correct a parcel.
///
/// The server takes every field as optional and writes only what is sent, so a
/// screen that edits six fields cannot blank the twenty it does not show.
struct EditParcelScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let parcel: Parcel
    let onSaved: () -> Void

    @State private var surveyNo = ""
    @State private var subdivision = ""
    @State private var extent = ""
    @State private var unit: UnitKey = .acre
    @State private var classification = "agri"
    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    FormRow(label: "Survey number", text: $surveyNo, required: true)
                    FormRow(label: "Sub-division", text: $subdivision)
                    LabeledContent("Extent") {
                        HStack(spacing: 6) {
                            TextField("0", text: $extent)
                                .multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                            Picker("", selection: $unit) {
                                ForEach(UnitKey.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                            .labelsHidden().frame(width: 116)
                        }
                    }
                    Picker("Classification", selection: $classification) {
                        Text("Agricultural").tag("agri")
                        Text("Non-agricultural").tag("non-agri")
                    }
                    .pickerStyle(.segmented)
                }
                if !problem.isEmpty { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
                Section {
                    PrimaryButton(title: "Save changes", busy: saving,
                                  disabled: surveyNo.isEmpty || (Double(extent) ?? 0) <= 0) {
                        Task { await save() }
                    }
                }
            }
            .navigationTitle("Edit parcel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                surveyNo = parcel.surveyNo
                subdivision = parcel.subdivision
                // Stored acres shown in the unit it was filed under, so the
                // number the user sees is the number they entered.
                unit = unitKey(parcel.unit)
                extent = String(format: "%g", fromAcres(parcel.extent, unit))
                classification = parcel.classification
            }
        }
    }

    private func save() async {
        saving = true; problem = ""
        defer { saving = false }
        struct Ack: Decodable { let updateParcel: IDPayload? }
        let vars: [String: any Sendable] = [
            "id": parcel.id, "surveyNo": surveyNo, "subdivision": subdivision,
            "extent": toAcres(Double(extent) ?? 0, unit), "unit": unit.label,
            "classification": classification,
        ]
        if await app.load(Mutations.updateParcel, variables: vars, as: Ack.self) == nil {
            problem = app.lastFailure ?? "Couldn’t save the changes."
            return
        }
        onSaved(); dismiss()
    }
}

struct EditPropertyScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let property: Property
    let onSaved: () -> Void

    @State private var label = ""
    @State private var city = ""
    @State private var locality = ""
    @State private var district = ""
    @State private var landArea = ""
    @State private var price = ""
    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    FormRow(label: "Name", text: $label, required: true)
                    FormRow(label: "Village / town", text: $city)
                    FormRow(label: "Mandal", text: $locality)
                    FormRow(label: "District", text: $district)
                    FormRow(label: "Land area", text: $landArea, keyboard: .decimalPad, suffix: "Sq.yd")
                    FormRow(label: "Purchase price", text: $price, keyboard: .numberPad, suffix: "₹")
                }
                if !problem.isEmpty { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
                Section {
                    PrimaryButton(title: "Save changes", busy: saving,
                                  disabled: label.trimmingCharacters(in: .whitespaces).isEmpty) {
                        Task { await save() }
                    }
                }
            }
            .navigationTitle("Edit property")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                label = property.label
                city = property.city
                locality = property.locality
                district = property.district
                // Stored verbatim in landUnit, so it is shown and saved
                // verbatim. Round-tripping it through acres was a 4,840x
                // error on every edit.
                landArea = property.landArea > 0 ? String(format: "%g", property.landArea) : ""
            }
        }
    }

    private func save() async {
        saving = true; problem = ""
        defer { saving = false }
        struct Ack: Decodable { let updateProperty: IDPayload? }
        let vars: [String: any Sendable] = [
            "id": property.id, "label": label, "locality": locality, "city": city, "district": district,
            "landArea": Double(landArea) ?? 0,
            "purchasePrice": Double(price) ?? 0,
        ]
        if await app.load(Mutations.updateProperty, variables: vars, as: Ack.self) == nil {
            problem = app.lastFailure ?? "Couldn’t save the changes."
            return
        }
        onSaved(); dismiss()
    }
}

/// Correct a passbook. There was no way to do this at all — a passbook scanned
/// with a misread owner could only be deleted, which takes its parcels too.
struct EditPassbookScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let passbook: PassbookDetail
    let onSaved: () -> Void

    @State private var pattadarNo = ""
    @State private var ownerName = ""
    @State private var fatherName = ""
    @State private var state = ""
    @State private var district = ""
    @State private var mandal = ""
    @State private var village = ""
    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Passbook") {
                    FormRow(label: "Pattadar no.", text: $pattadarNo, required: true)
                    FormRow(label: "Owner", text: $ownerName)
                    FormRow(label: "Father / husband", text: $fatherName)
                    FormRow(label: "Village", text: $village)
                    FormRow(label: "Mandal", text: $mandal)
                    FormRow(label: "District", text: $district)
                    FormRow(label: "State", text: $state)
                }
                if !problem.isEmpty { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
                Section {
                    PrimaryButton(title: "Save changes", busy: saving,
                                  disabled: pattadarNo.trimmingCharacters(in: .whitespaces).isEmpty) {
                        Task { await save() }
                    }
                }
            }
            .navigationTitle("Edit passbook")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                pattadarNo = passbook.pattadarNo; ownerName = passbook.ownerName
                fatherName = passbook.fatherHusbandName; state = passbook.state
                district = passbook.district; mandal = passbook.mandal; village = passbook.village
            }
        }
    }

    private func save() async {
        saving = true; problem = ""
        defer { saving = false }
        struct Ack: Decodable { let updatePassbook: IDPayload? }
        let vars: [String: any Sendable] = [
            "id": passbook.id, "pattadarNo": pattadarNo, "ownerName": ownerName,
            "fatherHusbandName": fatherName, "state": state,
            "district": district, "mandal": mandal, "village": village,
        ]
        if await app.load(Mutations.updatePassbook, variables: vars, as: Ack.self) == nil {
            problem = app.lastFailure ?? "Couldn’t save the changes."
            return
        }
        onSaved(); dismiss()
    }
}

/// Create or rename a group.
///
/// `updateGroup` takes name AND description positionally, so both are always
/// sent — omitting description would erase it.
struct EditGroupScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    /// nil = creating a new one.
    let group: FamilyGroup?
    let onSaved: () -> Void

    @State private var name = ""
    @State private var note = ""
    @State private var type = "family"
    @State private var saving = false
    @State private var problem = ""

    private let types = [("family", "Family"), ("partnership", "Partnership"),
                         ("company", "Company"), ("huf", "HUF"), ("trust", "Trust")]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if group == nil {
                        Picker("Type", selection: $type) {
                            ForEach(types, id: \.0) { Text($0.1).tag($0.0) }
                        }
                    }
                    FormRow(label: "Name", text: $name, prompt: "Telukutla family", required: true)
                    FormRow(label: "Note", text: $note, prompt: "Optional")
                }
                if !problem.isEmpty { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
                Section {
                    PrimaryButton(title: group == nil ? "Create group" : "Save changes",
                                  busy: saving,
                                  disabled: name.trimmingCharacters(in: .whitespaces).isEmpty) {
                        Task { await save() }
                    }
                }
            }
            .navigationTitle(group == nil ? "New group" : "Edit group")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear {
                if let g = group { name = g.name; note = g.description; type = g.type }
            }
        }
    }

    private func save() async {
        saving = true; problem = ""
        defer { saving = false }
        struct MadeGroup: Decodable { let createGroup: IDPayload? }
        struct EditedGroup: Decodable { let updateGroup: IDPayload? }
        let ok: Bool
        if let g = group {
            ok = await app.load(Mutations.updateGroup,
                                variables: ["id": g.id, "n": name, "d": note],
                                as: EditedGroup.self) != nil
        } else {
            ok = await app.load(Mutations.createGroup,
                                variables: ["t": type, "n": name, "d": note],
                                as: MadeGroup.self) != nil
        }
        guard ok else {
            problem = app.lastFailure ?? "Couldn’t save the group."
            return
        }
        onSaved(); dismiss()
    }
}

/// Add someone to a group. The 25-argument mutation is the API's shape; the
/// form asks for the five things that matter and sends defaults for the rest.
struct AddMemberScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    let groupID: String
    let onSaved: () -> Void

    @State private var name = ""
    @State private var relation = ""
    @State private var phone = ""
    @State private var isHeir = false
    @State private var share = ""
    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Person") {
                    FormRow(label: "Name", text: $name, prompt: "Full name", required: true)
                    FormRow(label: "Relation", text: $relation, prompt: "Son, wife, brother…")
                    FormRow(label: "Phone", text: $phone, prompt: "10 digits", keyboard: .phonePad)
                }
                Section {
                    Toggle("Records an inheritance share", isOn: $isHeir)
                    if isHeir {
                        FormRow(label: "Share", text: $share, prompt: "0", keyboard: .decimalPad, suffix: "%")
                    }
                } footer: {
                    // The server REFUSES a beneficiary with no way to reach
                    // them — an heir who cannot be contacted cannot confirm
                    // they accept. Saying so here beats a round trip that
                    // fails with the same sentence.
                    Text(isHeir
                         ? "An heir's share is what the estate allocation divides; shares across a group should total 100%. A phone number is required — an heir has to be reachable to confirm they accept."
                         : "An heir's share is what the estate allocation divides. Shares across a group should total 100%.")
                }
                if !problem.isEmpty { Section { Text(problem).foregroundStyle(.red).font(.callout) } }
                Section {
                    PrimaryButton(title: "Add member", busy: saving,
                                  disabled: name.trimmingCharacters(in: .whitespaces).isEmpty
                                            || (isHeir && phone.trimmingCharacters(in: .whitespaces).isEmpty)) {
                        Task { await save() }
                    }
                }
            }
            .navigationTitle("Add member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func save() async {
        saving = true; problem = ""
        defer { saving = false }
        struct Added: Decodable { let addMember: IDPayload? }
        let vars: [String: any Sendable] = [
            "groupId": groupID, "name": name, "relation": relation, "role": "Member",
            "gender": "", "dob": "", "phone": phone, "email": "", "bio": "", "photo": "",
            "fatherId": "", "motherId": "", "spouseId": "",
            "isBeneficiary": isHeir, "sharePct": isHeir ? (Double(share) ?? 0) : 0,
            "kind": "", "parcelId": "", "presentAddress": "",
            // Aadhaar is never collected here: an ID number typed into a form
            // that does not need it is a liability, not a feature.
            "aadhaar": "", "guardianName": "", "guardianContact": "",
            "maritalStatus": "", "spouseName": "", "spouseContact": "", "spouseStatus": "",
        ]
        if await app.load(Mutations.addMember, variables: vars, as: Added.self) == nil {
            problem = app.lastFailure ?? "Couldn’t add them."
            return
        }
        onSaved(); dismiss()
    }
}
