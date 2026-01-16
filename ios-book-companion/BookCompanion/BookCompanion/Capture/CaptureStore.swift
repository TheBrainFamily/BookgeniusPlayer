//
//  CaptureStore.swift
//  BookCompanion
//
//  Persists captured pages to disk for long scanning sessions.
//

import Foundation
import UIKit
import UniformTypeIdentifiers
import ImageIO

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

                let filename = String(format: "page-%04d.heic", index)
                let fileURL = self.baseURL.appendingPathComponent(filename)

                guard let data = self.encodeHeic(result.image, quality: 0.98) else {
                    print("[CaptureStore] Failed to encode HEIC")
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

    func saveProcessed(image: UIImage, for stored: StoredCapture) async -> URL? {
        await withCheckedContinuation { continuation in
            ioQueue.async {
                let directory = stored.fileURL.deletingLastPathComponent()
                let baseName = stored.fileURL.deletingPathExtension().lastPathComponent
                let processedURL = directory.appendingPathComponent("\(baseName)-cropped.jpg")

                guard let data = image.jpegData(compressionQuality: 0.95) else {
                    print("[CaptureStore] Failed to encode processed JPEG")
                    continuation.resume(returning: nil)
                    return
                }

                do {
                    try data.write(to: processedURL, options: .atomic)
                    continuation.resume(returning: processedURL)
                } catch {
                    print("[CaptureStore] Failed to write processed capture: \(error)")
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func encodeHeic(_ image: UIImage, quality: CGFloat) -> Data? {
        guard let cgImage = image.cgImage else {
            return nil
        }

        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            data,
            UTType.heic.identifier as CFString,
            1,
            nil
        ) else {
            return nil
        }

        let options: [CFString: Any] = [
            kCGImageDestinationLossyCompressionQuality: quality
        ]

        CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)

        guard CGImageDestinationFinalize(destination) else {
            return nil
        }

        return data as Data
    }
}
