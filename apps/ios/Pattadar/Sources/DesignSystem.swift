import PattadarKit
import SwiftUI

/// The one place colour, type, radius and space are decided.
///
/// Before this file every screen invented its own answer: fifteen corner radii,
/// seven off-grid padding values, three readiness colour scales, and a brand
/// colour written out as `Color(red: 0.29, green: 0.18, blue: 0.20)` in six
/// different files. None of them disagreed on purpose — they disagreed because
/// there was nothing to agree with.
///
/// The palette is the platform's, taken from `design.md` at the repository root
/// so that the phone and the web say the same thing in the same colours. The
/// web is dark by default; a phone follows the person's own setting, so every
/// token here carries BOTH appearances and resolves at read time.

// MARK: - Colour

/// A colour that answers differently in light and dark, declared once.
///
/// `Color(light:dark:)` rather than an asset catalogue entry: an asset is
/// invisible from the source that uses it, and the whole point of this file is
/// that the values are readable next to the reasoning for them.
extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}

/// Every colour the app is allowed to use.
///
/// Values are `design.md`'s: the dark column is the canonical web theme, the
/// light column its warm-tinted derivation. Contrast ratios in the comments are
/// against the surface the token is meant to sit on, and were computed, not
/// guessed — the ones that failed are why this file exists.
enum Palette {
    // MARK: Surfaces

    /// Behind everything. Warm rather than the platform's blue-grey, because
    /// the brand's paper is warm and a cool ground under warm cards reads as a
    /// mistake rather than a choice.
    static let ground = Color(light: 0xF2EEE8, dark: 0x0D0504)
    /// A card, a sheet, a raised row.
    static let card = Color(light: 0xFDFCF9, dark: 0x170C09)
    /// A card ON a card — a chip inside a panel, a nested well.
    static let cardRaised = Color(light: 0xF7F4EF, dark: 0x241714)
    /// The dark surface the record heroes are drawn on, in BOTH appearances.
    /// A holding's head is a printed record; it does not turn white by day.
    static let record = Color(light: 0x241714, dark: 0x1C110E)
    static let recordDeep = Color(light: 0x1A0F0D, dark: 0x120907)

    // MARK: Ink

    static let ink = Color(light: 0x261D1A, dark: 0xF3EDE7)
    /// Supporting text. 6.35:1 on light ground, 7.1:1 on dark.
    static let inkSoft = Color(light: 0x615956, dark: 0xBFB5AE)
    /// The quietest text that is still text. Never smaller than `.label`.
    static let inkFaint = Color(light: 0x7D736F, dark: 0x9A8F89)
    /// Ink ON the record surfaces, which are dark in both appearances.
    static let inkOnRecord = Color(white: 1)
    /// Supporting ink on a record surface. 0.45 white measured 3.8:1 on the
    /// hero gradient and failed AA at 9.5pt; this is the value that passes.
    static let inkSoftOnRecord = Color(white: 1).opacity(0.72)

    // MARK: Rules

    static let rule = Color(light: 0xE3DDD8, dark: 0x312622)
    static let ruleStrong = Color(light: 0xC9C0B9, dark: 0x54433E)
    /// A hairline on a record surface — visible, but not a border.
    static let ruleOnRecord = Color(white: 1).opacity(0.18)

    // MARK: Status

    /// The brand amber, and the app's one interactive colour. Also the
    /// attention colour: in a records app the thing that needs you IS the
    /// primary action, so pointing at it in the accent is honest rather than a
    /// collision. What was a collision — categories in the same orange — is
    /// fixed by moving the categories off it entirely (see `tint(for:)`).
    static let accent = Color(light: 0xAA5910, dark: 0xFE860F)
    /// Text on an amber fill. 8.11:1 against the dark amber.
    static let accentInk = Color(light: 0xFFFFFF, dark: 0x180600)
    /// A wash of amber, for the surface of an attention card.
    static let accentWash = Color(light: 0xAA5910, dark: 0xFE860F).opacity(0.12)

    static let danger = Color(light: 0xBE222A, dark: 0xFF5453)
    static let success = Color(light: 0x27762F, dark: 0x61C568)
    /// Between fine and broken. Distinct from `accent` by being redder, so an
    /// amber CTA and an amber warning are not the same swatch.
    static let caution = Color(light: 0xB5560A, dark: 0xF08A32)

    // MARK: Category

    /// What a holding IS, never how urgent it is.
    ///
    /// Categories were farmland-green / plot-blue / home-**orange** /
    /// commercial-purple, while orange was simultaneously the warning colour —
    /// so a house card and a problem card were the same hue. Hue now carries
    /// category and saturation carries urgency: these are muted earths, drawn
    /// at low opacity behind a motif that already says what the thing is, and
    /// none of them is a status colour.
    enum Category {
        static let farmland = Color(light: 0x4F6B33, dark: 0x8DAE63)
        static let plot = Color(light: 0x3F5C6B, dark: 0x84A8BC)
        static let home = Color(light: 0x8A4A31, dark: 0xC58367)
        static let commercial = Color(light: 0x5E4467, dark: 0xA688B0)
    }

    /// What colour a kind of holding is drawn in.
    static func tint(for kind: HoldingKind) -> Color {
        switch kind {
        case .farmland: Category.farmland
        case .plot: Category.plot
        case .home: Category.home
        case .commercial: Category.commercial
        }
    }

    /// The ONE place a readiness verdict becomes a colour. `PattadarKit` owns
    /// the verdict itself, so a screen cannot invent its own cutoffs again.
    static func tint(for verdict: ReadinessVerdict) -> Color {
        switch verdict {
        case .blocked: danger
        case .untidy: caution
        case .ready: success
        }
    }

