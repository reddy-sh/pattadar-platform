import PattadarKit
import SwiftUI

/// What a new — or newly emptied — account sees.
///
/// A grid of zeros is not a starting point, it is a report that something is
/// wrong. Someone who has just installed the app, and someone who has just
/// deleted everything, both need the same thing: what this is for, and the one
/// action that begins it.
struct WelcomeState: View {
    let name: String
    let onScan: () -> Void
    let onManual: () -> Void
    /// Off when the screen above already greets — two Namastes in one
    /// viewport is one too many.
    var showsGreeting = true

    var body: some View {
        VStack(spacing: 18) {
            if showsGreeting {
                Text("🙏").font(.system(size: 54))

                VStack(spacing: 6) {
                    Text(name.isEmpty ? "Namaste" : "Namaste, \(name)")
                        .font(.title2.weight(.semibold))
                    Text("Your land, your records — in one place, and yours alone.")
                        .font(.subheadline).foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            VStack(alignment: .leading, spacing: 14) {
                Step(icon: "doc.viewfinder", tint: .blue,
                     title: "Scan a passbook or a deed",
                     detail: "The survey numbers, extent and village are read for you.")
                Step(icon: "mappin.and.ellipse", tint: .green,
                     title: "Pin where the land actually is",
                     detail: "So it can be found again by someone who has never stood on it.")
                Step(icon: "person.2.fill", tint: .pink,
                     title: "Record who inherits",
                     detail: "Land with no stated succession is the argument that follows.")
            }
            .padding(18)
            .background(RoundedRectangle(cornerRadius: 18).fill(Color(.secondarySystemGroupedBackground)))

            VStack(spacing: 10) {
                Button(action: onScan) {
                    Label("Scan your first document", systemImage: "doc.viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button("Enter the details by hand", action: onManual)
                    .font(.subheadline)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 24)
    }

    private struct Step: View {
        let icon: String
        let tint: Color
        let title: String
        let detail: String

        var body: some View {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon)
                    .font(.title3).foregroundStyle(tint)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.subheadline.weight(.medium))
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// The person's own face wherever they are the subject.
///
/// Their photo already exists on the device; a grey silhouette beside their own
/// name is a smaller thing said worse.
struct Avatar: View {
    let name: String
    var size: CGFloat = 32
    /// Only the account holder has a stored photo; everyone else gets initials.
    var isSelf = false

    var body: some View {
        Group {
            if isSelf, let image = Identity.avatar() {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: size, height: size)
                    .background(Circle().fill(colour))
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: String {
        let letters = name.split(separator: " ").prefix(2).compactMap { $0.first }
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }

    /// Stable per name, so the same person is the same colour everywhere —
    /// including across launches. `hashValue` is seeded per process, which
    /// made the "stable" colour change every time the app opened; summing
    /// the scalars is dull but the same for ever.
    private var colour: Color {
        let palette: [Color] = [.blue, .green, .orange, .pink, .purple, .teal, .indigo]
        let h = name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        return palette[h % palette.count]
    }
}
