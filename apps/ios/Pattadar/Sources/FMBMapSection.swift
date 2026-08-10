import CoreLocation
import PattadarKit
import SwiftUI
import UIKit

/// The FMB sheet, turned into a map you can measure — built to the founder's
/// frames, word for word. Everything drawn here was DERIVED on the server
/// from the sheet's own corner table; this screen computes nothing except
/// unit conversion.
struct FMBMapSection: View {
    let geometry: FMBGeometry
    let doc: RegisteredDocument
    /// "Ac 60.00 Cent" — the extent noted inside the sketch, as written.
    let sheetExtentRaw: String
    /// "Ac 197-05 Cent" — the sheet header's whole-survey extent, as written.
    let fieldExtentRaw: String
    /// The neighbouring villages by compass side, from the sheet.
    let neighbours: [String: String]

    @AppStorage("pattadar.maps.lengthUnit") private var unitRaw = LengthUnit.metres.rawValue
    @State private var selection: Selection = .parcel
    @State private var copiedCorner = false
    @State private var copiedAll = false
    /// Plain | Satellite. The satellite slot is honest about being a slot.
    @State private var satellite = false
    // Layer chips: which labels ride the map.
    @State private var showLengths = true
    @State private var showBearings = false
    @State private var showPointIDs = true

    enum Selection: Equatable {
        case parcel
        case side(String)
        case corner(Int)
    }

