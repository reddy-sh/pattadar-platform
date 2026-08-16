import Charts
import MapKit
import PattadarKit
import SwiftUI

// One kind of holding, totalled, is `KindTotal` in PattadarKit — the widget
// draws the same rows, so the type and its arithmetic live where both can
// reach them.

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
            VStack(alignment: .leading, spacing: Space.sm) {
                Text(kind.label)
                    .font(.subheadline).foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: Space.sm) {
                    // Formatted by the same function the detail screens use.
                    // Rounding to whole numbers here turned 418.5 sq. yd into
                    // "419" on the one screen a person checks first.
                    Text(areaText(amount, kind.unit)
                        .replacingOccurrences(of: " " + kind.unit.label, with: ""))
                        .font(.scaled(40, weight: .bold, design: .rounded))
                        .monospacedDigit().minimumScaleFactor(0.5).lineLimit(1)
                    Text(unitWord).font(.title3).foregroundStyle(.secondary)
                }
                Text(subtitle).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            motif.frame(width: 84, height: 66)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.xl)
        .background {
            RoundedRectangle(cornerRadius: Radius.hero)
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
                    .font(.scaled(52)).foregroundStyle(tint.opacity(0.20))
                // Furrows.
                VStack(spacing: Space.sm) {
                    ForEach(0..<3, id: \.self) { _ in
                        Capsule().fill(tint.opacity(0.18)).frame(height: 4)
                    }
                }
                .rotationEffect(.degrees(-14))
                .padding(.horizontal, Space.sm)
            }
        case .plot:
            // A surveyed layout: one plot picked out of a block, the way a
            // site plan shows yours among the others.
            ZStack {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Space.xs), count: 3), spacing: Space.xs) {
                    ForEach(0..<6, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(i == 4 ? tint.opacity(0.55) : tint.opacity(0.16))
                            .frame(height: 18)
                    }
                }
                .padding(.horizontal, Space.sm)
            }
        case .home:
            ZStack {
                Image(systemName: "house.fill")
                    .font(.scaled(46)).foregroundStyle(tint.opacity(0.22))
                RoundedRectangle(cornerRadius: 3)
                    .stroke(tint.opacity(0.30), lineWidth: 2)
                    .frame(width: 62, height: 40)
                    .offset(y: 10)
            }
        case .commercial:
            HStack(alignment: .bottom, spacing: Space.xs) {
                ForEach([26, 44, 34], id: \.self) { h in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(tint.opacity(0.22))
                        .frame(width: 16, height: CGFloat(h))
                }
            }
        }
    }

    // Both of these are the KIND's, not this card's — the widget draws the
    // same rows on the Home Screen and must not invent its own green.
    private var unitWord: String { kind.shortUnit }

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

    private var tint: Color { Palette.tint(for: kind) }
}

/// Starred holdings, at the top of Home.
struct FavouritesCard: View {
    let items: [Holding]

    var body: some View {
        VStack(alignment: .leading, spacing: Space.md) {
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
                            .font(.caption).foregroundStyle(h.isAgricultural ? Palette.Category.farmland : Palette.Category.plot)
                            .frame(width: 18)
                        VStack(alignment: .leading, spacing: Space.hair) {
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
        .padding(Space.lg)
        .background(RoundedRectangle(cornerRadius: Radius.card).fill(Palette.card))
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
        VStack(alignment: .leading, spacing: Space.md) {
            Label(entries.count == 1 ? "1 document read, waiting for you"
                                     : "\(entries.count) documents read, waiting for you",
                  systemImage: "tray.full.fill")
                .font(.headline)
            Text("Nothing has been saved yet — open one to check what was read and add it.")
                .font(.caption).foregroundStyle(.secondary)

            ForEach(entries) { e in
                HStack(spacing: Space.md) {
                    // Open and discard are SIBLING buttons, not nested — and
                    // not a swipe: `.swipeActions` only works inside a List,
                    // and this card lives in Home's scroll view, where the
                    // swipe rendered but answered nothing.
                    Button { onOpen(e) } label: {
                        HStack(spacing: Space.md) {
                            DocumentIcon(docType: (e.fields["doc_type"] as? String) ?? "", size: 34)
                            VStack(alignment: .leading, spacing: Space.hair) {
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
                            .font(.scaled(14, weight: .medium))
                            .foregroundStyle(Palette.danger)
                            .frame(width: 34, height: 34)
                            .background(Palette.danger.opacity(0.12), in: Circle())
                            // The circle stays 34 so the row's rhythm is
                            // unchanged; the TARGET is the platform's 44.
                            .minimumTouchTarget()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Discard this reading")
                }
            }
        }
        .padding(Space.lg)
        .background(RoundedRectangle(cornerRadius: Radius.card)
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
    /// Decided by `PattadarKit` from the checks, not from this card's own
    /// idea of what percentage counts as good. This card used to turn green
    /// only at 100% while a holding's own ring turned green at 75%, so one
    /// record could carry two verdicts at once.
    let verdict: ReadinessVerdict
    let onAct: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg - 2) {
            HStack(alignment: .top, spacing: Space.lg) {
                ZStack {
                    Circle()
                        .stroke(Palette.ruleOnRecord, lineWidth: 7)
                    Circle()
                        .trim(from: 0, to: max(0.02, Double(score) / 100))
                        .stroke(Palette.tint(for: verdict),
                                style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(score)%")
                        .font(.headline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.inkOnRecord)
                }
                .frame(width: 84, height: 84)

                VStack(alignment: .leading, spacing: Space.xs + 1) {
                    Text("Record-ready")
                        .font(.recordTitle)
                        .foregroundStyle(Palette.inkOnRecord)
                    Text(blurb)
                        .font(.bodyCopy)
                        .foregroundStyle(Palette.inkSoftOnRecord)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if blockingCount > 0 {
                // The one action on the app's most important card.
                //
                // It was a white-at-12% panel on a near-black card — 1.4:1
                // against its own background, where a non-text control needs
                // 3:1 — so the only thing saying "button" was the word on it.
                // Filled in the accent, which is what the accent is for.
                Button(action: onAct) {
                    Label("Fix what is blocking", systemImage: "checkmark.shield")
                        .font(.bodyCopy.weight(.semibold))
                        .foregroundStyle(Palette.accentInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, Space.md)
                        .background(Palette.accent,
                                    in: RoundedRectangle(cornerRadius: Radius.control,
                                                         style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(Space.lg + 2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Radius.hero, style: .continuous)
            .fill(Palette.recordDeep))
        .accessibilityElement(children: .contain)
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
                        .foregroundStyle(Palette.success.opacity(0.2))
                        .stroke(Palette.success, lineWidth: 2)
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
                            .padding(.horizontal, Space.sm).padding(.vertical, Space.xs)
                            .background(.thinMaterial, in: Capsule())
                            .padding(Space.md)
                    }
                }
                .overlay(alignment: .bottomTrailing) {
                    Label("Your land", systemImage: "map")
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
                        .background(.thinMaterial, in: Capsule())
                        .padding(Space.md)
                }
                .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            }
            .buttonStyle(.plain)
            // A map is a picture to VoiceOver. Said in words instead: what is
            // on it, and what is not on it yet.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Your land on a map. \(pins.count) of \(holdings.count) holdings pinned.")
            .accessibilityHint("Opens the full map")
        }
    }
}
