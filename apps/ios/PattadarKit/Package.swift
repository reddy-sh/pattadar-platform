// swift-tools-version: 6.0
import PackageDescription

/// The domain and networking layer of the native iOS app.
///
/// Deliberately a library, not part of the app target: the land rules in here
/// are the same rules `packages/core` defines for the web heads, and they are
/// verified against vectors generated from that TypeScript. Keeping them in a
/// package means `swift test` can run them without an iOS simulator or an
/// Xcode project, so a drift is caught by CI rather than by a wrong acreage.
let package = Package(
    name: "PattadarKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "PattadarKit", targets: ["PattadarKit"])
    ],
    targets: [
        .target(name: "PattadarKit"),
        .testTarget(
            name: "PattadarKitTests",
            dependencies: ["PattadarKit"],
            // The vectors are the contract with packages/core. Referenced in
            // place rather than copied, so there is exactly one of them.
            resources: [.copy("Vectors")]
        )
    ]
)
