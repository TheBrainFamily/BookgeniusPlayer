//
//  FileProviderItem.swift
//  ConvexAssetMountProvider
//
//  Represents a file or folder from Convex asset-manager
//

import FileProvider
import UniformTypeIdentifiers

class FileProviderItem: NSObject, NSFileProviderItem {

    // MARK: - Storage

    private let itemType: ConvexItemType
    private let folderData: ConvexFolder?
    private let fileData: ConvexPublishedFile?

    // MARK: - Initializers

    /// Creates the root container item
    static func rootItem() -> FileProviderItem {
        FileProviderItem(itemType: .root, folder: nil, file: nil)
    }

    /// Creates a folder item
    static func folderItem(folder: ConvexFolder) -> FileProviderItem {
        FileProviderItem(itemType: .folder(path: folder.path), folder: folder, file: nil)
    }

    /// Creates a file item
    static func fileItem(file: ConvexPublishedFile) -> FileProviderItem {
        FileProviderItem(
            itemType: .file(folderPath: file.folderPath, basename: file.basename),
            folder: nil,
            file: file
        )
    }

    /// Creates an item from an identifier (for lookups)
    init(identifier: NSFileProviderItemIdentifier) {
        self.itemType = identifier.convexItemType
        self.folderData = nil
        self.fileData = nil
        super.init()
    }

    private init(itemType: ConvexItemType, folder: ConvexFolder?, file: ConvexPublishedFile?) {
        self.itemType = itemType
        self.folderData = folder
        self.fileData = file
        super.init()
    }

    // MARK: - Required Properties

    var itemIdentifier: NSFileProviderItemIdentifier {
        switch itemType {
        case .root:
            return .rootContainer
        case .folder, .file:
            return NSFileProviderItemIdentifier(itemType.identifierString)
        }
    }

    var parentItemIdentifier: NSFileProviderItemIdentifier {
        let parentString = itemType.parentIdentifierString
        if parentString == NSFileProviderItemIdentifier.rootContainer.rawValue {
            return .rootContainer
        }
        return NSFileProviderItemIdentifier(parentString)
    }

    var filename: String {
        switch itemType {
        case .root:
            return "Convex Assets"
        case .folder(let path):
            return folderData?.name ?? path.split(separator: "/").last.map(String.init) ?? path
        case .file(_, let basename):
            return basename
        }
    }

    var contentType: UTType {
        switch itemType {
        case .root, .folder:
            return .folder
        case .file(_, let basename):
            // Determine content type from filename extension
            if let fileContentType = fileData?.contentType {
                return UTType(mimeType: fileContentType) ?? .data
            }
            let ext = (basename as NSString).pathExtension.lowercased()
            return UTType(filenameExtension: ext) ?? .data
        }
    }

    // MARK: - Capabilities (Read-Only for now)

    var capabilities: NSFileProviderItemCapabilities {
        switch itemType {
        case .root, .folder:
            return [.allowsReading, .allowsContentEnumerating]
        case .file:
            return [.allowsReading]
        }
    }

    // MARK: - Version Tracking

    var itemVersion: NSFileProviderItemVersion {
        let contentVersion: String
        let metadataVersion: String

        switch itemType {
        case .root:
            contentVersion = "root-v1"
            metadataVersion = "root-v1"
        case .folder(let path):
            let updatedAt = folderData?.updatedAt ?? 0
            contentVersion = "folder-\(path)-\(updatedAt)"
            metadataVersion = contentVersion
        case .file(let folderPath, let basename):
            if let file = fileData {
                contentVersion = file.versionId
                metadataVersion = "\(folderPath)/\(basename)-\(file.version ?? 0)"
            } else {
                contentVersion = "\(folderPath)/\(basename)"
                metadataVersion = contentVersion
            }
        }

        return NSFileProviderItemVersion(
            contentVersion: contentVersion.data(using: .utf8)!,
            metadataVersion: metadataVersion.data(using: .utf8)!
        )
    }

    // MARK: - Optional Properties

    var documentSize: NSNumber? {
        guard case .file = itemType, let size = fileData?.size else {
            return nil
        }
        return NSNumber(value: size)
    }

    var creationDate: Date? {
        if let createdAt = folderData?.createdAt {
            return Date(timeIntervalSince1970: createdAt / 1000)
        }
        return nil
    }

    var contentModificationDate: Date? {
        if let updatedAt = folderData?.updatedAt {
            return Date(timeIntervalSince1970: updatedAt / 1000)
        }
        if let publishedAt = fileData?.publishedAt {
            return Date(timeIntervalSince1970: publishedAt / 1000)
        }
        return nil
    }

    // MARK: - File-specific Properties

    /// The version ID for downloading content (only for files)
    var versionId: String? {
        fileData?.versionId
    }

    /// Direct URL for file content (if available)
    var directURL: String? {
        fileData?.url
    }
}

// MARK: - Debug Description

extension FileProviderItem {
    override var description: String {
        switch itemType {
        case .root:
            return "FileProviderItem(root)"
        case .folder(let path):
            return "FileProviderItem(folder: \(path))"
        case .file(let folderPath, let basename):
            return "FileProviderItem(file: \(folderPath)/\(basename))"
        }
    }
}
