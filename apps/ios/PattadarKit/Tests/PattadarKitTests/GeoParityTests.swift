import PattadarKit
import Testing

@Test("Village map keys include every administrative level")
func villageMapKey() {
    #expect(mapKey(state: "Andhra Pradesh", district: "Markapuram",
                   mandal: "Konakanamitla", village: "Chinthagunta")
            == "andrapradesh/markapuram/konakanamitla/chintagunta")
    #expect(mapKey(state: "AP", district: "", mandal: "Podili", village: "Madalavaripalem") == "")
}

@Test("FMB boundary rejects an unplaced point instead of drawing a partial parcel")
func fmbBoundaryRejectsMissingPoint() {
    let geometry: [String: Any] = [
        "ring": [1, 2, 3, 1],
        "points": [
            ["id": 1, "lat": 15.1, "lon": 79.1],
            ["id": 2, "lat": 15.2, "lon": 79.1],
            ["id": 3, "lat": 15.2, "lon": 79.2],
        ],
    ]
    #expect(ringFromFmbGeometry(geometry).count == 3)
    var broken = geometry
    broken["ring"] = [1, 2, 4]
    #expect(ringFromFmbGeometry(broken).isEmpty)
}

@Test("Photo location is measured against the record boundary")
func photoOnRecord() {
    let ring = [LatLng(latitude: 15.0, longitude: 79.0),
                LatLng(latitude: 15.0, longitude: 79.01),
                LatLng(latitude: 15.01, longitude: 79.01),
                LatLng(latitude: 15.01, longitude: 79.0)]
    #expect(checkPhotoOnRecord(photo: nil, recordPoint: ring[0], ring: ring).status == .unknown)
    #expect(checkPhotoOnRecord(photo: LatLng(latitude: 15.005, longitude: 79.005),
                               recordPoint: ring[0], ring: ring).status == .inside)
    let distant = checkPhotoOnRecord(photo: LatLng(latitude: 16, longitude: 80),
                                     recordPoint: ring[0], ring: ring)
    #expect(distant.status == .far)
    #expect(distant.suspect)
}
