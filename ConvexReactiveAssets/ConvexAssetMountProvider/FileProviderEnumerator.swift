//
//  FileProviderEnumerator.swift
//  ConvexAssetMountProvider
//
//  Enumerates folders and files from Convex asset-manager
//

import FileProvider
import os.log

class FileProviderEnumerator: NSObject, NSFileProviderEnumerator {

    private let logger = Logger(subsystem: "pro.lgandecki.ConvexAssetMountProvider", category: "Enumerator")
    private let enumeratedItemIdentifier: NSFileProviderItemIdentifier
    private let convexUrl: String?
    private let adminKey: String?

    // Sync anchor for change tracking (timestamp-based)
    private var currentAnchor: Date = Date()

    init(enumeratedItemIdentifier: NSFileProviderItemIdentifier, convexUrl: String?, adminKey: String?) {
        self.enumeratedItemIdentifier = enumeratedItemIdentifier
        self.convexUrl = convexUrl
        self.adminKey = adminKey
        super.init()
        logger.info("Created enumerator for: \(enumeratedItemIdentifier.rawValue)")
        print("📂 Enumerator created with URL: \(convexUrl ?? "NIL")")
    }

    func invalidate() {
        logger.info("Enumerator invalidated for: \(self.enumeratedItemIdentifier.rawValue)")
    }

    // MARK: - Item Enumeration

    func enumerateItems(for observer: NSFileProviderEnumerationObserver, startingAt page: NSFileProviderPage) {
        print("📂 ENUMERATE START for: \(self.enumeratedItemIdentifier.rawValue)")
        print("📂 Using URL: \(convexUrl ?? "NIL")")
        print("📂 AdminKey: \(adminKey != nil ? "[SET]" : "NIL")")
        logger.info("=== ENUMERATE ITEMS START ===")

        Task {
            do {
                print("📂 Calling fetchItems...")
                logger.info("Starting fetchItems...")
                let items = try await fetchItems()
                print("📂 SUCCESS: Found \(items.count) items")
                logger.info("SUCCESS: Found \(items.count) items")
                for item in items {
                    print("📂   - Item: \(item.filename)")
                    logger.info("  - Item: \(item.filename)")
                }
                observer.didEnumerate(items)
                observer.finishEnumerating(upTo: nil)
                print("📂 ENUMERATE DONE")
                logger.info("=== ENUMERATE ITEMS DONE ===")
            } catch {
                print("📂 FAILED: \(error.localizedDescription)")
                print("📂 Error details: \(error)")
                logger.error("FAILED: Enumeration error: \(error.localizedDescription)")
                logger.error("Error details: \(String(describing: error))")
                observer.finishEnumeratingWithError(error)
            }
        }
    }

    // MARK: - Change Enumeration

    func enumerateChanges(for observer: NSFileProviderChangeObserver, from anchor: NSFileProviderSyncAnchor) {
        logger.info("Enumerating changes from anchor")

        // For now, we don't track incremental changes - just report no changes
        // In a full implementation, you'd compare server state with the anchor
        let newAnchor = makeAnchor(from: Date())
        observer.finishEnumeratingChanges(upTo: newAnchor, moreComing: false)
    }

    func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
        completionHandler(makeAnchor(from: currentAnchor))
    }

    // MARK: - Private Methods

    private func fetchItems() async throws -> [NSFileProviderItem] {
        guard let client = createClient() else {
            throw NSError(
                domain: NSFileProviderErrorDomain,
                code: NSFileProviderError.notAuthenticated.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "Not configured. Please configure the app first."]
            )
        }

        let itemType = enumeratedItemIdentifier.convexItemType

        switch itemType {
        case .root:
            return try await fetchRootContents(client: client)
        case .folder(let path):
            return try await fetchFolderContents(client: client, folderPath: path)
        case .file:
            // Files don't have children
            return []
        }
    }

    private func fetchRootContents(client: ConvexClient) async throws -> [NSFileProviderItem] {
        logger.info("Fetching root contents")

        var items: [NSFileProviderItem] = []

        // Get top-level folders
        let folders = try await client.listFolders(parentPath: nil)
        logger.info("Found \(folders.count) root folders")

        for folder in folders {
            items.append(FileProviderItem.folderItem(folder: folder))
        }

        // Get files in root (empty folder path)
        let files = try await client.listPublishedFiles(folderPath: "")
        logger.info("Found \(files.count) root files")

        for file in files {
            items.append(FileProviderItem.fileItem(file: file))
        }

        return items
    }

    private func fetchFolderContents(client: ConvexClient, folderPath: String) async throws -> [NSFileProviderItem] {
        logger.info("Fetching folder contents: \(folderPath)")

        var items: [NSFileProviderItem] = []

        // Get child folders
        let folders = try await client.listFolders(parentPath: folderPath)
        logger.info("Found \(folders.count) subfolders in \(folderPath)")

        for folder in folders {
            items.append(FileProviderItem.folderItem(folder: folder))
        }

        // Get files in this folder
        let files = try await client.listPublishedFiles(folderPath: folderPath)
        logger.info("Found \(files.count) files in \(folderPath)")

        for file in files {
            items.append(FileProviderItem.fileItem(file: file))
        }

        return items
    }

    private func createClient() -> ConvexClient? {
        guard let url = convexUrl, !url.isEmpty else {
            logger.error("Not configured - no Convex URL")
            print("❌ Enumerator createClient failed - no URL")
            return nil
        }

        print("✅ Enumerator createClient with URL: \(url)")
        logger.info("Using config URL: \(url)")
        return ConvexClient(convexUrl: url, adminKey: adminKey)
    }

    private func makeAnchor(from date: Date) -> NSFileProviderSyncAnchor {
        let timestamp = String(date.timeIntervalSince1970)
        return NSFileProviderSyncAnchor(timestamp.data(using: .utf8)!)
    }
}

// MARK: - Working Set Enumerator

/// Enumerator for the working set (recently accessed items)
class WorkingSetEnumerator: NSObject, NSFileProviderEnumerator {

    private let logger = Logger(subsystem: "pro.lgandecki.ConvexAssetMountProvider", category: "WorkingSet")

    func invalidate() {
        logger.info("Working set enumerator invalidated")
    }

    func enumerateItems(for observer: NSFileProviderEnumerationObserver, startingAt page: NSFileProviderPage) {
        // Working set is empty for now - could track recently accessed files
        observer.didEnumerate([])
        observer.finishEnumerating(upTo: nil)
    }

    func enumerateChanges(for observer: NSFileProviderChangeObserver, from anchor: NSFileProviderSyncAnchor) {
        observer.finishEnumeratingChanges(upTo: anchor, moreComing: false)
    }

    func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
        completionHandler(NSFileProviderSyncAnchor("workingset".data(using: .utf8)!))
    }
}
