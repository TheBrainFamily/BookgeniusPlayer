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
    let rectangle: DetectedRectangle
    let timestamp: Date

    init(
        id: UUID = UUID(),
        fileURL: URL,
        rectangle: DetectedRectangle,
        timestamp: Date
    ) {
        self.id = id
        self.fileURL = fileURL
        self.rectangle = rectangle
        self.timestamp = timestamp
    }
}
