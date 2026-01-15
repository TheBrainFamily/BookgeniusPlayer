//
//  CaptureStore.swift
//  BookCompanion
//
//  Persists captured pages to disk for long scanning sessions.
//

import Foundation
import UIKit

/// Stores captured images on disk to avoid memory growth during long sessions.
final class CaptureStore {

    private let ioQueue = DispatchQueue(
        label: "pro.lgandecki.BookCompanion.captureStore",
        qos: .utility
    )

    private let sessionId: UUID
    private let baseURL: URL

    init(sessionId: UUID = UUID()) {
        self.sessionId = sessionId

        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let scansRoot = documents.appendingPathComponent("Scans", isDirectory: true)
        baseURL = scansRoot.appendingPathComponent(sessionId.uuidString, isDirectory: true)
    }

    func save(result: CaptureResult, index: Int) async -> StoredCapture? {
        await withCheckedContinuation { continuation in
            ioQueue.async {
                do {
                    try FileManager.default.createDirectory(
                        at: self.baseURL,
                        withIntermediateDirectories: true
                    )
                } catch {
                    print("[CaptureStore] Failed to create directory: \(error)")
                }

                let filename = String(format: "page-%04d.jpg", index)
                let fileURL = self.baseURL.appendingPathComponent(filename)

                guard let data = result.image.jpegData(compressionQuality: 0.9) else {
                    print("[CaptureStore] Failed to encode JPEG")
                    continuation.resume(returning: nil)
                    return
                }

                do {
                    try data.write(to: fileURL, options: .atomic)
                    let stored = StoredCapture(
                        fileURL: fileURL,
                        rectangle: result.rectangle,
                        timestamp: result.timestamp
                    )
                    continuation.resume(returning: stored)
                } catch {
                    print("[CaptureStore] Failed to write capture: \(error)")
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}
