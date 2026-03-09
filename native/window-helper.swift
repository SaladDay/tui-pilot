import CoreGraphics
import Foundation

struct WindowBounds: Encodable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

struct WindowResult: Encodable {
    let windowId: Int
    let pid: Int32
    let bounds: WindowBounds
}

func ownerName(from arguments: [String]) -> String? {
    guard let ownerIndex = arguments.firstIndex(of: "--owner") else {
        return nil
    }

    let valueIndex = arguments.index(after: ownerIndex)

    guard valueIndex < arguments.endIndex else {
        return nil
    }

    return arguments[valueIndex]
}

func ownerPid(from arguments: [String]) -> Int32? {
    guard let pidIndex = arguments.firstIndex(of: "--pid") else {
        return nil
    }

    let valueIndex = arguments.index(after: pidIndex)

    guard valueIndex < arguments.endIndex,
          let pid = Int32(arguments[valueIndex]) else {
        return nil
    }

    return pid
}

func bounds(from windowInfo: [String: Any]) -> CGRect? {
    guard let rawBounds = windowInfo[kCGWindowBounds as String] as? NSDictionary else {
        return nil
    }

    return CGRect(dictionaryRepresentation: rawBounds)
}

func isUsableWindow(_ windowInfo: [String: Any], rect: CGRect) -> Bool {
    guard rect.width > 0, rect.height > 0 else {
        return false
    }

    if let isOnscreen = (windowInfo[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue,
       !isOnscreen {
        return false
    }

    let alpha = (windowInfo[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1
    guard alpha > 0 else {
        return false
    }

    let layer = (windowInfo[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
    return layer == 0
}

guard let targetOwner = ownerName(from: CommandLine.arguments) else {
    FileHandle.standardError.write(Data("missing --owner argument\n".utf8))
    exit(1)
}

let targetPid = ownerPid(from: CommandLine.arguments)

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    FileHandle.standardError.write(Data("unable to read window list\n".utf8))
    exit(1)
}

for windowInfo in windowList {
    guard let owner = windowInfo[kCGWindowOwnerName as String] as? String, owner == targetOwner else {
        continue
    }

    guard let windowId = windowInfo[kCGWindowNumber as String] as? NSNumber,
          let pid = windowInfo[kCGWindowOwnerPID as String] as? NSNumber,
          let rect = bounds(from: windowInfo) else {
        continue
    }

    if let targetPid, pid.int32Value != targetPid {
        continue
    }

    guard isUsableWindow(windowInfo, rect: rect) else {
        continue
    }

    let result = WindowResult(
        windowId: windowId.intValue,
        pid: pid.int32Value,
        bounds: WindowBounds(
            x: Int(rect.origin.x.rounded()),
            y: Int(rect.origin.y.rounded()),
            width: Int(rect.size.width.rounded()),
            height: Int(rect.size.height.rounded())
        )
    )

    let encoder = JSONEncoder()
    let output = try encoder.encode(result)
    FileHandle.standardOutput.write(output)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(0)
}

FileHandle.standardError.write(Data("no matching window found\n".utf8))
exit(1)
