//
//  FileProviderExtension.swift
//  ConvexAssetMountProvider
//
//  Main File Provider extension for Convex asset-manager
//

import FileProvider
import os.log

class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {

    private let logger = Logger(subsystem: "pro.lgandecki.ConvexAssetMountProvider", category: "Extension")
    private let domain: NSFileProviderDomain

    // Config from domain userInfo
    private let convexUrl: String?
    private let adminKey: String?

    required init(domain: NSFileProviderDomain) {
        self.domain = domain

        // Debug: log everything about the domain
        print("🚀 Domain identifier: \(domain.identifier.rawValue)")
        print("🚀 Domain displayName: \(domain.displayName)")

        // Extract URL and admin key from domain identifier
        // Format: "convex|{encodedUrl}|{encodedAdminKey}"
        let identifier = domain.identifier.rawValue
        let parts = identifier.split(separator: "|", omittingEmptySubsequences: false).map(String.init)

        if parts.count >= 2 && parts[0] == "convex" {
            self.convexUrl = parts[1].removingPercentEncoding
            self.adminKey = parts.count >= 3 && !parts[2].isEmpty ? parts[2].removingPercentEncoding : nil
            print("🚀 Decoded URL: \(self.convexUrl ?? "DECODE FAILED")")
            print("🚀 Decoded adminKey: \(self.adminKey != nil ? "[SET]" : "NIL")")
        } else {
            self.convexUrl = nil
            self.adminKey = nil
            print("🚀 Invalid identifier format: \(identifier)")
        }

        super.init()

        print("🚀 Final URL: \(convexUrl ?? "NIL")")
        print("🚀 Final adminKey: \(adminKey != nil ? "[SET]" : "NIL")")

        logger.info("FileProviderExtension initialized for domain: \(domain.identifier.rawValue)")
    }

    func invalidate() {
        logger.info("FileProviderExtension invalidated")
    }

    // MARK: - Item Lookup

    func item(for identifier: NSFileProviderItemIdentifier, request: NSFileProviderRequest, completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void) -> Progress {
        logger.info("Looking up item: \(identifier.rawValue)")

        // Handle special identifiers
        if identifier == .rootContainer {
            completionHandler(FileProviderItem.rootItem(), nil)
            return Progress()
        }

        if identifier == .workingSet {
            // Working set doesn't have a single item representation
            completionHandler(nil, NSFileProviderError(.noSuchItem))
            return Progress()
        }

        // Parse the identifier to determine what to fetch
        let itemType = identifier.convexItemType

        Task {
            do {
                let item: FileProviderItem

                switch itemType {
                case .root:
                    item = FileProviderItem.rootItem()

                case .folder(let path):
                    // Create folder from path - no API call needed
                    let folder = ConvexFolder(path: path)
                    item = FileProviderItem.folderItem(folder: folder)

                case .file(let folderPath, let basename):
                    guard let client = createClient() else {
                        throw NSFileProviderError(.notAuthenticated)
                    }
                    guard let file = try await client.getPublishedFile(folderPath: folderPath, basename: basename) else {
                        throw NSFileProviderError(.noSuchItem)
                    }
                    item = FileProviderItem.fileItem(file: file)
                }

                self.logger.info("Item lookup succeeded: \(item.filename)")
                completionHandler(item, nil)
            } catch {
                self.logger.error("Item lookup failed: \(error.localizedDescription)")
                completionHandler(nil, error)
            }
        }

        return Progress()
    }

    // MARK: - Content Fetching

    func fetchContents(for itemIdentifier: NSFileProviderItemIdentifier, version requestedVersion: NSFileProviderItemVersion?, request: NSFileProviderRequest, completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void) -> Progress {
        logger.info("Fetching contents for: \(itemIdentifier.rawValue)")

        let progress = Progress(totalUnitCount: 100)

        Task {
            do {
                guard let client = createClient() else {
                    throw NSFileProviderError(.notAuthenticated)
                }

                let itemType = itemIdentifier.convexItemType

                guard case .file(let folderPath, let basename) = itemType else {
                    throw NSFileProviderError(.noSuchItem)
                }

                // Get file metadata
                guard let file = try await client.getPublishedFile(folderPath: folderPath, basename: basename) else {
                    throw NSFileProviderError(.noSuchItem)
                }

                let item = FileProviderItem.fileItem(file: file)

                // Create temporary file for download
                let tempDir = FileManager.default.temporaryDirectory
                let tempFile = tempDir.appendingPathComponent(UUID().uuidString).appendingPathExtension(
                    (basename as NSString).pathExtension
                )

                self.logger.info("Downloading to: \(tempFile.path) from: \(file.url)")

                // Download the file content using the direct URL
                progress.completedUnitCount = 10
                _ = try await client.downloadToFile(from: file.url, destinationURL: tempFile)
                progress.completedUnitCount = 100

                self.logger.info("Download complete: \(basename)")
                completionHandler(tempFile, item, nil)
            } catch {
                self.logger.error("Fetch contents failed: \(error.localizedDescription)")
                completionHandler(nil, nil, error)
            }
        }

        return progress
    }

    // MARK: - Enumerator

    func enumerator(for containerItemIdentifier: NSFileProviderItemIdentifier, request: NSFileProviderRequest) throws -> NSFileProviderEnumerator {
        logger.info("Creating enumerator for: \(containerItemIdentifier.rawValue)")
        print("📁 Creating enumerator for: \(containerItemIdentifier.rawValue)")

        if containerItemIdentifier == .workingSet {
            return WorkingSetEnumerator()
        }

        return FileProviderEnumerator(
            enumeratedItemIdentifier: containerItemIdentifier,
            convexUrl: convexUrl,
            adminKey: adminKey
        )
    }

    // MARK: - Write Operations (Read-Only Stubs)

    func createItem(basedOn itemTemplate: NSFileProviderItem, fields: NSFileProviderItemFields, contents url: URL?, options: NSFileProviderCreateItemOptions = [], request: NSFileProviderRequest, completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
        logger.info("Create item requested (read-only mode)")
        completionHandler(nil, [], false, NSFileProviderError(.notAuthenticated))
        return Progress()
    }

    func modifyItem(_ item: NSFileProviderItem, baseVersion version: NSFileProviderItemVersion, changedFields: NSFileProviderItemFields, contents newContents: URL?, options: NSFileProviderModifyItemOptions = [], request: NSFileProviderRequest, completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
        logger.info("Modify item requested (read-only mode)")
        completionHandler(nil, [], false, NSFileProviderError(.notAuthenticated))
        return Progress()
    }

    func deleteItem(identifier: NSFileProviderItemIdentifier, baseVersion version: NSFileProviderItemVersion, options: NSFileProviderDeleteItemOptions = [], request: NSFileProviderRequest, completionHandler: @escaping (Error?) -> Void) -> Progress {
        logger.info("Delete item requested (read-only mode)")
        completionHandler(NSFileProviderError(.notAuthenticated))
        return Progress()
    }

    // MARK: - Private Helpers

    private func createClient() -> ConvexClient? {
        guard let url = convexUrl, !url.isEmpty else {
            logger.error("Not configured - no Convex URL in domain userInfo")
            print("❌ createClient failed - no URL")
            return nil
        }

        print("✅ createClient with URL: \(url)")
        logger.info("Using config URL: \(url)")
        return ConvexClient(convexUrl: url, adminKey: adminKey)
    }
}
