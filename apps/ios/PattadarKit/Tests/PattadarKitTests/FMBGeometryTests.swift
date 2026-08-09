import Foundation
import PattadarKit
import Testing

/// The stored shape, decoded — pinned to the same Field No. 01 numbers the
/// server tests pin, so the two halves can never drift apart silently.
struct FMBGeometryTests {
    // The geometry exactly as services/api/src/fmb_geometry.py emits it for
    // the founder's sheet (abridged to three checks-bearing sides plus the
    // fields the screens read).
    static let readingJSON = """
    {"geometry": {
      "crs": {"projected": "EPSG:32644", "geographic": "EPSG:4326", "datum_stated": true},
      "order_source": "lengths",
      "ring": [3, 8, 7, 6, 5, 4, 9, 1, 2],
      "points": [
        {"id": 1, "e": 319844.7523, "n": 1732069.149, "lat": 15.66026, "lon": 79.31919},
        {"id": 2, "e": 319872.2682, "n": 1732120.252, "lat": 15.66072, "lon": 79.31944},
        {"id": 3, "e": 320125.3764, "n": 1732665.347, "lat": 15.66567, "lon": 79.32177},
        {"id": 4, "e": 320200.9219, "n": 1731951.06, "lat": 15.65922, "lon": 79.32252},
        {"id": 5, "e": 320290.237, "n": 1732095.752, "lat": 15.66053, "lon": 79.32334},
        {"id": 6, "e": 320403.8115, "n": 1732549.783, "lat": 15.66464, "lon": 79.32437},
        {"id": 7, "e": 320304.0998, "n": 1732574.37, "lat": 15.66486, "lon": 79.32344},
        {"id": 8, "e": 320229.5706, "n": 1732605.919, "lat": 15.66514, "lon": 79.32274},
        {"id": 9, "e": 320086.1597, "n": 1731896.667, "lat": 15.65872, "lon": 79.32146}
      ],
      "sides": [
        {"from": 3, "to": 8, "m": 119.95, "printed_m": 119.95, "bearing": 119.7, "beyond": "Jangamreddypalle", "state": "surveyed"},
        {"from": 8, "to": 7, "m": 80.93, "printed_m": 80.93, "bearing": 112.9, "beyond": "Jangamreddypalle", "state": "surveyed"},
        {"from": 7, "to": 6, "m": 102.70, "printed_m": 102.7, "bearing": 103.9, "beyond": "Jangamreddypalle", "state": "surveyed"},
        {"from": 6, "to": 5, "m": 468.02, "printed_m": 468.02, "bearing": 194.0, "beyond": "Obayapalle", "state": "surveyed"},
        {"from": 5, "to": 4, "m": 170.04, "printed_m": 170.04, "bearing": 211.7, "beyond": "Obayapalle", "state": "surveyed"},
        {"from": 4, "to": 9, "m": 127.0, "printed_m": 127, "bearing": 244.6, "beyond": "Jaganadhapuram", "state": "surveyed"},
        {"from": 9, "to": 1, "m": 296.69, "printed_m": 296.69, "bearing": 305.5, "beyond": "Jaganadhapuram", "state": "measured_only"},
        {"from": 1, "to": 2, "m": 58.04, "printed_m": 60, "bearing": 28.3, "beyond": "Kethagudipi", "state": "surveyed"},
        {"from": 2, "to": 3, "m": 600.99, "printed_m": 600.89, "bearing": 24.9, "beyond": "Kethagudipi", "state": "surveyed"}
      ],
      "area_m2": 242399, "area_ac": 59.9, "perimeter_m": 2024.4, "closure_m": 0.0,
      "checks": [{"code": "area_vs_sheet", "ok": true, "delta_pct": 0.17, "sheet_ac": 60.0}]
    }}
    """

    static var reading: [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(readingJSON.utf8))) as? [String: Any] ?? [:]
    }

    @Test func theStoredShapeDecodesWhole() throws {
        let g = try #require(fmbGeometry(Self.reading))
        #expect(g.ring == [3, 8, 7, 6, 5, 4, 9, 1, 2])
        #expect(g.orderSource == "lengths" && g.datumStated)
        #expect(g.points.count == 9 && g.sides.count == 9)
        #expect(g.areaAc == 59.9 && g.perimeterM == 2024.4)
        // Ring order is what the polygon draws — northernmost corner first.
        #expect(g.ringPoints.first?.id == 3)
        let check = try #require(g.areaCheck)
        #expect(check.ok && check.deltaPct == 0.17 && check.sheetAc == 60.0)
        #expect(!g.portionExceedsField)
    }

    @Test func theRedLineStaysFirstClass() throws {
        let g = try #require(fmbGeometry(Self.reading))
        let red = try #require(g.sides.first { $0.from == 9 && $0.to == 1 })
        #expect(red.isMeasuredOnly)
        #expect(g.sides.filter(\.isMeasuredOnly).count == 1)
        // Printed rides beside computed on the rounded side.
        let side12 = try #require(g.sides.first { $0.from == 1 && $0.to == 2 })
        #expect(side12.printedM == 60 && side12.m == 58.04)
    }

    @Test func lengthsConvertAreasDoNot() {
        // §5: 1 m = 3.280839895 ft exactly. The design table's own row:
        // 119.95 m is 393.5 ft in the panel, 394 ft on the map.
        #expect(panelLengthText(119.95, unit: .feet) == "393.5 ft")
        #expect(mapLengthText(119.95, unit: .feet) == "394 ft")
        #expect(mapLengthText(119.95, unit: .metres) == "119.95 m")
        #expect(panelLengthText(58.04, unit: .metres) == "58.04 m")
        #expect(bearingText(119.7) == "119.7°")
    }

    @Test func aReadingWithoutATableIsNoMap() {
        #expect(fmbGeometry([:]) == nil)
        #expect(fmbGeometry(["geometry": ["ring": [1, 2]]]) == nil)
        // A geometry whose sides do not cover the ring is refused, not drawn.
        var broken = Self.reading
        var g = broken["geometry"] as? [String: Any] ?? [:]
        g["sides"] = []
        broken["geometry"] = g
        #expect(fmbGeometry(broken) == nil)
    }
}
