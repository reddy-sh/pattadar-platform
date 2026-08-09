import Charts
import MapKit
import PattadarKit
import SwiftUI

/// One kind of holding, totalled.
struct KindSummary: Identifiable {
    let id = UUID()
    let kind: HoldingKind
    /// Already in `kind.unit`.
    let amount: Double
    let count: Int
    /// How many passbooks these are held under. Nought where the kind is not
    /// held under one at all — a flat has no khata.
    let passbooks: Int
}

/// The headline figure for one kind of holding — full width, with a motif
/// that says what it is at a glance.
///
/// Full width because these are the four numbers the app exists to tell you,
/// and a half-width tile makes "1,020 sq. yd" compete with its own label. Each
/// kind carries its own drawn motif rather than an icon: fields for farmland,
/// a surveyed grid for plots, a roofline for homes.
struct KindCard: View {
    let kind: HoldingKind
    let amount: Double
    let count: Int
    let passbooks: Int

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text(kind.label)
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    // Formatted by the same function the detail screens use.
                    // Rounding to whole numbers here turned 418.5 sq. yd into
                    // "419" on the one screen a person checks first.
                    Text(areaText(amount, kind.unit)
                        .replacingOccurrences(of: " " + kind.unit.label, with: ""))
                        .font(.system(size: 40, weight: .bold, design: .rounded))
                        .monospacedDigit().minimumScaleFactor(0.5).lineLimit(1)
                    Text(unitWord).font(.title3).foregroundStyle(.secondary)
                }
                Text(subtitle).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            motif.frame(width: 84, height: 66)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background {
            RoundedRectangle(cornerRadius: 20)
                .fill(LinearGradient(colors: [tint.opacity(0.24), tint.opacity(0.08)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
        }
    }

    /// Drawn rather than an SF Symbol, so farmland reads as furrowed fields and
    /// a plot reads as a surveyed layout — the shapes people actually see on a
    /// site plan.
    @ViewBuilder
    private var motif: some View {
        switch kind {
        case .farmland:
            ZStack {
                Image(systemName: "leaf.fill")
                    .font(.system(size: 52)).foregroundStyle(tint.opacity(0.20))
                // Furrows.
                VStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { _ in
                        Capsule().fill(tint.opacity(0.18)).frame(height: 4)
                    }
                }
                .rotationEffect(.degrees(-14))
                .padding(.horizontal, 6)
            }
        case .plot:
            // A surveyed layout: one plot picked out of a block, the way a
            // site plan shows yours among the others.
            ZStack {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
                    ForEach(0..<6, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(i == 4 ? tint.opacity(0.55) : tint.opacity(0.16))
                            .frame(height: 18)
                    }
                }
                .padding(.horizontal, 6)
            }
        case .home:
            ZStack {
                Image(systemName: "house.fill")
                    .font(.system(size: 46)).foregroundStyle(tint.opacity(0.22))
                RoundedRectangle(cornerRadius: 3)
                    .stroke(tint.opacity(0.30), lineWidth: 2)
                    .frame(width: 62, height: 40)
                    .offset(y: 10)
            }
        case .commercial:
            HStack(alignment: .bottom, spacing: 5) {
                ForEach([26, 44, 34], id: \.self) { h in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(tint.opacity(0.22))
                        .frame(width: 16, height: CGFloat(h))
                }
            }
        }
    }

    private var unitWord: String {
        switch kind.unit {
        case .acre: "acres"
        case .sqyd: "sq. yd"
        case .sqft: "sq. ft"
        default: kind.unit.label
        }
    }

    /// What the figure is made of — and, where it applies, how many passbooks
    /// those are held under.
    ///
    /// The passbook count used to be a tile of its own beside the acreage,
    /// which put "4" on the screen with nothing to say which four acres it
    /// belonged to. Under the figure it is the second half of a sentence: 45
    /// acres, across 12 survey numbers, on 4 khatas.
    ///
    /// No money here. A rupee figure on a dashboard is either a purchase price
    /// from years ago or a guess, and printing a guess in the same breath as a
    /// measured extent lends it the extent's authority.
    private var subtitle: String {
        // "Holding" for farmland: an acre-measured field filed as a property
        // counts here too, and calling it a parcel would be one word wrong.
        let noun = kind == .farmland ? "holding" : "property"
        let plural = count == 1 ? "" : (noun == "property" ? "ies" : "s")
        var parts = ["\(count) \(noun == "property" && count != 1 ? "propert" : noun)\(plural)"]
        if passbooks > 0 {
            parts.append("\(passbooks) passbook\(passbooks == 1 ? "" : "s")")
        }
        return parts.joined(separator: " · ")
    }

    private var tint: Color {
        switch kind {
        case .farmland: .green
        case .plot: .blue
        case .home: .orange
        case .commercial: .purple
        }
    }
}

