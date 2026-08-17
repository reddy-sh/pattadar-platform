import PattadarKit
import SwiftUI

/// The first three screens, shown once.
///
/// What it must NOT do is sell. The person opening this is holding a folder of
/// papers about land that is often the largest thing their family owns, and the
/// only useful thing to say is what this will do with them and what it will not.
/// So the second slide names the limit in the same breath as the promise — a
/// machine reading can be wrong, and nothing is recorded until a human agrees
/// with it — rather than in small print somewhere later.
struct OnboardingScreen: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var index = 0

    private struct Slide {
        let icon: String
        let title: String
        let body: String
    }

    private let slides: [Slide] = [
        Slide(
            icon: "doc.text.magnifyingglass",
            title: "Everything the\nfolder holds.",
            body: "Passbooks, sale deeds, plots and flats — khata numbers, survey numbers, extents and boundaries. The papers in the almirah at home, on the phone in your pocket."),
        Slide(
            icon: "camera.viewfinder",
            title: "Photograph it.\nIt reads itself.",
            body: "A deed or a 1-B is read for you — who sold to whom, how much land, the four boundaries, the prior deed behind it. Twenty survey numbers become twenty entries. Nothing is saved until you have checked it against the paper."),
        Slide(
            icon: "person.2.badge.key",
            title: "So it outlives\nthe folder.",
            body: "Record who inherits what, and every change stays signed and dated. Land is lost more often to a paper nobody could find than to a dispute."),
    ]

    var body: some View {
        ZStack {
            // Deliberately dark and quiet. This is the one screen with nothing
            // of the person's own on it yet.
            LinearGradient(colors: [Palette.record, Palette.recordDeep],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                progress
                    .padding(.top, Space.md)
                    .padding(.horizontal, Space.xxxl)

                // Weighted rather than equal: the block settles a little above
                // centre, which is where the eye goes first. Two Spacers below
                // and one above pinned it to a third of the screen and left a
                // gap under the paragraph big enough to read as a loading
                // failure.
                Spacer(minLength: 0)

                slide(slides[index])
                    .padding(.horizontal, Space.xxxl)
                    .id(index)
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)))

                Spacer(minLength: 0)
                    .frame(maxHeight: 120)

                controls
                    .padding(.horizontal, Space.xxxl)
                    .padding(.bottom, Space.xl)
            }
        }
        // A swipe is what people try first on a screen like this.
        .gesture(DragGesture(minimumDistance: 30).onEnded { drag in
            if drag.translation.width < -40 { advance() }
            else if drag.translation.width > 40, index > 0 {
                withAnimation(Motion.standard()) { index -= 1 }
            }
        })
        .preferredColorScheme(.dark)
    }

    private var progress: some View {
        HStack(spacing: Space.sm) {
            ForEach(0..<slides.count, id: \.self) { i in
                Capsule()
                    .fill(i == index ? Color.accentColor : Palette.ruleOnRecord)
                    .frame(width: i == index ? 22 : 7, height: 7)
            }
        }
        .animation(Motion.standard(), value: index)
    }

    private func slide(_ s: Slide) -> some View {
        VStack(alignment: .leading, spacing: Space.xxl) {
            Image(systemName: s.icon)
                .font(.scaled(26, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: 62, height: 62)
                .background(Color.accentColor,
                            in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))

            Text(s.title)
                // Serif, and only here. A land record is an old kind of
                // document, and the one screen with no data on it can say so.
                .font(.scaled(40, weight: .semibold, design: .serif))
                .foregroundStyle(.white)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)

            Text(s.body)
                .font(.body)
                .foregroundStyle(Palette.inkSoftOnRecord)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var controls: some View {
        HStack(spacing: Space.lg) {
            // Always available. Somebody who wants to get to their records
            // should not have to read three screens first.
            Button("Skip") { finish(startAdding: false) }
                .font(.subheadline)
                .foregroundStyle(Palette.inkSoftOnRecord)

            Button {
                advance()
            } label: {
                Text(isLast ? "Add my first holding" : "Continue")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Space.lg)
                    .background(Color.accentColor, in: Capsule())
            }
        }
    }

    private var isLast: Bool { index == slides.count - 1 }

    private func advance() {
        if isLast { finish(startAdding: true) }
        else { withAnimation(Motion.standard()) { index += 1 } }
    }

    private func finish(startAdding: Bool) {
        Onboarding.markSeen()
        if startAdding {
            // Straight into the thing the last slide offered, rather than to a
            // dashboard of zeros that says nothing about what to do next.
            app.selectedTab = .properties
            app.requestAddHolding = true
        }
        dismiss()
    }
}

/// Whether the introduction has been shown.
///
/// Stored rather than derived from "has no holdings": somebody who deletes their
/// last parcel has not become a new user, and being introduced to the app again
/// at that moment would be insulting.
enum Onboarding {
    private static let key = "pattadar.onboarding.seen"

    static var hasSeen: Bool { UserDefaults.standard.bool(forKey: key) }
    static func markSeen() { UserDefaults.standard.set(true, forKey: key) }
    /// For testing on a device without reinstalling.
    static func reset() { UserDefaults.standard.removeObject(forKey: key) }
}
