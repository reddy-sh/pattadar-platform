import PattadarKit
import SwiftUI
import UIKit

/// The FMB sheet, turned into a map you can measure (Vault Maps Design).
///
/// Everything drawn here was DERIVED on the server from the sheet's own
/// corner table — this view computes nothing except unit conversion (§13).
/// Fit, not zoom: one scale factor, north up, equal scale on both axes —
/// never stretch a parcel to fill a card (§4).
struct FMBMapSection: View {
    let geometry: FMBGeometry

    /// One toggle, metres ⇄ feet, governing every length on screen at once.
    /// Per user, not per document — someone who thinks in feet thinks in
    /// feet everywhere (§5).
    @AppStorage("pattadar.maps.lengthUnit") private var unitRaw = LengthUnit.metres.rawValue
    /// Single selection, amber; tapping empty map clears back to the parcel
    /// summary (§10).
    @State private var selection: Selection = .parcel
    @State private var copiedCorner = false

    enum Selection: Equatable {
        case parcel
        case side(String)
        case corner(Int)
    }

    private var unit: LengthUnit {
        get { LengthUnit(rawValue: unitRaw) ?? .metres }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            map
                .aspectRatio(1.05, contentMode: .fit)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .sensoryFeedback(.selection, trigger: selection)

            // Unit toggle in thumb reach, directly under the map (§10).
            HStack(spacing: 10) {
                Picker("Unit", selection: Binding(
                    get: { unit },
                    set: { unitRaw = $0.rawValue; })) {
                    Text("m").tag(LengthUnit.metres)
                    Text("ft").tag(LengthUnit.feet)
                }
                .pickerStyle(.segmented)
                .frame(width: 110)
                Spacer(minLength: 0)
                if geometry.orderSource == "inferred" {
                    Label("Corner order inferred — confirm against the sheet",
                          systemImage: "exclamationmark.triangle.fill")
                        .font(.caption2).foregroundStyle(.orange)
                }
            }

            tipPanel
            areaCheck

            if !geometry.datumStated {
                // §2: a sheet that names no datum gets a caution, never a
                // silent overlay on satellite imagery.
                Text("Datum unstated on the sheet — placement on imagery is approximate.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - The map (§4)

    private var map: some View {
        GeometryReader { proxy in
            let layout = MapLayout(geometry: geometry, size: proxy.size)
            ZStack(alignment: .topTrailing) {
                Canvas { ctx, _ in
                    draw(in: &ctx, layout: layout)
                }
                // Always on screen: north arrow and a scale bar whose caption
                // restates the active unit — a map without a scale bar
                // cannot be trusted (§4).
                VStack(alignment: .trailing, spacing: 6) {
                    Image(systemName: "location.north.fill")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.secondary)
                        .overlay(alignment: .bottom) {
                            Text("N").font(.system(size: 8, weight: .bold))
                                .foregroundStyle(.secondary).offset(y: 11)
                        }
                        .padding(.bottom, 8)
                }
                .padding(12)
                scaleBar(layout: layout)
                    .padding(12)
                    .frame(maxWidth: .infinity, maxHeight: .infinity,
                           alignment: .bottomLeading)
            }
            .contentShape(Rectangle())
            .onTapGesture { location in
                select(at: location, layout: layout)
            }
        }
    }

    private func draw(in ctx: inout GraphicsContext, layout: MapLayout) {
        let ring = layout.screenRing
        guard ring.count >= 3 else { return }

        // Layer order (§4): parcel fill → sides → measured lines → corner
        // markers → labels. Colour carries meaning: cyan parcel, red for
        // corners and measured-not-walked lines, amber selection — nothing
        // else (§4).
        var fill = Path()
        fill.addLines(ring)
        fill.closeSubpath()
        ctx.fill(fill, with: .color(.cyan.opacity(0.14)))

        for side in geometry.sides {
            guard let a = layout.screen[side.from], let b = layout.screen[side.to] else { continue }
            var path = Path()
            path.move(to: a)
            path.addLine(to: b)
            let isSelected = selection == .side(side.id)
            let colour: Color = isSelected ? .orange : (side.isMeasuredOnly ? .red : .cyan)
            ctx.stroke(path, with: .color(colour),
                       lineWidth: isSelected ? 3 : 2)
        }

        for point in geometry.ringPoints {
            guard let p = layout.screen[point.id] else { continue }
            let isSelected = selection == .corner(point.id)
            let r: CGFloat = isSelected ? 6 : 4
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r,
                                            width: r * 2, height: r * 2)),
                     with: .color(isSelected ? .orange : .red))
            // The point ID sits 15px outward (§4).
            let out = layout.outward(from: point.id, distance: 15)
            ctx.draw(Text("\(point.id)").font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.secondary),
                     at: out)
        }

        // Side labels at the midpoint, pushed 11px along the outward normal,
        // rotated to the side's angle and flipped past ±90° so text never
        // reads upside down; suppressed under ~40px (§4).
        for side in geometry.sides {
            guard let a = layout.screen[side.from], let b = layout.screen[side.to] else { continue }
            let lengthOnScreen = hypot(b.x - a.x, b.y - a.y)
            guard lengthOnScreen >= 40 else { continue }
            let mid = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
            let normal = layout.outwardNormal(of: side)
            let at = CGPoint(x: mid.x + normal.dx * 11, y: mid.y + normal.dy * 11)
            var angle = atan2(b.y - a.y, b.x - a.x)
            if angle > .pi / 2 { angle -= .pi }
            if angle < -.pi / 2 { angle += .pi }
            var text = ctx
            text.translateBy(x: at.x, y: at.y)
            text.rotate(by: .radians(angle))
            text.draw(Text(mapLengthText(side.m, unit: unit))
                        .font(.system(size: 10, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(side.isMeasuredOnly ? Color.red : Color.primary),
                      at: .zero)
        }
    }

    private func scaleBar(layout: MapLayout) -> some View {
        // A round number in the ACTIVE unit spanning roughly a quarter of
        // the map, 1–2–5 stepped.
        let targetMetres = layout.metresPerPoint * layout.size.width * 0.25
        let inUnit = unit == .metres ? targetMetres : targetMetres * LengthUnit.feetPerMetre
        let nice = niceRound(inUnit)
        let metres = unit == .metres ? nice : nice / LengthUnit.feetPerMetre
        let widthPt = metres / layout.metresPerPoint
        return VStack(alignment: .leading, spacing: 2) {
            Rectangle().fill(Color.primary.opacity(0.7))
                .frame(width: max(24, widthPt), height: 2)
            Text("\(Int(nice)) \(unit.label)")
                .font(.system(size: 9, weight: .semibold)).monospacedDigit()
                .foregroundStyle(.secondary)
        }
    }

    private func niceRound(_ value: Double) -> Double {
        guard value > 0 else { return 1 }
        let magnitude = pow(10, floor(log10(value)))
        let base = value / magnitude
        let step: Double = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10
        return step * magnitude
    }

    // MARK: - Selection (§10)

    private func select(at location: CGPoint, layout: MapLayout) {
        // The touch target, not the dot, is what must clear 44px (§4) — an
        // invisible hit circle around every corner first, then the sides.
        for point in geometry.ringPoints {
            guard let p = layout.screen[point.id] else { continue }
            if hypot(p.x - location.x, p.y - location.y) <= 22 {
                selection = .corner(point.id)
                copiedCorner = false
                return
            }
        }
        var best: (id: String, dist: CGFloat)?
        for side in geometry.sides {
            guard let a = layout.screen[side.from], let b = layout.screen[side.to] else { continue }
            let d = distance(from: location, toSegment: a, b)
            if d <= 18, d < (best?.dist ?? .infinity) { best = (side.id, d) }
        }
        if let best {
            selection = .side(best.id)
        } else {
            selection = .parcel
        }
    }

    private func distance(from p: CGPoint, toSegment a: CGPoint, _ b: CGPoint) -> CGFloat {
        let ab = CGVector(dx: b.x - a.x, dy: b.y - a.y)
        let ap = CGVector(dx: p.x - a.x, dy: p.y - a.y)
        let lenSq = ab.dx * ab.dx + ab.dy * ab.dy
        let t = lenSq == 0 ? 0 : max(0, min(1, (ap.dx * ab.dx + ap.dy * ab.dy) / lenSq))
        let closest = CGPoint(x: a.x + ab.dx * t, y: a.y + ab.dy * t)
        return hypot(p.x - closest.x, p.y - closest.y)
    }

    // MARK: - The tip panel (§6)

    /// Never disappears — an empty state where the information was is worse
    /// than a default. Nothing selected describes the whole parcel.
    @ViewBuilder private var tipPanel: some View {
        VStack(alignment: .leading, spacing: 9) {
            switch selection {
            case .parcel:
                Text("\(geometry.sides.count) sides · \(panelLengthText(geometry.perimeterM, unit: unit)) around")
                    .font(.subheadline.weight(.semibold))
                Text("\(String(format: "%.2f", geometry.areaAc)) acres from the corner table. Tap a side or a corner for its own numbers.")
                    .font(.caption).foregroundStyle(.secondary)
            case .side(let id):
                if let side = geometry.sides.first(where: { $0.id == id }) {
                    sideTip(side)
                }
            case .corner(let id):
                if let point = geometry.points.first(where: { $0.id == id }) {
                    cornerTip(point)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    @ViewBuilder private func sideTip(_ side: FMBGeometry.Side) -> some View {
        // Which side, its length in the active unit as the headline —
        // then metres, feet and bearing as three tiles, BOTH units together
        // regardless of the toggle: this is where a deed written in feet is
        // reconciled against a sheet written in metres (§5, §6).
        Text("\(side.from) → \(side.to) · \(panelLengthText(side.m, unit: unit))")
            .font(.subheadline.weight(.semibold)).monospacedDigit()
        HStack(spacing: 8) {
            tipTile("Metres", panelLengthText(side.m, unit: .metres))
            tipTile("Feet", panelLengthText(side.m, unit: .feet))
            tipTile("Grid bearing", bearingText(side.bearing))
        }
        Text(sideSentence(side))
            .font(.caption).foregroundStyle(.secondary)
        if side.isMeasuredOnly {
            Label("Drawn in red on the sheet — a measured line, not a walked boundary.",
                  systemImage: "exclamationmark.triangle.fill")
                .font(.caption).foregroundStyle(.red)
        }
    }

    private func sideSentence(_ side: FMBGeometry.Side) -> String {
        var parts: [String] = []
        if let printed = side.printedM {
            if abs(printed - side.m) > 0.5 {
                parts.append("The sheet printed \(panelLengthText(printed, unit: .metres)); the corners compute \(panelLengthText(side.m, unit: .metres)).")
            } else {
                parts.append("The sheet printed \(panelLengthText(printed, unit: .metres)) for this side.")
            }
        }
        if !side.beyond.isEmpty {
            parts.append("Beyond it lies \(side.beyond).")
        }
        return parts.joined(separator: " ")
    }

    @ViewBuilder private func cornerTip(_ point: FMBGeometry.Point) -> some View {
        // Latitude and longitude as the headline — what a person copies or
        // navigates to — with easting and northing as tiles (§6).
        Text(String(format: "%.5f°N  %.5f°E", point.lat, point.lon))
            .font(.subheadline.weight(.semibold)).monospacedDigit()
        HStack(spacing: 8) {
            tipTile("Easting", String(format: "%.4f", point.e))
            tipTile("Northing", String(format: "%.4f", point.n))
        }
        HStack(spacing: 16) {
            Button {
                UIPasteboard.general.string = String(format: "%.5f, %.5f", point.lat, point.lon)
                copiedCorner = true
            } label: {
                Label(copiedCorner ? "Copied" : "Copy",
                      systemImage: copiedCorner ? "checkmark" : "doc.on.doc")
            }
            Button {
                let url = URL(string: "maps://?ll=\(point.lat),\(point.lon)&q=Corner%20\(point.id)")
                if let url { UIApplication.shared.open(url) }
            } label: {
                Label("Open in Maps", systemImage: "map")
            }
        }
        .font(.caption.weight(.semibold))
        .buttonStyle(.borderless)
    }

    private func tipTile(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(key.uppercased())
                .font(.system(size: 9, weight: .bold)).kerning(0.5)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 13, weight: .semibold)).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(Color(.tertiarySystemFill),
                    in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    // MARK: - The area cross-check (§7)

    /// Three numbers, always shown together, then a verdict in plain words.
    @ViewBuilder private var areaCheck: some View {
        if let check = geometry.areaCheck {
            let delta = check.deltaPct ?? 0
            let (colour, verdict): (Color, String) =
                geometry.portionExceedsField
                ? (.red, "A mapped portion cannot exceed its survey number's extent — this is always an error.")
                : delta < 0.5 ? (.green, String(format: "Agrees — within %.2f%%.", delta))
                : delta <= 2.0 ? (.orange, String(format: "Worth knowing — %.2f%% apart.", delta))
                : (.red, String(format: "%.2f%% apart — wrong ring order, a missing corner, a unit slip, or a genuine encroachment.", delta))
            HStack(alignment: .top, spacing: 11) {
                Rectangle().fill(colour).frame(width: 3)
                    .clipShape(Capsule())
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 12) {
                        checkNumber("From the corners", String(format: "%.2f ac", geometry.areaAc))
                        if let sheet = check.sheetAc {
                            checkNumber("On the sheet", String(format: "%.2f ac", sheet))
                        }
                        if let field = geometry.checks.compactMap(\.fieldAc).first {
                            checkNumber("The field", String(format: "%.2f ac", field))
                        }
                    }
                    Text(verdict).font(.caption).foregroundStyle(colour)
                }
            }
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func checkNumber(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(key.uppercased())
                .font(.system(size: 8.5, weight: .bold)).kerning(0.4)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 13, weight: .semibold)).monospacedDigit()
        }
    }
}

/// Projection: easting/northing to screen with ONE scale factor
/// k = min(w/ΔE, h/ΔN), a 42px inset, north up (§4).
private struct MapLayout {
    let size: CGSize
    let screen: [Int: CGPoint]
    let metresPerPoint: Double
    private let centroid: CGPoint

    init(geometry: FMBGeometry, size: CGSize) {
        self.size = size
        let pts = geometry.ringPoints
        let minE = pts.map(\.e).min() ?? 0, maxE = pts.map(\.e).max() ?? 1
        let minN = pts.map(\.n).min() ?? 0, maxN = pts.map(\.n).max() ?? 1
        let inset: CGFloat = 42
        let w = max(size.width - inset * 2, 1)
        let h = max(size.height - inset * 2, 1)
        let dE = max(maxE - minE, 1), dN = max(maxN - minN, 1)
        let k = min(Double(w) / dE, Double(h) / dN)
        let xPad = (Double(w) - dE * k) / 2
        let yPad = (Double(h) - dN * k) / 2
        var mapped: [Int: CGPoint] = [:]
        for p in geometry.points {
            mapped[p.id] = CGPoint(
                x: Double(inset) + xPad + (p.e - minE) * k,
                y: Double(inset) + yPad + (maxN - p.n) * k)
        }
        screen = mapped
        metresPerPoint = k > 0 ? 1 / k : 1
        let ring = geometry.ring.compactMap { mapped[$0] }
        centroid = CGPoint(x: ring.map(\.x).reduce(0, +) / CGFloat(max(ring.count, 1)),
                           y: ring.map(\.y).reduce(0, +) / CGFloat(max(ring.count, 1)))
        screenRing = ring
    }

    let screenRing: [CGPoint]

    /// Unit vector pointing away from the parcel at a side's midpoint.
    func outwardNormal(of side: FMBGeometry.Side) -> CGVector {
        guard let a = screen[side.from], let b = screen[side.to] else { return .zero }
        let d = CGVector(dx: b.x - a.x, dy: b.y - a.y)
        let len = max(hypot(d.dx, d.dy), 0.001)
        var normal = CGVector(dx: -d.dy / len, dy: d.dx / len)
        let mid = CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
        let toCentroid = CGVector(dx: centroid.x - mid.x, dy: centroid.y - mid.y)
        if normal.dx * toCentroid.dx + normal.dy * toCentroid.dy > 0 {
            normal = CGVector(dx: -normal.dx, dy: -normal.dy)
        }
        return normal
    }

    /// A point pushed outward from a corner, for its ID label.
    func outward(from id: Int, distance: CGFloat) -> CGPoint {
        guard let p = screen[id] else { return .zero }
        let d = CGVector(dx: p.x - centroid.x, dy: p.y - centroid.y)
        let len = max(hypot(d.dx, d.dy), 0.001)
        return CGPoint(x: p.x + d.dx / len * distance, y: p.y + d.dy / len * distance)
    }
}
