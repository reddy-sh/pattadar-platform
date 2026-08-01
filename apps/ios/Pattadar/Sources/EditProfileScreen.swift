import PattadarKit
import SwiftUI

/// Change your own name and email.
///
/// There was no way to do this. `me` provisions a row with `name` set to the
/// login id, so anybody whose row had not been edited straight in the database
/// was greeted by their own user id — and a screen called "You" could not change
/// one thing about you.
struct EditProfileScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State var name: String
    @State var email: String
    let onSaved: () -> Void

    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    FormRow(label: "Name", text: $name, prompt: "Your full name")
                    FormRow(label: "Email", text: $email, prompt: "you@example.com")
                        .textInputAutocapitalization(.never)
                } footer: {
                    Text("This is the name shown on your records and in the activity log.")
                }

                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(.red).font(.callout) }
                }

                Section {
                    PrimaryButton(title: "Save", busy: saving,
                                  disabled: name.trimmingCharacters(in: .whitespaces).isEmpty) {
                        Task { await save() }
                    }
                } footer: {
                    // The API leaves an empty field alone rather than blanking
                    // it, and the form says so rather than letting somebody
                    // clear their email by deleting the text.
                    Text("Leaving a field empty keeps what is already stored.")
                }
            }
            .navigationTitle("Your details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func save() async {
        saving = true
        problem = ""
        defer { saving = false }
        struct Ack: Decodable { let updateMe: Me? }
        let vars: [String: any Sendable] = [
            "name": name.trimmingCharacters(in: .whitespaces),
            "email": email.trimmingCharacters(in: .whitespaces),
        ]
        guard await app.load(Mutations.updateMe, variables: vars, as: Ack.self)?.updateMe != nil else {
            problem = app.lastFailure ?? "Your details could not be saved."
            return
        }
        onSaved()
        dismiss()
    }
}
