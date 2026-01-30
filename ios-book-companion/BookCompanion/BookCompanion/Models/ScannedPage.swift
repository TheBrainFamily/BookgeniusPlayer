//
//  ScannedPage.swift
//  BookCompanion
//
//  Model for a scanned book page, ready for cloud processing.
//

import Foundation
import UIKit

/// Represents a scanned page ready for processing
struct ScannedPage: Identifiable {
    let id: UUID
    let image: UIImage
    let capturedAt: Date
    let estimatedPageNumber: Int?

    /// JPEG data for upload (80% quality balances size and OCR accuracy)
    var jpegData: Data? {
        image.jpegData(compressionQuality: 0.8)
    }

    init(
        id: UUID = UUID(),
        image: UIImage,
        capturedAt: Date = Date(),
        estimatedPageNumber: Int? = nil
    ) {
        self.id = id
        self.image = image
        self.capturedAt = capturedAt
        self.estimatedPageNumber = estimatedPageNumber
    }

    /// Create from a CaptureResult
    init(from result: CaptureResult, estimatedPageNumber: Int?) {
        self.id = UUID()
        self.image = result.image
        self.capturedAt = result.timestamp
        self.estimatedPageNumber = estimatedPageNumber
    }
}

/// A scanning session containing multiple pages from one book
class ScanningSession: ObservableObject, Identifiable {
    let id: UUID
    let startedAt: Date

    @Published var pages: [ScannedPage] = []
    @Published var bookTitle: String?
    @Published var currentChapter: String?

    /// Last captured page number (for estimating next page)
    private(set) var lastPageNumber: Int = 0

    init(id: UUID = UUID(), startedAt: Date = Date()) {
        self.id = id
        self.startedAt = startedAt
    }

    /// Add a captured page to the session
    func addPage(_ result: CaptureResult) {
        let estimatedPage = lastPageNumber + 1
        let page = ScannedPage(from: result, estimatedPageNumber: estimatedPage)
        pages.append(page)
        lastPageNumber = estimatedPage
    }

    /// Update the last page number (e.g., after OCR confirms actual number)
    func updateLastPageNumber(_ number: Int) {
        lastPageNumber = number
    }

    /// Remove a page by ID
    func removePage(_ id: UUID) {
        pages.removeAll { $0.id == id }
    }

    /// Clear all pages
    func clearPages() {
        pages.removeAll()
        lastPageNumber = 0
    }
}