/// A small figure with its label, sized so four sit two-up without wrapping.
/// The supporting counts, as one row of a single card.
///
/// These were four cards in a 2x2 grid, each the size of an actual holding —
/// which said a count of passbooks matters as much as 45 acres of land, and
/// pushed the favourites and the activity feed off the first screen. A count is
/// a fact you glance at, so it gets a glance's worth of space.
///
/// Tapping does nothing here on purpose: each of these already has a tab of its
/// own, and a second route to the same list is one more thing to keep correct.
struct CountRow: View {
    struct Item: Identifiable {
        let id = UUID()
        let value: String
        let label: String
        let icon: String
        let tint: Color
    }
    let items: [Item]

    var body: some View {
        if !items.isEmpty {
            HStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                    if i > 0 {
                        Divider().frame(height: 34)
                    }
                    VStack(spacing: 4) {
                        Image(systemName: item.icon)
                            .font(.footnote)
                            .foregroundStyle(item.tint)
                        Text(item.value)
                            .font(.title3.weight(.semibold))
                            .monospacedDigit()
                            .contentTransition(.numericText())
                        Text(item.label)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 14)
            .background(RoundedRectangle(cornerRadius: 18)
                .fill(Color(.secondarySystemGroupedBackground)))
        }
    }
}

/// A count, and the way into what it counts.
///
/// These were four tall cards each holding a 20-point icon and two short lines
/// over an inch of empty space — and none of them did anything when tapped. A
/// figure you cannot open is a dead end: it tells you something is there and
/// then refuses to show it to you.
///
/// Three things changed. The row is HALF the height, because a count is a glance
/// and does not need a card the size of a holding. The number and its icon share
/// a baseline instead of stacking. And the whole tile is a button into the list
/// it counts, with a chevron saying so.
struct StatTile: View {
    let value: String
    let label: String
    let icon: String
    let tint: Color
    /// Where tapping goes. Nil renders a plain tile — used only where there is
    /// genuinely nothing to open.
    var destination: AppModel.Tab? = nil
    /// Run before the tab changes, for destinations that need to be told what
    /// to show.
    var onSelect: (() -> Void)? = nil
    /// Shown under the label when there is something worth adding — "why is
    /// this empty" answered in place rather than left as a dash.
    var hint: String? = nil

    @Environment(AppModel.self) private var app

    var body: some View {
        Group {
            if let destination {
                Button { onSelect?(); app.selectedTab = destination } label: { face }
                    .buttonStyle(.plain)
            } else {
                face
            }
        }
    }

    private var isNumeric: Bool { value.contains { $0.isNumber } }

    private var face: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                // A number is set as a number; a state ("Not valued") is set as
                // prose. Rendering words at figure size makes them compete with
                // the counts beside them for the eye that is scanning for
                // quantities.
                Text(value)
                    .font(isNumeric ? .title3.weight(.semibold) : .subheadline.weight(.medium))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .foregroundStyle(isNumeric ? .primary : .secondary)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let hint {
                    Text(hint).font(.caption2).foregroundStyle(.tertiary).lineLimit(2)
                }
            }
            Spacer(minLength: 0)
            if destination != nil {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
        .contentShape(Rectangle())
    }
}

/// Where the land actually is. A list of villages answers "which", a bar chart
/// answers "how much of it is where" — which is the question a portfolio asks.
struct VillageChart: View {
    struct Slice: Identifiable {
        let id = UUID()
        let village: String
        let acres: Double
    }
    let slices: [Slice]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Land by village").font(.headline)
            Chart(slices) { s in
                BarMark(
                    x: .value("Acres", s.acres),
                    y: .value("Village", s.village)
                )
                .foregroundStyle(by: .value("Village", s.village))
                .annotation(position: .trailing) {
                    Text(s.acres, format: .number.precision(.fractionLength(1)))
                        .font(.caption2).monospacedDigit().foregroundStyle(.secondary)
                }
                .cornerRadius(5)
            }
            .chartLegend(.hidden)
            .chartXAxis(.hidden)
            // Height grows with the number of villages so bars never squash to
            // slivers on an account with a dozen of them.
            .frame(height: max(90, CGFloat(slices.count) * 38))
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color(.secondarySystemGroupedBackground)))
    }
}