    /// Faces in a list. Drawn from the same earths as the categories, so a row
    /// of avatars sits inside the palette instead of beside it — the old
    /// seven-colour system rainbow (blue, green, orange, pink, purple, teal,
    /// indigo) belonged to no part of this app.
    static let avatars: [Color] = [
        Color(light: 0x4F6B33, dark: 0x6E8C4A),
        Color(light: 0x3F5C6B, dark: 0x5A8095),
        Color(light: 0x8A4A31, dark: 0xA9654A),
        Color(light: 0x5E4467, dark: 0x7D6289),
        Color(light: 0x7A5A22, dark: 0x9C7A3A),
        Color(light: 0x2F6357, dark: 0x4C8A7C),
    ]
}

// MARK: - Type

/// A system font at an exact size that still answers Dynamic Type.
///
/// `Font.system(size:)` is frozen: it ignores the text-size setting entirely,
/// and the app had eighty-one of them with no `relativeTo:` anywhere — so at
/// accessibility sizes nothing grew. `UIFontMetrics` is the piece it is
/// missing; SwiftUI re-evaluates a body when the content size category
/// changes, so the scaled value is recomputed with it.
/// It returns a `Font` rather than being a view modifier on purpose: it drops
/// in exactly where `.system(size:)` stood, so `Text`-only chains (`.kerning`,
/// `.monospacedDigit`) and `Canvas` draws keep compiling.
///
/// Sizes are floored at 11 points. The app had twenty-three runs of text
/// between 8.5 and 10.5 — a kerned 8.5pt "ready" under a percentage, a 9.5pt
/// badge on a document row — below what the platform considers legible before
/// anybody has changed a setting.
extension Font {
    static func scaled(_ size: CGFloat,
                       weight: Font.Weight = .regular,
                       design: Font.Design = .default) -> Font {
        .system(size: UIFontMetrics.default.scaledValue(for: max(11, size)),
                weight: weight, design: design)
    }
}

/// The named roles. Six, and every screen picks from them.
///
/// The app had three type systems running at once — serif display in ten files,
/// `.rounded` for exactly one figure on the dashboard, and stock SF for
/// everything else — with no rule saying which belonged where. Serif is the
/// register of a printed record, so it carries identity: the greeting, a
/// holding's name, a section that names a thing you own. Everything else is the
/// platform's own face, which is what the platform's own controls are drawn in.
extension Font {
    /// A holding's name, the greeting — the one line a screen is about.
    static let recordDisplay = Font.system(.largeTitle, design: .serif).weight(.semibold)
    /// A card's or a sheet's title, in the same register one step down.
    static let recordTitle = Font.system(.title2, design: .serif).weight(.semibold)
    /// A section head inside a screen.
    static let sectionHead = Font.headline
    /// A figure meant to be read as a quantity. Tabular, so a column of them
    /// lines up and a changing one does not jitter.
    static let figure = Font.system(.title, design: .rounded).weight(.bold).monospacedDigit()
    /// Body copy on a card.
    static let bodyCopy = Font.subheadline
    /// A supporting line under body copy.
    static let note = Font.caption
    /// An uppercase kerned label over a value. The smallest type in the app,
    /// and it stops here — `.caption2` is 11 points, which is the floor.
    static let label = Font.caption2.weight(.semibold)
}

// MARK: - Metric

/// Four radii. The app had fifteen, led by 14 (twenty-four uses), 16
/// (eighteen) and 18 (nine) — three values doing one job, which reads as
/// three different card systems rather than one.
enum Radius {
    /// A control, a chip, a small well.
    static let control: CGFloat = 10
    /// A card. The default.
    static let card: CGFloat = 16
    /// A hero, a sheet, the largest thing on a screen.
    static let hero: CGFloat = 22
}

/// The 4-point scale, named. `14` was the most common padding value in the app
/// (twenty-nine uses) and is not on any grid; so were 13, 11, 9, 7, 5 and 3.
enum Space {
    /// The one sub-grid step, and it is leading rather than layout: the gap
    /// between a label and the value directly under it, which is set as one
    /// block of type and not as two stacked elements. Never use it as padding
    /// around a container.
    static let hair: CGFloat = 2
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
    static let xxxl: CGFloat = 32
}

// MARK: - Motion

/// One easing and two durations, and both of them stop when the person has
/// asked for less movement.
///
/// Reduce Motion was unhandled everywhere: a 0.7-second ring sweep on every
/// holding screen and snappy filter transitions in the vault, with no check for
/// the setting anywhere in the app.
enum Motion {
    static let quick: Double = 0.22
    static let considered: Double = 0.4

    /// The app's animation, or none at all when movement has been turned down.
    @MainActor
    static func standard(_ duration: Double = quick) -> Animation? {
        UIAccessibility.isReduceMotionEnabled
            ? nil
            : .timingCurve(0.2, 0.8, 0.2, 1, duration: duration)
    }
}

// MARK: - Surfaces

extension View {
    /// A card: the app's default container for a unit of content.
    func cardSurface(_ radius: CGFloat = Radius.card, fill: Color = Palette.card) -> some View {
        background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
    }

    /// The warm ground behind a screen's content, replacing the platform's
    /// blue-grey grouped background.
    func screenGround() -> some View {
        background(Palette.ground)
    }

    /// The smallest a control is allowed to be. Apple's floor is 44 points and
    /// the app had discard buttons at 34 and map handles at 24 — targets that
    /// are missable for anyone whose hands are not steady.
    func minimumTouchTarget() -> some View {
        frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
    }
}
