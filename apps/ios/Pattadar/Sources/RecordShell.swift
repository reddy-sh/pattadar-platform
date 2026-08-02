import PattadarKit
import SwiftUI

/// The redesigned holding shell — from `Parcel Detail Redesign.dc.html`.
///
/// The handoff's one rule, held throughout: **every fact has exactly one
/// home.** If a value must be visible twice, the second place is a link.
/// The hero carries identity and the readiness ring; the sub-nav filters
/// sections instead of scrolling to them; a missing value is never a dash
/// but a blue action word; and every gap opens a fix sheet offering the
/// same two honest choices — do it yourself, or have Pattadar do it.
///
/// Phase 1 implements the shell, Overview, The record, Documents, People,
/// On the land and Timeline for parcels. Deferred to the next phase, with
/// the backend they need: the Requests tab (agent statuses), Rent/Lease
/// (a tenancy table), and multi-source boundaries (readings with
/// precision and a primary flag).

// MARK: - Hero

/// Identity once, with the verdict beside it.
struct RecordHero: View {
    let kicker: String
    let title: String
    let subtitle: String
    /// Two type-specific facts plus the holder, divided by hairlines.
    let facts: [(label: String, value: String)]
    let readiness: Readiness
    var statusChip: String = ""
    /// Per-kind gradient from the handoff: land maroon, plot slate, flat green.
    var gradient: [Color] = [Color(red: 0.29, green: 0.18, blue: 0.20),
                             Color(red: 0.22, green: 0.15, blue: 0.16)]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    if !kicker.isEmpty {
                        Text(kicker.uppercased())
                            .font(.system(size: 10.5, weight: .semibold))
                            .kerning(1.3)
                            .foregroundStyle(.white.opacity(0.55))
                    }
                    Text(title)
                        .font(.system(size: 32, weight: .semibold, design: .serif))
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if !statusChip.isEmpty {
                        Text(statusChip)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Color.orange.opacity(0.85), in: Capsule())
                            .foregroundStyle(.black)
                            .padding(.top, 2)
                    }
                }
                Spacer(minLength: 0)
                ReadinessRing(score: readiness.score)
            }
            .padding(.bottom, 14)

            Rectangle().fill(.white.opacity(0.12)).frame(height: 1)

            HStack(spacing: 0) {
                ForEach(Array(facts.enumerated()), id: \.offset) { i, fact in
                    if i > 0 {
                        Rectangle().fill(.white.opacity(0.12)).frame(width: 1, height: 30)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(fact.label.uppercased())
                            .font(.system(size: 9.5, weight: .semibold))
                            .kerning(0.8)
                            .foregroundStyle(.white.opacity(0.45))
                        Text(fact.value)
                            .font(.system(size: 13.5, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, i > 0 ? 10 : 0)
                }
            }
            .padding(.top, 12)
        }
        .padding(18)
        .background(LinearGradient(colors: gradient,
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .listRowInsets(EdgeInsets(top: 8, leading: 14, bottom: 4, trailing: 14))
        .listRowBackground(Color.clear)
    }
}

/// The 66-point verdict: share of checks passed, coloured by how bad it is.
struct ReadinessRing: View {
    let score: Int

    private var colour: Color {
        score < 40 ? Color(red: 1.0, green: 0.27, blue: 0.23)
            : score < 75 ? Color(red: 1.0, green: 0.62, blue: 0.04)
            : Color(red: 0.19, green: 0.82, blue: 0.35)
    }

    var body: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.16), lineWidth: 6)
            Circle()
                .trim(from: 0, to: max(0.03, Double(score) / 100))
                .stroke(colour, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(score)%")
                    .font(.system(size: 15, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                Text("ready")
                    .font(.system(size: 8.5, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        .frame(width: 66, height: 66)
        .animation(.easeOut(duration: 0.7), value: score)
    }
}

// MARK: - Sub-navigation

/// Horizontally scrolling chips that FILTER the rendered sections — the
/// handoff is explicit: no scroll-to-anchor.
struct SegChips: View {
    let tabs: [String]
    @Binding var selection: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tabs, id: \.self) { tab in
                    Button {
                        withAnimation(.snappy(duration: 0.2)) { selection = tab }
                    } label: {
                        Text(tab)
                            .font(.system(size: 13, weight: .semibold))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(selection == tab
                                        ? AnyShapeStyle(Color.primary)
                                        : AnyShapeStyle(Color(.secondarySystemGroupedBackground)),
                                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .foregroundStyle(selection == tab
                                             ? AnyShapeStyle(Color(.systemBackground))
                                             : AnyShapeStyle(Color.secondary))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }
}

// MARK: - Needs you

/// What a gap says on its row, and in its sheet. The copy is the handoff's:
/// plain language about why an office cares, no jargon a farmer has to
/// take on faith.
struct FixCopy {
    let sub: String
    let why: String
    let doItMyself: String
    /// Empty when there is nothing an agent can do (litigation).
    let haveItDone: String

    static func forCheck(_ id: String) -> FixCopy {
        switch id {
        case "title":
            FixCopy(sub: "The document that makes it yours",
                    why: "Without the registered deed in the vault, a sale or a loan against this property stops here.",
                    doItMyself: "Scan the deed",
                    haveItDone: "Certified copy from the SRO")
        case "mutation":
            FixCopy(sub: "Still in the seller's name on the revenue record",
                    why: "The pattadar passbook still names the seller. Until the revenue record moves to you, the land is not yours on paper.",
                    doItMyself: "Update the record details",
                    haveItDone: "File the mutation for me")
        case "ec":
            FixCopy(sub: "Shows any loan sitting on the land",
                    why: "An EC shows every loan or claim sitting on this property. Buyers and banks ask for the last 13 years.",
                    doItMyself: "I have an EC — file it",
                    haveItDone: "Get a fresh EC")
        case "tax":
            FixCopy(sub: "Arrears surface at the worst moment — at sale",
                    why: "Missing receipts surface at the worst moment, usually at sale. A year's cist is small; the argument about it is not.",
                    doItMyself: "File a receipt",
                    haveItDone: "Pay and file it for me")
        case "location":
            FixCopy(sub: "Nobody but you knows exactly where this is",
                    why: "Nobody but you knows exactly where this is. A drawn boundary is what protects it from a neighbour's plough or a dumped load of gravel.",
                    doItMyself: "Pin it on the map",
                    haveItDone: "")
        case "registration":
            FixCopy(sub: "How every office finds this property",
                    why: "The document number is how every office finds this property. It is on the first page of the deed.",
                    doItMyself: "Enter the number",
                    haveItDone: "")
        case "litigation":
            FixCopy(sub: "Say what is disputed, so the record is honest",
                    why: "A record that hides its dispute fails at the worst moment. Write down what is contested and by whom.",
                    doItMyself: "Add the details",
                    haveItDone: "")
        default:
            FixCopy(sub: "", why: "", doItMyself: "Fix it", haveItDone: "")
        }
    }
}

/// The gaps, as a card of rows: dot with halo, title, one-line sub, chevron
/// into the fix sheet. Blockers first, red before amber, and the summary in
/// the header.
struct NeedsYouCard: View {
    let readiness: Readiness
    let onFix: (ReadinessCheck) -> Void

    private var ordered: [ReadinessCheck] {
        readiness.failures.sorted { $0.blocking && !$1.blocking }
    }

    private var summary: String {
        let blockers = readiness.blocking.count
        let tidies = readiness.failures.count - blockers
        var parts: [String] = []
        if blockers > 0 { parts.append("\(blockers) blocker\(blockers == 1 ? "" : "s")") }
        if tidies > 0 { parts.append("\(tidies) to tidy") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        Section {
            if ordered.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    Text("Nothing waiting on you right now.")
                        .font(.subheadline)
                }
            } else {
                ForEach(ordered) { check in
                    Button { onFix(check) } label: {
                        HStack(spacing: 12) {
                            Circle()
                                .fill(check.blocking ? Color.red : Color.orange)
                                .frame(width: 10, height: 10)
                                .background(Circle()
                                    .fill((check.blocking ? Color.red : Color.orange).opacity(0.25))
                                    .frame(width: 18, height: 18))
                            VStack(alignment: .leading, spacing: 1) {
                                Text(check.problem)
                                    .font(.system(size: 14.5, weight: .semibold))
                                    .foregroundStyle(.primary)
                                Text(FixCopy.forCheck(check.id).sub)
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        } header: {
            HStack {
                Text("Needs you")
                Spacer()
                if !ordered.isEmpty { Text(summary) }
            }
        }
    }
}

/// The fix sheet: severity, the problem in serif, why it matters in plain
/// language, then the two honest choices.
struct FixSheet: View {
    @Environment(\.dismiss) private var dismiss

    let check: ReadinessCheck
    /// Do it yourself — opens the relevant flow.
    let onSelf: () -> Void
    /// Have Pattadar do it — opens the request flow. Hidden when the copy
    /// has no agent path.
    let onAgent: () -> Void

    private var copy: FixCopy { FixCopy.forCheck(check.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Circle()
                    .fill(check.blocking ? Color.red : Color.orange)
                    .frame(width: 10, height: 10)
                Text(check.blocking ? "Blocks a sale or a loan" : "Worth fixing")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(check.blocking ? .red : .orange)
            }
            Text(check.problem)
                .font(.system(size: 26, weight: .semibold, design: .serif))
                .fixedSize(horizontal: false, vertical: true)
            Text(copy.why)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 10) {
                Button { dismiss(); onSelf() } label: {
                    Text(copy.doItMyself)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .foregroundStyle(.white)
                }
                if !copy.haveItDone.isEmpty {
                    Button { dismiss(); onAgent() } label: {
                        Text("\(copy.haveItDone) · Pattadar agent")
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(Color.accentColor.opacity(0.14),
                                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
            .padding(.top, 6)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

// MARK: - The record

/// A label/value row where a MISSING value is a blue action word, never a
/// dash. "Add" does more than "—" ever said.
struct ActionFact: View {
    let label: String
    let value: String
    /// The blue word shown when the value is empty.
    var actionWord: String = "Add"
    /// Grey one-liner under the value ("still in the seller's name").
    var hint: String = ""
    var onAction: (() -> Void)? = nil

    var body: some View {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        VStack(alignment: .trailing, spacing: 2) {
            LabeledContent(label) {
                if trimmed.isEmpty, let onAction {
                    Button(actionWord) { onAction() }
                        .font(.system(size: 13.5, weight: .semibold))
                } else if !trimmed.isEmpty {
                    Text(trimmed).multilineTextAlignment(.trailing)
                } else {
                    Text("—").foregroundStyle(.tertiary)
                }
            }
            if !hint.isEmpty {
                Text(hint)
                    .font(.system(size: 11.5))
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }
}

// MARK: - Where it is, and what bounds it

/// The whereabouts chain and the four boundaries — the two groups every
/// schedule opens with, in the order the schedule writes them.
///
/// A Telugu deed's షెడ్యూలు begins with the chain of places (district,
/// revenue division, mandal, panchayat, village, survey number) and then the
/// four హద్దులు — తూర్పు first, the traditional order East, South, West,
/// North. Every plot, field and flat has both, deed or no deed; a rental
/// with no paper at all still has a whereabouts and four sides.
struct WhereItIsSection: View {
    /// (label, value) — only non-empty rows render, but the SECTION always
    /// renders: an empty whereabouts is a gap to fix, not a thing to hide.
    let rows: [(String, String)]

    var body: some View {
        let filled = rows.filter { !$0.1.trimmingCharacters(in: .whitespaces).isEmpty }
        if !filled.isEmpty {
            Section("Where it is") {
                ForEach(filled, id: \.0) { label, value in
                    Fact(label: label, value: value)
                }
            }
        }
    }
}

/// The four sides, always shown, bilingual, in the deed's own order.
struct BoundarySides {
    var east = ""
    var south = ""
    var west = ""
    var north = ""

    var isEmpty: Bool { [east, south, west, north].allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty } }

    /// Deed order with the Telugu the paper itself uses.
    var ordered: [(key: String, label: String, value: String)] {
        [("east", "East · తూర్పు", east),
         ("south", "South · దక్షిణం", south),
         ("west", "West · పడమర", west),
         ("north", "North · ఉత్తరం", north)]
    }
}

struct BoundarySidesSection: View {
    let sides: BoundarySides
    /// Present when the schedule can be edited here.
    var onEdit: (() -> Void)? = nil

    var body: some View {
        Section {
            if sides.isEmpty {
                if let onEdit {
                    Button(action: onEdit) {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Add the four boundaries").font(.subheadline.weight(.medium))
                                Text("What abuts each side — the హద్దులు from the deed's schedule")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "square.dashed").foregroundStyle(Color.accentColor)
                        }
                    }
                    .buttonStyle(.plain)
                }
            } else {
                ForEach(sides.ordered, id: \.key) { side in
                    Fact(label: side.label, value: side.value)
                }
                if let onEdit {
                    Button("Edit boundaries", action: onEdit)
                        .font(.subheadline)
                }
            }
        } header: {
            Label("Boundaries · హద్దులు", systemImage: "square.dashed")
        } footer: {
            if !sides.isEmpty {
                Text("What the record says the land abuts, in the schedule's own order. In a partition dispute, these four lines are the argument.")
            }
        }
    }
}

/// Four fields, deed order, saved through whatever write the caller owns.
struct BoundarySidesEditor: View {
    @Environment(\.dismiss) private var dismiss

    @State var sides: BoundarySides
    /// Returns nil on success, or the problem to show.
    let onSave: (BoundarySides) async -> String?

    @State private var saving = false
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    FormRow(label: "East · తూర్పు", text: $sides.east, prompt: "Canal")
                    FormRow(label: "South · దక్షిణం", text: $sides.south, prompt: "Seller's remaining land")
                    FormRow(label: "West · పడమర", text: $sides.west, prompt: "Village boundary")
                    FormRow(label: "North · ఉత్తరం", text: $sides.north, prompt: "Neighbour's land")
                } footer: {
                    Text("As the schedule writes them — తూర్పు first. Names, not directions: \"Ravi Rathamma's land\", \"Ketagudipi to Jagannadhapuram boundary\".")
                }
                if !problem.isEmpty {
                    Section { Text(problem).foregroundStyle(.red).font(.callout) }
                }
                Section {
                    PrimaryButton(title: "Save boundaries", busy: saving, disabled: sides.isEmpty) {
                        Task {
                            saving = true
                            defer { saving = false }
                            if let failure = await onSave(sides) { problem = failure }
                            else { dismiss() }
                        }
                    }
                }
            }
            .navigationTitle("Boundaries")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }
}

// MARK: - Overview pieces

/// Quick actions, as tinted chips.
struct QuickActionsRow: View {
    struct Action: Identifiable {
        let id: String
        let icon: String
        let run: () -> Void
    }
    let actions: [Action]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(actions) { a in
                    Button(action: a.run) {
                        Label(a.id, systemImage: a.icon)
                            .font(.system(size: 13, weight: .semibold))
                            .padding(.horizontal, 13).padding(.vertical, 9)
                            .background(Color.accentColor.opacity(0.13), in: Capsule())
                            .overlay(Capsule().stroke(Color.accentColor.opacity(0.25), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.accentColor)
                }
            }
            .padding(.horizontal, 14)
        }
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
    }
}

/// The counts, one list — what used to be four tiles of zeros.
struct CountsList: View {
    let documents: Int
    let boundaryDrawn: Bool
    let spent: Double
    let onDocuments: () -> Void
    let onBoundary: () -> Void

    var body: some View {
        Section {
            row("Documents", "\(documents)", tint: .primary, action: onDocuments)
            row("Boundary on the map", boundaryDrawn ? "Drawn" : "Not drawn",
                tint: boundaryDrawn ? .green : .orange, action: onBoundary)
            if spent > 0 {
                LabeledContent("Spent on this land") {
                    Text(compactRupees(spent)).monospacedDigit()
                }
            }
        }
    }

    private func row(_ label: String, _ value: String, tint: Color,
                     action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(label).foregroundStyle(.primary)
                Spacer()
                Text(value).foregroundStyle(tint)
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Documents

/// What this type of holding SHOULD have on file and does not — each with
/// why it matters and the way to get it.
struct StillExpectedSection: View {
    struct Expected: Identifiable {
        let id: String
        let name: String
        let why: String
    }
    let missing: [Expected]
    let onGet: (Expected) -> Void

    var body: some View {
        if !missing.isEmpty {
            Section {
                ForEach(missing) { doc in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(doc.name).font(.system(size: 14.5, weight: .semibold))
                            Text(doc.why).font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 8)
                        Button("Get it") { onGet(doc) }
                            .font(.system(size: 13, weight: .semibold))
                            .buttonStyle(.borderless)
                    }
                }
            } header: {
                Text("Still expected")
            } footer: {
                Text("The papers this kind of holding is asked for. File one and it leaves this list.")
            }
        }
    }
}