    private var unit: LengthUnit { LengthUnit(rawValue: unitRaw) ?? .metres }
    private var fieldAcres: Double? { acCents(fieldExtentRaw) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            map
                .aspectRatio(1.0, contentMode: .fit)
                .background(satellite ? Color(red: 0.07, green: 0.10, blue: 0.08)
                                      : Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .sensoryFeedback(.selection, trigger: selection)

            controls

            if geometry.orderSource == "inferred" {
                Label("Corner order inferred — confirm against the sheet",
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.caption).foregroundStyle(.orange)
            }

            tipPanel
            areaAgrees
            cornerCoordinates
            useOnTheGround

            if !geometry.datumStated {
                Text("Datum unstated on the sheet — placement on imagery is approximate.")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - The map

    private var map: some View {
        GeometryReader { proxy in
            let layout = MapLayout(geometry: geometry, size: proxy.size)
            ZStack {
                Canvas { ctx, size in
                    drawGrid(in: &ctx, size: size)
                    draw(in: &ctx, layout: layout)
                }
                if satellite {
                    // The imagery slot, named as a slot — a tile source lands
                    // here; pretending it already did would mislead.
                    Text("Imagery slot · Bhuvan / satellite tiles")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color.orange.opacity(0.15), in: Capsule())
                        .overlay(Capsule().stroke(Color.orange.opacity(0.4), lineWidth: 1))
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity, maxHeight: .infinity,
                               alignment: .topLeading)
                        .padding(12)
                }
                Image(systemName: "location.north.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.secondary)
                    .overlay(alignment: .bottom) {
                        Text("N").font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.secondary).offset(y: 11)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(14)
                scaleBar(layout: layout)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(14)
                Button(satellite ? "Satellite" : "Plain") {
                    withAnimation(.snappy) { satellite.toggle() }
                }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.bordered)
                .clipShape(Capsule())
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .padding(12)
            }
            .contentShape(Rectangle())
            .onTapGesture { location in
                select(at: location, layout: layout)
            }
        }
    }

    private func drawGrid(in ctx: inout GraphicsContext, size: CGSize) {
        let step: CGFloat = 46
        var path = Path()
        var x: CGFloat = step
        while x < size.width { path.move(to: .init(x: x, y: 0)); path.addLine(to: .init(x: x, y: size.height)); x += step }
        var y: CGFloat = step
        while y < size.height { path.move(to: .init(x: 0, y: y)); path.addLine(to: .init(x: size.width, y: y)); y += step }
        ctx.stroke(path, with: .color(.primary.opacity(0.045)), lineWidth: 1)
    }

    private func draw(in ctx: inout GraphicsContext, layout: MapLayout) {
        let ring = layout.screenRing
        guard ring.count >= 3 else { return }

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
            ctx.stroke(path, with: .color(colour), lineWidth: isSelected ? 3 : 2)
        }

        for point in geometry.ringPoints {
            guard let p = layout.screen[point.id] else { continue }
            let isSelected = selection == .corner(point.id)
            let r: CGFloat = isSelected ? 7 : 4
            // The selected corner is YELLOW — the frames' own choice.
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r,
                                            width: r * 2, height: r * 2)),
                     with: .color(isSelected ? .yellow : .red))
            if showPointIDs {
                let out = layout.outward(from: point.id, distance: 15)
                ctx.draw(Text("\(point.id)").font(.system(size: 10, weight: .bold))
                            .foregroundStyle(isSelected ? Color.yellow : Color.red.opacity(0.9)),
                         at: out)
            }
        }

        guard showLengths || showBearings else { return }
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
            var label = ""
            if showLengths { label = mapLengthText(side.m, unit: unit) }
            if showBearings {
                label = label.isEmpty ? bearingText(side.bearing)
                                      : label + " · " + bearingText(side.bearing)
            }
            var text = ctx
            text.translateBy(x: at.x, y: at.y)
            text.rotate(by: .radians(angle))
            text.draw(Text(label)
                        .font(.system(size: 10, weight: .semibold)).monospacedDigit()
                        .foregroundStyle(side.isMeasuredOnly ? Color.red : Color.primary),
                      at: .zero)
        }
    }

    private func scaleBar(layout: MapLayout) -> some View {
        let targetMetres = layout.metresPerPoint * layout.size.width * 0.22
        let inUnit = unit == .metres ? targetMetres : targetMetres * LengthUnit.feetPerMetre
        let nice = niceRound(inUnit)
        let metres = unit == .metres ? nice : nice / LengthUnit.feetPerMetre
        let widthPt = metres / layout.metresPerPoint
        return VStack(alignment: .leading, spacing: 3) {
            Text("\(Int(nice)) \(unit.label)")
                .font(.system(size: 10, weight: .semibold)).monospacedDigit()
                .foregroundStyle(.secondary)
            HStack(spacing: 0) {
                Rectangle().frame(width: 1.5, height: 7)
                Rectangle().frame(width: max(24, widthPt), height: 1.5)
                Rectangle().frame(width: 1.5, height: 7)
            }
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

    // MARK: - Controls

    private var controls: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Picker("Unit", selection: Binding(
                    get: { unit },
                    set: { unitRaw = $0.rawValue })) {
                    Text("Metres").tag(LengthUnit.metres)
                    Text("Feet").tag(LengthUnit.feet)
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
                layerChip("Lengths", on: $showLengths)
                layerChip("Bearings", on: $showBearings)
                layerChip("Point IDs", on: $showPointIDs)
            }
        }
    }

    private func layerChip(_ title: String, on: Binding<Bool>) -> some View {
        Button {
            withAnimation(.snappy) { on.wrappedValue.toggle() }
        } label: {
            Text(title)
                .font(.subheadline.weight(on.wrappedValue ? .semibold : .regular))
                .padding(.horizontal, 13).padding(.vertical, 7)
                .background(on.wrappedValue ? Color.cyan.opacity(0.18)
                                            : Color(.tertiarySystemFill),
                            in: Capsule())
                .foregroundStyle(on.wrappedValue ? Color.cyan : Color.primary)
        }
        .buttonStyle(.plain)
    }

    // MARK: - The tip panel

    @ViewBuilder private var tipPanel: some View {
        VStack(alignment: .leading, spacing: 9) {
            switch selection {
            case .parcel: parcelTip
            case .side(let id):
                if let side = geometry.sides.first(where: { $0.id == id }) { sideTip(side) }
            case .corner(let id):
                if let point = geometry.points.first(where: { $0.id == id }) { cornerTip(point) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func spelled(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .spellOut
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    @ViewBuilder private var parcelTip: some View {
        Text("WHOLE PARCEL")
            .font(.system(size: 11, weight: .bold)).kerning(1.0)
            .foregroundStyle(.cyan)
        Text("\(panelLengthText(geometry.perimeterM, unit: unit)) around")
            .font(.title3.weight(.bold)).monospacedDigit()
        Text("\(spelled(geometry.sides.count).capitalized) sides, \(spelled(geometry.points.count)) corners. Tap any side or corner on the map for its measurement, bearing and who lies beyond it.")
            .font(.subheadline).foregroundStyle(.secondary)
        HStack(spacing: 8) {
            tipTile("Sides", "\(geometry.sides.count)")
            tipTile("Perimeter", mapLengthText(geometry.perimeterM, unit: unit))
        }
        tipTile("Area", acText(geometry.areaAc))
    }

    @ViewBuilder private func sideTip(_ side: FMBGeometry.Side) -> some View {
        Text("SIDE")
            .font(.system(size: 11, weight: .bold)).kerning(1.0)
            .foregroundStyle(.cyan)
        Text("\(side.from) → \(side.to) · \(panelLengthText(side.m, unit: unit))")
            .font(.title3.weight(.bold)).monospacedDigit()
        HStack(spacing: 8) {
            tipTile("Metres", panelLengthText(side.m, unit: .metres))
            tipTile("Feet", panelLengthText(side.m, unit: .feet))
            tipTile("Grid bearing", bearingText(side.bearing))
        }
        Text(sideSentence(side))
            .font(.subheadline).foregroundStyle(.secondary)
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
        Text("CORNER \(point.id)")
            .font(.system(size: 11, weight: .bold)).kerning(1.0)
            .foregroundStyle(.red)
        Text(String(format: "%.5f, %.5f", point.lat, point.lon))
            .font(.title3.weight(.bold)).monospacedDigit()
        Text("WGS 84 degrees, and \(geometry.utmZoneLabel ?? "projected") in metres.")
            .font(.subheadline).foregroundStyle(.secondary)
        HStack(spacing: 8) {
            tipTile("Easting", String(format: "%.2f", point.e))
            tipTile("Northing", String(format: "%.2f", point.n))
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
                openInMaps(point)
            } label: {
                Label("Open in Maps", systemImage: "map")
            }
        }
        .font(.caption.weight(.semibold))
        .buttonStyle(.borderless)
    }

    private func openInMaps(_ point: FMBGeometry.Point) {
        if let url = URL(string: "maps://?ll=\(point.lat),\(point.lon)&q=Corner%20\(point.id)") {
            UIApplication.shared.open(url)
        }
    }

    private func tipTile(_ key: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(key.uppercased())
                .font(.system(size: 9, weight: .bold)).kerning(0.5)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 14, weight: .semibold)).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.tertiarySystemFill),
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: - Does the area agree

    @ViewBuilder private var areaAgrees: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("DOES THE AREA AGREE")
                .font(.caption.weight(.medium)).kerning(1.1)
                .foregroundStyle(.secondary)
            VStack(spacing: 0) {
                areaRow("From these \(spelled(geometry.points.count)) corners",
                        sub: "Shoelace on the \(geometry.utmZoneLabel.map { _ in "UTM" } ?? "projected") coordinates",
                        value: acText(geometry.areaAc),
                        tint: verdictColour)
                if let sheet = geometry.areaCheck?.sheetAc {
                    Divider()
                    areaRow("Written on the sheet",
                            sub: "Extent noted inside the sketch",
                            value: acText(sheet), tint: nil)
                }
                if let field = fieldAcres {
                    Divider()
                    areaRow("Whole survey number",
                            sub: "Sheet header · \(trimmedRaw(fieldExtentRaw))",
                            value: acText(field), tint: nil)
                }
            }
            .padding(.horizontal, 14)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            if let sentence = verdictSentence {
                Label {
                    Text(sentence).font(.subheadline)
                } icon: {
                    Image(systemName: verdictColour == .green
                          ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                }
                .foregroundStyle(verdictColour)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(verdictColour.opacity(0.10),
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }

    private func trimmedRaw(_ raw: String) -> String {
        raw.replacingOccurrences(of: "Cent", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: " ."))
    }

    private var verdictColour: Color {
        guard let check = geometry.areaCheck else { return .secondary }
        if geometry.portionExceedsField { return .red }
        let delta = check.deltaPct ?? 0
        return delta < 0.5 ? .green : delta <= 2 ? .orange : .red
    }

    private var verdictSentence: String? {
        guard let check = geometry.areaCheck, let sheet = check.sheetAc else { return nil }
        if geometry.portionExceedsField {
            return "A mapped portion cannot exceed its survey number's extent — this is always an error."
        }
        let diff = abs(geometry.areaAc - sheet)
        let delta = check.deltaPct ?? 0
        let head = "\(acText(geometry.areaAc)) against \(acText(sheet)) written on the sheet — off by "
            + String(format: "%.2f", diff)
            + (abs(diff - 1) < 0.005 ? " acre" : " acres")
            + String(format: ", about %.2f%%. ", delta)
        let tail = delta < 0.5 ? "Within survey tolerance."
            : delta <= 2 ? "Worth a look."
            : "Check the ring order, the corners and the units."
        return head + tail
    }

    private func areaRow(_ title: String, sub: String, value: String, tint: Color?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.medium))
                Text(sub).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Text(value)
                .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                .foregroundStyle(tint ?? .primary)
        }
        .padding(.vertical, 10)
    }

    // MARK: - Corner coordinates

    @ViewBuilder private var cornerCoordinates: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("CORNER COORDINATES")
                    .font(.caption.weight(.medium)).kerning(1.1)
                    .foregroundStyle(.secondary)
                Spacer()
                Button(copiedAll ? "Copied" : "Copy all") {
                    UIPasteboard.general.string = geometry.ringPoints.map { p in
                        String(format: "%d: %.5f, %.5f · E %.4f · N %.4f",
                               p.id, p.lat, p.lon, p.e, p.n)
                    }.joined(separator: "\n")
                    copiedAll = true
                }
                .font(.caption.weight(.semibold))
            }
            VStack(spacing: 0) {
                ForEach(Array(geometry.ringPoints.enumerated()), id: \.element.id) { i, p in
                    if i > 0 { Divider() }
                    Button {
                        withAnimation(.snappy) { selection = .corner(p.id) }
                        copiedCorner = false
                    } label: {
                        HStack(spacing: 12) {
                            Text("\(p.id)")
                                .font(.system(size: 11, weight: .bold)).monospacedDigit()
                                .frame(width: 24, height: 24)
                                .background(Color.red.opacity(0.18), in: Circle())
                                .foregroundStyle(.red)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(String(format: "%.5f, %.5f", p.lat, p.lon))
                                    .font(.system(.subheadline, design: .monospaced).weight(.semibold))
                                    .foregroundStyle(.primary)
                                Text(String(format: "E %.2f · N %.2f", p.e, p.n))
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 8)
                            Button("Maps") { openInMaps(p) }
                                .font(.subheadline.weight(.semibold))
                                .buttonStyle(.borderless)
                        }
                        .padding(.vertical, 8)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    // MARK: - Use it on the ground

    @ViewBuilder private var useOnTheGround: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("USE IT ON THE GROUND")
                .font(.caption.weight(.medium)).kerning(1.1)
                .foregroundStyle(.secondary)
            VStack(spacing: 0) {
                NavigationLink {
                    WalkBoundaryScreen(geometry: geometry)
                } label: {
                    groundRow(icon: "scope", tint: .green,
                              title: "Walk the boundary",
                              sub: "Live GPS against the \(geometry.points.count) corners, with distance-to-next")
                }
                .buttonStyle(.plain)
                Divider()
                NavigationLink {
                    DeedScheduleOverlayScreen(neighbours: neighbours, geometry: geometry)
                } label: {
                    groundRow(icon: "square.on.square.dashed", tint: .blue,
                              title: "Overlay the deed schedule",
                              sub: overlaySubtitle)
                }
                .buttonStyle(.plain)
                Divider()
                if let items = exportItems {
                    ShareLink(items: items) {
                        groundRow(icon: "square.and.arrow.up.on.square", tint: .purple,
                                  title: "Export KML / GeoJSON",
                                  sub: "For a surveyor, a drone flight, or Google Earth")
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .background(Color(.secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private var overlaySubtitle: String {
        let named = ["north", "east", "south", "west"]
            .compactMap { side in neighbours[side].map { "\($0) \(side)" } }
        guard named.count >= 2 else {
            return "Check the four sides against the map"
        }
        return "\(named[0].capitalized), \(named[1]) — check the four sides against the map"
    }

    private func groundRow(icon: String, tint: Color, title: String, sub: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 34, height: 34)
                .background(tint.opacity(0.15),
                            in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                Text(sub).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }

    /// KML + GeoJSON written to temp under the platform's names —
    /// pattadar-fmb-<village>.kml / .geojson.
    private var exportItems: [URL]? {
        let ring = geometry.ringPoints
        guard ring.count >= 3 else { return nil }
        let closed = ring + [ring[0]]
        let name = "pattadar-fmb-" + (fileSlug(doc.village).isEmpty ? "sheet" : fileSlug(doc.village))
        let dir = FileManager.default.temporaryDirectory

        let coordsKML = closed.map { String(format: "%.6f,%.6f,0", $0.lon, $0.lat) }
            .joined(separator: " ")
        let kml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <name>\(doc.village.isEmpty ? "FMB parcel" : doc.village) · FMB</name>
        <Placemark><name>Parcel</name><Polygon><outerBoundaryIs><LinearRing>
        <coordinates>\(coordsKML)</coordinates>
        </LinearRing></outerBoundaryIs></Polygon></Placemark>
        </Document></kml>
        """
        let ringJSON = closed.map { "[\($0.lon), \($0.lat)]" }.joined(separator: ", ")
        let geojson = """
        {"type": "Feature",
         "geometry": {"type": "Polygon", "coordinates": [[\(ringJSON)]]},
         "properties": {"village": "\(doc.village)", "area_ac": \(geometry.areaAc),
                        "perimeter_m": \(geometry.perimeterM)}}
        """
        let kmlURL = dir.appendingPathComponent(name + ".kml")
        let geoURL = dir.appendingPathComponent(name + ".geojson")
        do {
            try kml.write(to: kmlURL, atomically: true, encoding: .utf8)
            try geojson.write(to: geoURL, atomically: true, encoding: .utf8)
        } catch { return nil }
        return [kmlURL, geoURL]
    }

    // MARK: - Selection

    private func select(at location: CGPoint, layout: MapLayout) {
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
        selection = best.map { .side($0.id) } ?? .parcel
    }

    private func distance(from p: CGPoint, toSegment a: CGPoint, _ b: CGPoint) -> CGFloat {
        let ab = CGVector(dx: b.x - a.x, dy: b.y - a.y)
        let ap = CGVector(dx: p.x - a.x, dy: p.y - a.y)
        let lenSq = ab.dx * ab.dx + ab.dy * ab.dy
        let t = lenSq == 0 ? 0 : max(0, min(1, (ap.dx * ab.dx + ap.dy * ab.dy) / lenSq))
        let closest = CGPoint(x: a.x + ab.dx * t, y: a.y + ab.dy * t)
        return hypot(p.x - closest.x, p.y - closest.y)
    }
}

// MARK: - Walk the boundary

/// Stand on the land and check the paper against the ground: live GPS
/// against the corners, distance and bearing to the nearest one, and an
/// honest accuracy gate — a phone at ±8 m cannot confirm a corner.
struct WalkBoundaryScreen: View {
    let geometry: FMBGeometry
    @State private var walker = BoundaryWalker()

    var body: some View {
        List {
            Section {
                if let fix = walker.fix {
                    VStack(alignment: .leading, spacing: 6) {
                        if let nearest = nearestCorner(to: fix) {
                            Text("You are \(formatDistance(km: nearest.km)) from corner \(nearest.id)")
                                .font(.headline)
                        }
                        Text(String(format: "GPS accuracy ±%.0f m", fix.horizontalAccuracy))
                            .font(.caption)
                            .foregroundStyle(fix.horizontalAccuracy > 10 ? .orange : .secondary)
                        if fix.horizontalAccuracy > 10 {
                            Text("Above ±10 m the walk is indicative only — a phone at this accuracy cannot confirm a corner.")
                                .font(.caption).foregroundStyle(.orange)
                        }
                    }
                    .padding(.vertical, 4)
                } else if walker.denied {
                    Label("Location is off for Pattadar — allow it in Settings to walk the boundary.",
                          systemImage: "location.slash")
                        .font(.subheadline).foregroundStyle(.secondary)
                } else {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Finding you…").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
            Section("Corners") {
                ForEach(geometry.ringPoints) { p in
                    HStack {
                        Text("\(p.id)")
                            .font(.system(size: 11, weight: .bold)).monospacedDigit()
                            .frame(width: 24, height: 24)
                            .background(Color.red.opacity(0.18), in: Circle())
                            .foregroundStyle(.red)
                        Text(String(format: "%.5f, %.5f", p.lat, p.lon))
                            .font(.system(.subheadline, design: .monospaced))
                        Spacer()
                        if let fix = walker.fix {
                            Text(formatDistance(km: haversineKm(
                                LatLng(lat: fix.coordinate.latitude, lng: fix.coordinate.longitude),
                                LatLng(lat: p.lat, lng: p.lon))))
                                .font(.subheadline.weight(.semibold)).monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Walk the boundary")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { walker.start() }
        .onDisappear { walker.stop() }
    }

    private func nearestCorner(to fix: CLLocation) -> (id: Int, km: Double)? {
        let here = LatLng(lat: fix.coordinate.latitude, lng: fix.coordinate.longitude)
        return geometry.ringPoints
            .map { (id: $0.id, km: haversineKm(here, LatLng(lat: $0.lat, lng: $0.lon))) }
            .min { $0.km < $1.km }
    }
}

@Observable
final class BoundaryWalker: NSObject, CLLocationManagerDelegate {
    var fix: CLLocation?
    var denied = false
    private let manager = CLLocationManager()

    func start() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .denied, .restricted: denied = true
        default: manager.startUpdatingLocation()
        }
    }

    func stop() { manager.stopUpdatingLocation() }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: manager.startUpdatingLocation()
        case .denied, .restricted: denied = true
        default: break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        fix = locations.last
    }
}

// MARK: - Deed schedule overlay

/// The sheet's four compass sides, laid against the map's own sides — the
/// single check that catches a large share of bad descriptions.
struct DeedScheduleOverlayScreen: View {
    let neighbours: [String: String]
    let geometry: FMBGeometry

    private let order: [(key: String, label: String)] = [
        ("north", "North · ఉత్తరం"), ("east", "East · తూర్పు"),
        ("south", "South · దక్షిణం"), ("west", "West · పడమర"),
    ]

    var body: some View {
        List {
            Section {
                Text("What the sheet writes outside each side, against what the map's sides face. A deed whose schedule disagrees with these four lines is describing different land.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section("The four sides") {
                ForEach(order, id: \.key) { side in
                    HStack(alignment: .firstTextBaseline) {
                        Text(side.label).font(.subheadline).foregroundStyle(.secondary)
                        Spacer(minLength: 12)
                        Text(neighbours[side.key] ?? "—")
                            .font(.subheadline.weight(.semibold))
                            .multilineTextAlignment(.trailing)
                    }
                }
            }
            Section("The map agrees when") {
                ForEach(geometry.sides.filter { !$0.beyond.isEmpty }) { s in
                    HStack {
                        Text("\(s.from) → \(s.to)")
                            .font(.system(.subheadline, design: .monospaced))
                        Spacer(minLength: 12)
                        Text(s.beyond).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Deed schedule")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Projection: easting/northing to screen with ONE scale factor
/// k = min(w/ΔE, h/ΔN), a 42px inset, north up.
struct MapLayout {
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

    func outward(from id: Int, distance: CGFloat) -> CGPoint {
        guard let p = screen[id] else { return .zero }
        let d = CGVector(dx: p.x - centroid.x, dy: p.y - centroid.y)
        let len = max(hypot(d.dx, d.dy), 0.001)
        return CGPoint(x: p.x + d.dx / len * distance, y: p.y + d.dy / len * distance)
    }
}
