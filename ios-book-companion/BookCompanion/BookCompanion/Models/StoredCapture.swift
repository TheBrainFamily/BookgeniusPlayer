//
//  StoredCapture.swift
//  BookCompanion
//
//  Metadata for a capture persisted to disk.
//

import Foundation

/// Represents a captured page stored on disk.
struct StoredCapture: Identifiable {
    let id: UUID
    let fileURL: URL
    var processedFileURL: URL?
    let rectangle: DetectedRectangle
    let timestamp: Date

    init(
        id: UUID = UUID(),
        fileURL: URL,
        processedFileURL: URL? = nil,
        rectangle: DetectedRectangle,
        timestamp: Date
    ) {
        self.id = id
        self.fileURL = fileURL
        self.processedFileURL = processedFileURL
        self.rectangle = rectangle
        self.timestamp = timestamp
    }
}