/// Things that are wrong and can be fixed, before things that merely happened.
struct AttentionCard: View {
    struct Item: Identifiable {
        let id = UUID()
        let text: String
        let icon: String
        let tint: Color
        /// Where the fix is. Every one of these names something a person can
        /// do — a pin to drop, an heir to add — and the card stated the problem
        /// and then left them to find the screen for it themselves.
        var destination: AppModel.Tab? = nil
        /// What the destination should be showing when it opens.
        var filter: HoldingFilter? = nil
        /// Family is presented by the You screen rather than being a tab.
        var opensFamily = false
    }
    let items: [Item]

    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Needs your attention").font(.headline)
            ForEach(items) { item in
                Button {
                    if let f = item.filter { app.holdingsFilter = f }
                    if item.opensFamily { app.openFamily = true }
                    if let d = item.destination { app.selectedTab = d }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: item.icon).foregroundStyle(item.tint)
                        Text(item.text).font(.subheadline).foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                        if item.destination != nil {
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.semibold)).foregroundStyle(.tertiary)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(item.destination == nil)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(.orange.opacity(0.10)))
    }
}


/// Starred holdings, at the top of Home.
struct FavouritesCard: View {
    let items: [Holding]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Favourites", systemImage: "star.fill")
                .font(.headline).foregroundStyle(.primary)
            ForEach(items) { h in
                NavigationLink {
                    switch h {
                    case .parcel(let p, let pb): HoldingDetailScreen(parcel: p, passbook: pb)
                    case .property(let p): PropertyDetailScreen(property: p)
                    }
                } label: {
                    HStack {
                        Image(systemName: h.isAgricultural ? "leaf.fill" : "building.2.fill")
                            .font(.caption).foregroundStyle(h.isAgricultural ? .green : .blue)
                            .frame(width: 18)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(h.title).font(.subheadline.weight(.medium))
                            if !h.village.isEmpty {
                                Text(h.village).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Text(h.extentText).font(.subheadline).monospacedDigit()
                        Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                    }
                }
                .buttonStyle(.plain)
                if h.id != items.last?.id { Divider() }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color(.secondarySystemGroupedBackground)))
    }
}

/// Documents that have been read and are waiting for a person to accept them.
///
/// This is the counterpart to reads that survive the app being closed. Without
/// it a finished reading has nowhere to appear: the notification is gone once
/// dismissed, and the reading itself was never a record. Prominent on purpose —
/// an extraction nobody acts on is an API call and ninety seconds spent for
/// nothing.
struct ReviewCard: View {
    let entries: [ReviewQueue.Entry]
    let onOpen: (ReviewQueue.Entry) -> Void
    let onDiscard: (ReviewQueue.Entry) -> Void
    /// Throwing one away is deliberate: confirmed, never a stray tap.
    @State private var confirmDiscard: ReviewQueue.Entry?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(entries.count == 1 ? "1 document read, waiting for you"
                                     : "\(entries.count) documents read, waiting for you",
                  systemImage: "tray.full.fill")
                .font(.headline)
            Text("Nothing has been saved yet — open one to check what was read and add it.")
                .font(.caption).foregroundStyle(.secondary)

            ForEach(entries) { e in
                HStack(spacing: 12) {
                    // Open and discard are SIBLING buttons, not nested — and
                    // not a swipe: `.swipeActions` only works inside a List,
                    // and this card lives in Home's scroll view, where the
                    // swipe rendered but answered nothing.
                    Button { onOpen(e) } label: {
                        HStack(spacing: 12) {
                            DocumentIcon(docType: (e.fields["doc_type"] as? String) ?? "", size: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(headline(e)).font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary).lineLimit(2)
                                Text(relativeTime(ISO8601DateFormatter().string(from: e.readAt)))
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)

                    Button { confirmDiscard = e } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.red.opacity(0.85))
                            .frame(width: 34, height: 34)
                            .background(Color.red.opacity(0.12), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Discard this reading")
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 18)
            .fill(Color.accentColor.opacity(0.12)))
        .confirmationDialog("Discard this reading?",
                            isPresented: Binding(get: { confirmDiscard != nil },
                                                 set: { if !$0 { confirmDiscard = nil } }),
                            titleVisibility: .visible) {
            Button("Discard", role: .destructive) {
                if let e = confirmDiscard { onDiscard(e) }
                confirmDiscard = nil
            }
            Button("Keep it", role: .cancel) { confirmDiscard = nil }
        } message: {
            Text(confirmDiscard.map { headline($0) } ?? "")
        }
    }

