import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let iconsDir = root.appendingPathComponent("src-tauri/icons", isDirectory: true)
let iconsetDir = iconsDir.appendingPathComponent("icon.iconset", isDirectory: true)

try? FileManager.default.removeItem(at: iconsetDir)
try FileManager.default.createDirectory(at: iconsetDir, withIntermediateDirectories: true)

let pngTargets: [(String, Int)] = [
    ("32x32.png", 32),
    ("64x64.png", 64),
    ("128x128.png", 128),
    ("128x128@2x.png", 256),
    ("256x256.png", 256),
    ("512x512.png", 512),
    ("icon.png", 512)
]

let iconsetTargets: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for target in pngTargets {
    try renderIcon(size: target.1).writePNG(to: iconsDir.appendingPathComponent(target.0))
}

for target in iconsetTargets {
    try renderIcon(size: target.1).writePNG(to: iconsetDir.appendingPathComponent(target.0))
}

try writeICNS(
    entries: [
        ("icp4", iconsetDir.appendingPathComponent("icon_16x16.png")),
        ("icp5", iconsetDir.appendingPathComponent("icon_16x16@2x.png")),
        ("icp6", iconsetDir.appendingPathComponent("icon_32x32@2x.png")),
        ("ic07", iconsetDir.appendingPathComponent("icon_128x128.png")),
        ("ic08", iconsetDir.appendingPathComponent("icon_256x256.png")),
        ("ic09", iconsetDir.appendingPathComponent("icon_512x512.png")),
        ("ic10", iconsetDir.appendingPathComponent("icon_512x512@2x.png"))
    ],
    to: iconsDir.appendingPathComponent("icon.icns")
)

func renderIcon(size: Int) -> NSBitmapImageRep {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current?.imageInterpolation = .high

    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: size, height: size).fill()

    let scale = CGFloat(size) / 512.0
    func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> NSRect {
        NSRect(
            x: x * scale,
            y: (512.0 - y - height) * scale,
            width: width * scale,
            height: height * scale
        )
    }

    func roundedRect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat, color: NSColor) {
        color.setFill()
        NSBezierPath(
            roundedRect: rect(x, y, width, height),
            xRadius: height * scale / 2.0,
            yRadius: height * scale / 2.0
        ).fill()
    }

    func strokeLine(_ points: [CGPoint], width: CGFloat, color: NSColor) {
        guard let first = points.first else { return }
        color.setStroke()
        let path = NSBezierPath()
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        path.lineWidth = width * scale
        path.move(to: CGPoint(x: first.x * scale, y: (512.0 - first.y) * scale))
        for point in points.dropFirst() {
            path.line(to: CGPoint(x: point.x * scale, y: (512.0 - point.y) * scale))
        }
        path.stroke()
    }

    let prompt = NSColor(calibratedRed: 0.78, green: 0.80, blue: 0.83, alpha: 1.0)
    let track = NSColor(calibratedRed: 0.23, green: 0.25, blue: 0.28, alpha: 1.0)
    let green = NSColor(calibratedRed: 0.35, green: 0.75, blue: 0.29, alpha: 1.0)
    let amber = NSColor(calibratedRed: 1.00, green: 0.66, blue: 0.10, alpha: 1.0)
    let red = NSColor(calibratedRed: 0.95, green: 0.20, blue: 0.22, alpha: 1.0)

    strokeLine(
        [
            CGPoint(x: 137, y: 130),
            CGPoint(x: 171, y: 157),
            CGPoint(x: 137, y: 183)
        ],
        width: 14,
        color: prompt
    )
    strokeLine(
        [
            CGPoint(x: 188, y: 187),
            CGPoint(x: 225, y: 187)
        ],
        width: 13,
        color: prompt
    )

    roundedRect(130, 224, 252, 30, color: track)
    roundedRect(130, 282, 252, 30, color: track)
    roundedRect(130, 342, 252, 30, color: track)

    roundedRect(130, 224, 176, 30, color: green)
    roundedRect(130, 282, 133, 30, color: amber)
    roundedRect(130, 342, 205, 30, color: red)

    NSGraphicsContext.restoreGraphicsState()
    return rep
}

extension NSBitmapImageRep {
    func writePNG(to url: URL) throws {
        guard let data = representation(using: .png, properties: [:]) else {
            throw NSError(domain: "IconRender", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not encode PNG"])
        }
        try data.write(to: url, options: .atomic)
    }
}

func writeICNS(entries: [(String, URL)], to output: URL) throws {
    var chunks = Data()

    for entry in entries {
        let png = try Data(contentsOf: entry.1)
        guard let typeData = entry.0.data(using: .ascii), typeData.count == 4 else {
            throw NSError(domain: "IconRender", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid ICNS type \(entry.0)"])
        }

        chunks.append(typeData)
        chunks.appendUInt32BE(UInt32(png.count + 8))
        chunks.append(png)
    }

    var outputData = Data()
    outputData.append("icns".data(using: .ascii)!)
    outputData.appendUInt32BE(UInt32(chunks.count + 8))
    outputData.append(chunks)
    try outputData.write(to: output, options: .atomic)
}

extension Data {
    mutating func appendUInt32BE(_ value: UInt32) {
        append(UInt8((value >> 24) & 0xff))
        append(UInt8((value >> 16) & 0xff))
        append(UInt8((value >> 8) & 0xff))
        append(UInt8(value & 0xff))
    }
}
