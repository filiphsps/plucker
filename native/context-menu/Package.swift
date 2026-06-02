// swift-tools-version:5.9

import PackageDescription

// Deployment floor is macOS 13 (Ventura). Newer SwiftUI / Liquid Glass APIs are
// reached at runtime via `if #available` — see ContextMenuStyle.swift.
let package = Package(
    name: "PluckerContextMenu",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "PluckerContextMenu", targets: ["PluckerContextMenu"]),
        // The dynamic `Module` product is what becomes `.build/Module.node`.
        .library(name: "Module", type: .dynamic, targets: ["PluckerContextMenu"])
    ],
    dependencies: [
        .package(path: "node_modules/node-swift")
    ],
    targets: [
        .target(
            name: "PluckerContextMenu",
            dependencies: [
                .product(name: "NodeAPI", package: "node-swift"),
                .product(name: "NodeModuleSupport", package: "node-swift")
            ]
        )
    ]
)
