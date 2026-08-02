import Foundation
import PattadarKit
import Testing

/// Pinned to a real FMB sheet: Field No 01, Mangalakunta village, Tarlupadu
/// mandal, Prakasam district. Its point table gives each corner in both UTM
/// metres and lat/long, and the sketch prints the side lengths — so the
/// sheet itself is the ground truth the projection is tested against.
struct BoundaryTests {
    // Point Id 1, 2 and 9 from the sheet's table.
    let p1 = LatLng(latitude: 15.66026, longitude: 79.31919)
    let p2 = LatLng(latitude: 15.66072, longitude: 79.31944)
    let p9 = LatLng(latitude: 15.65872, longitude: 79.32146)

    @Test func sideLengthsMatchTheSketch() {
        // The sketch prints 58.04 m along 1→2 and 296.69 m along 1→9.
        // Lat/long in the table is rounded to 5 places (~1.1 m), so the
        // reproduction is metre-accurate, not millimetre-accurate.
        let sides = boundarySideMetres([p1, p2, p9])
        #expect(abs(sides[0] - 58.04) < 1.5)     // 1 → 2
        #expect(abs(sides[2] - 296.69) < 1.5)    // 9 → 1 (closing side)
    }

    @Test func utmAndLatLongAgree() {
        // The same corners in the table's UTM column: 1→2 is
        // √(27.5159² + 51.103²) = 58.04 m. The projection from lat/long
        // must land on the same figure — that is the whole claim.
        let dE = 319872.2682 - 319844.7523
        let dN = 1732120.2520 - 1732069.1490
        let utm = (dE * dE + dN * dN).squareRoot()
        let projected = boundarySideMetres([p1, p2, p9])[0]
        #expect(abs(projected - utm) < 1.5)
    }

    @Test func areaOfAKnownSquare() {
        // One arc-second is ~30.8 m of latitude; a square drawn in degrees
        // near this latitude has a computable extent. 100 m × 100 m within
        // a metre-per-side tolerance: 10,000 m² = 2.471 acres.
        let d = 100.0 / (6_371_000.0 * .pi / 180)   // degrees of latitude for 100 m
        let lat = 15.66
        let dLng = d / cos(lat * .pi / 180)
        let square = [
            LatLng(latitude: lat, longitude: 79.32),
            LatLng(latitude: lat + d, longitude: 79.32),
            LatLng(latitude: lat + d, longitude: 79.32 + dLng),
            LatLng(latitude: lat, longitude: 79.32 + dLng),
        ]
        #expect(abs(boundaryAcres(square) - 2.4711) < 0.01)
    }

    @Test func parseDropsRubbishAndRoundTrips() {
        let text = "15.66026,79.31919; 15.66072 , 79.31944 ;garbage;15.65872,79.32146"
        let corners = parseBoundary(text)
        #expect(corners.count == 3)
        #expect(corners[0] == p1)
        // Round-trip through the wire format survives.
        #expect(parseBoundary(boundaryText(corners)) == corners)
    }

    @Test func twoCornersAreNoBoundary() {
        #expect(parseBoundary("15.66026,79.31919;15.66072,79.31944").isEmpty)
        #expect(parseBoundary("").isEmpty)
        // Latitudes beyond the pole are typos, not corners.
        #expect(parseBoundary("95.0,79.3;15.6,79.3;15.7,79.4").count == 0)
    }

    @Test func readerPointsBecomeTheWireFormat() {
        // Exactly what the reader returned for this sheet on 2026-08-01:
        // nine dicts, lat/lng as numbers, table order.
        let extracted: [[String: Any]] = [
            ["lat": 15.66026, "lng": 79.31919],
            ["lat": 15.66072, "lng": 79.31944],
            ["lat": 15.66567, "lng": 79.32177],
            ["lat": 15.65922, "lng": 79.32252],
            ["lat": 15.66053, "lng": 79.32334],
            ["lat": 15.66464, "lng": 79.32437],
            ["lat": 15.66486, "lng": 79.32344],
            ["lat": 15.66514, "lng": 79.32274],
            ["lat": 15.65872, "lng": 79.32146],
        ]
        let corners = parseBoundary(boundaryPointsText(extracted))
        #expect(corners.count == 9)
        #expect(corners.first == p1)
        #expect(corners.last == p9)
    }

    @Test func readerPointsSurviveStringsAndRubbish() {
        // String coordinates and alternate key names still parse; a junk row
        // is dropped rather than poisoning the rest.
        let mixed: [[String: Any]] = [
            ["latitude": "15.66026", "longitude": "79.31919"],
            ["lat": 15.66072, "lon": 79.31944],
            ["lat": "not a number", "lng": 79.0],
            ["lat": 15.65872, "lng": 79.32146],
        ]
        #expect(parseBoundary(boundaryPointsText(mixed)).count == 3)
        // Two good corners is no boundary; nothing at all is no boundary.
        #expect(boundaryPointsText([["lat": 15.1, "lng": 79.1]]).isEmpty)
        #expect(boundaryPointsText(nil).isEmpty)
        #expect(boundaryPointsText("garbage").isEmpty)
    }

    @Test func mismatchSpeaksOnlyWhenSure() {
        #expect(boundaryExtentMismatch(drawnAcres: 2.0, recordedAcres: 2.1).isEmpty)
        #expect(!boundaryExtentMismatch(drawnAcres: 2.0, recordedAcres: 3.0).isEmpty)
        // Nothing recorded, or nothing drawn → nothing to accuse.
        #expect(boundaryExtentMismatch(drawnAcres: 0, recordedAcres: 3.0).isEmpty)
    }
}