    private func headline(_ e: ReviewQueue.Entry) -> String {
        let h = (e.fields["headline"] as? String) ?? ""
        if !h.isEmpty { return h }
        let type = (e.fields["doc_type"] as? String) ?? ""
        return type.isEmpty ? e.originalName : type
    }
}

/// "Record-ready" — the one question a folder count cannot answer.
///
/// Dark and first, because it is the only card that says whether the papers
/// would survive contact with a bank. The ring is a proportion of CHECKS
/// passed, and the sentence beneath names the holdings that fail and why — a
/// score with no explanation is a number people stop reading.
struct RecordReadyCard: View {
    let score: Int
    let blurb: String
    let blockingCount: Int
    let onAct: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 16) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.14), lineWidth: 7)
                    Circle()
                        .trim(from: 0, to: max(0.02, Double(score) / 100))
                        .stroke(ringColour, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(score)%")
                        .font(.headline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                }
                .frame(width: 84, height: 84)

                VStack(alignment: .leading, spacing: 5) {
                    Text("Record-ready")
                        .font(.system(.headline, design: .serif))
                        .foregroundStyle(.white)
                    Text(blurb)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if blockingCount > 0 {
                Button(action: onAct) {
                    Label("Fix what is blocking", systemImage: "checkmark.shield")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.white.opacity(0.12),
                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(Color(red: 0.15, green: 0.09, blue: 0.10)))
    }

    /// Red while something blocks a sale, amber while it is merely untidy.
    private var ringColour: Color {
        blockingCount > 0 ? Color(red: 0.86, green: 0.35, blue: 0.42)
            : score >= 100 ? .green : .orange
    }
}


/// All of it, on one map — the Home card.
///
/// Pins for every located holding, the surveyed outlines where corners are on
/// file, on hybrid imagery, framed to hold everything. Non-interactive as a
/// preview (a card must not steal the scroll); tapping opens the full map.
struct HomeMapCard: View {
    let holdings: [Holding]

    private var pins: [Holding] { holdings.filter { $0.pin != nil } }
    private var outlined: [Holding] { holdings.filter { !parseBoundary($0.boundary).isEmpty } }

    /// Framed on everything that can be placed: corners and pins together.
    private var region: MKCoordinateRegion? {
        var lats: [Double] = []
        var lngs: [Double] = []
        for h in holdings {
            if let p = h.pin { lats.append(p.latitude); lngs.append(p.longitude) }
            for c in parseBoundary(h.boundary) {
                lats.append(c.latitude); lngs.append(c.longitude)
            }
        }
        guard let latMin = lats.min(), let latMax = lats.max(),
              let lngMin = lngs.min(), let lngMax = lngs.max() else { return nil }
        return MKCoordinateRegion(
            center: .init(latitude: (latMin + latMax) / 2, longitude: (lngMin + lngMax) / 2),
            span: .init(latitudeDelta: max((latMax - latMin) * 1.5, 0.02),
                        longitudeDelta: max((lngMax - lngMin) * 1.5, 0.02)))
    }

    var body: some View {
        if let region {
            NavigationLink {
                PropertiesMap(holdings: holdings)
            } label: {
                Map(initialPosition: .region(region)) {
                    ForEach(pins, id: \.id) { h in
                        if let p = h.pin {
                            Marker("", systemImage: h.kind.icon,
                                   coordinate: .init(latitude: p.latitude, longitude: p.longitude))
                        }
                    }
                    ForEach(outlined, id: \.id) { h in
                        MapPolygon(coordinates: parseBoundary(h.boundary).map {
                            CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
                        })
                        .foregroundStyle(.green.opacity(0.2))
                        .stroke(.green, lineWidth: 2)
                    }
                }
                .mapStyle(.hybrid)
                .allowsHitTesting(false)
                .frame(height: 160)
                .overlay(alignment: .bottomLeading) {
                    // What is NOT on this map yet, said on the map.
                    if pins.count < holdings.count {
                        Text("\(pins.count) of \(holdings.count) pinned")
                            .font(.caption2.weight(.medium))
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(.thinMaterial, in: Capsule())
                            .padding(10)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    Label("Your land", systemImage: "map")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(.thinMaterial, in: Capsule())
                        .padding(10)
                }
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }
}
