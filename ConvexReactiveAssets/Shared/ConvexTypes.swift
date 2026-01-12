//
//  ConvexTypes.swift
//  ConvexReactiveAssets
//
//  Data models for Convex asset-manager
//

import Foundation
import FileProvider

// MARK: - Convex Response Wrapper

struct ConvexResponse<T: Decodable>: Decodable {
    let value: T?
    let status: String?
    let errorMessage: String?
}

// MARK: - Folder

struct ConvexFolder: Decodable, Identifiable {
    let _id: String
    let path: String
    let name: String
    let createdAt: Double?
    let updatedAt: Double?

    var id: String { _id }

    /// Creates a folder from just a path (for lookups without API call)
    init(path: String) {
        self._id = "folder:\(path)"
        self.path = path
        self.name = path.split(separator: "/").last.map(String.init) ?? path
        self.createdAt = nil
        self.updatedAt = nil
    }

    /// Extracts the parent path from this folder's path
    var parentPath: String? {
        let components = path.split(separator: "/")
        guard components.count > 1 else { return nil }
        return components.dropLast().joined(separator: "/")
    }

    /// The folder's own segment name (last component of path)
    var segment: String {
        path.split(separator: "/").last.map(String.init) ?? path
    }
}

// MARK: - Asset (File Metadata)

struct ConvexAsset: Decodable, Identifiable {
    let _id: String
    let folderPath: String
    let basename: String
    let versionCounter: Int?
    let publishedVersionId: String?
    let draftVersionId: String?
    let createdAt: Double?
    let updatedAt: Double?

    var id: String { _id }
}

// MARK: - Asset Version

struct ConvexAssetVersion: Decodable, Identifiable {
    let _id: String
    let assetId: String
    let version: Int
    let state: String  // "draft", "published", "archived"
    let label: String?
    let storageId: String?
    let r2Key: String?
    let originalFilename: String?
    let size: Int?
    let contentType: String?
    let sha256: String?
    let createdAt: Double?
    let publishedAt: Double?

    var id: String { _id }
}

// MARK: - Published File (from listPublishedFilesInFolder)

struct ConvexPublishedFile: Decodable, Identifiable {
    let folderPath: String
    let basename: String
    let version: Int
    let versionId: String
    let url: String          // Direct download URL
    let contentType: String?
    let size: Int?
    let publishedAt: Double?
    // Optional fields that may come from Convex
    let storageId: String?
    let r2Key: String?

    var id: String { "\(folderPath)/\(basename)" }
}


// MARK: - Item Identifier Parsing

/// Represents the type of item in the File Provider
enum ConvexItemType {
    case root
    case folder(path: String)
    case file(folderPath: String, basename: String)

    /// Creates an item type from a FileProvider identifier string
    static func from(identifier: String) -> ConvexItemType {
        if identifier == "root" || identifier == NSFileProviderItemIdentifier.rootContainer.rawValue {
            return .root
        }

        if identifier.hasPrefix("folder:") {
            let path = String(identifier.dropFirst("folder:".count))
            return .folder(path: path)
        }

        if identifier.hasPrefix("file:") {
            let rest = String(identifier.dropFirst("file:".count))
            if let separatorIndex = rest.lastIndex(of: ":") {
                let folderPath = String(rest[..<separatorIndex])
                let basename = String(rest[rest.index(after: separatorIndex)...])
                return .file(folderPath: folderPath, basename: basename)
            }
        }

        // Fallback: treat as folder path
        return .folder(path: identifier)
    }

    /// Converts to a FileProvider identifier string
    var identifierString: String {
        switch self {
        case .root:
            return NSFileProviderItemIdentifier.rootContainer.rawValue
        case .folder(let path):
            return "folder:\(path)"
        case .file(let folderPath, let basename):
            return "file:\(folderPath):\(basename)"
        }
    }

    /// Returns the parent identifier string
    var parentIdentifierString: String {
        switch self {
        case .root:
            return NSFileProviderItemIdentifier.rootContainer.rawValue
        case .folder(let path):
            let components = path.split(separator: "/")
            if components.count <= 1 {
                return NSFileProviderItemIdentifier.rootContainer.rawValue
            }
            let parentPath = components.dropLast().joined(separator: "/")
            return "folder:\(parentPath)"
        case .file(let folderPath, _):
            if folderPath.isEmpty {
                return NSFileProviderItemIdentifier.rootContainer.rawValue
            }
            return "folder:\(folderPath)"
        }
    }
}

extension NSFileProviderItemIdentifier {
    var convexItemType: ConvexItemType {
        ConvexItemType.from(identifier: self.rawValue)
    }
}
