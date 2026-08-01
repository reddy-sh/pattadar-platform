import SwiftUI

/// A form row whose label does not vanish when the field is filled.
///
/// `TextField("City", text:)` shows "City" as a PLACEHOLDER — it disappears the
/// moment there is a value. After a scan prefilled six fields the form read
/// "Plot 150 · Nallapadu / Nallapadu / Guntur / 200 / 80000" with nothing
/// saying which was which: 200 of what, 80000 of what. That is unreadable
/// exactly when it matters most, because checking the AI's work IS the task.
///
/// The layout is the one iOS Settings uses — label left, value right — so the
/// label is permanent and the row stays scannable.
struct FormRow: View {
    let label: String
    @Binding var text: String
    var prompt: String = ""
    var keyboard: UIKeyboardType = .default
    /// Shown after the value: "Sq.yd", "₹". A number with no unit is a number
    /// you cannot check.
    var suffix: String = ""
    var required: Bool = false

    var body: some View {
        LabeledContent {
            HStack(spacing: 4) {
                TextField(prompt.isEmpty ? label : prompt, text: $text)
                    .multilineTextAlignment(.trailing)
                    .keyboardType(keyboard)
                if !suffix.isEmpty {
                    Text(suffix).foregroundStyle(.secondary)
                }
            }
        } label: {
            HStack(spacing: 2) {
                Text(label)
                if required && text.trimmingCharacters(in: .whitespaces).isEmpty {
                    Text("*").foregroundStyle(.red)
                }
            }
        }
    }
}

/// The primary action of a sheet, at the size a primary action deserves.
///
/// A plain `Button` in a Form section renders as small blue text — the same
/// weight as a link — for the one control that commits the record.
struct PrimaryButton: View {
    let title: String
    var busy = false
    var disabled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Spacer()
                if busy { ProgressView().tint(.white); Spacer().frame(width: 8) }
                Text(title).fontWeight(.semibold)
                Spacer()
            }
            .padding(.vertical, 6)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(disabled || busy)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowBackground(Color.clear)
    }
}
