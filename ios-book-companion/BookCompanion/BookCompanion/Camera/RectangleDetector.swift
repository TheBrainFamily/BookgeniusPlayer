//
//  RectangleDetector.swift
//  BookCompanion
//
//  Detects page rectangles using Vision framework.
//  Optimized for book pages with appropriate aspect ratios.
//

import Vision
@preconcurrency import AVFoundation
import Combine
import CoreImage

/// Represents a detected rectangle with its four corners.
/// Coordinates are normalized (0-1) in Vision coordinate space.
struct DetectedRectangle: Equatable {
    let topLeft: CGPoint
    let topRight: CGPoint
    let bottomLeft: CGPoint
    let bottomRight: CGPoint
    let confidence: Float

    /// The center point of the rectangle
    var center: CGPoint {
        CGPoint(
            x: (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4,
            y: (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4
        )
    }

    /// Approximate area (normalized, 0-1 range)
    var area: CGFloat {
        // Use shoelace formula for quadrilateral area
        let x = [topLeft.x, topRight.x, bottomRight.x, bottomLeft.x]
        let y = [topLeft.y, topRight.y, bottomRight.y, bottomLeft.y]

        var sum: CGFloat = 0
        for i in 0..<4 {
            let j = (i + 1) % 4
            sum += x[i] * y[j] - x[j] * y[i]
        }
        return abs(sum) / 2
    }

    /// Check if corners are close to another rectangle (for stability check)
    func isClose(to other: DetectedRectangle, threshold: CGFloat) -> Bool {
        let d1 = distance(topLeft, other.topLeft)
        let d2 = distance(topRight, other.topRight)
        let d3 = distance(bottomLeft, other.bottomLeft)
        let d4 = distance(bottomRight, other.bottomRight)

        return d1 < threshold && d2 < threshold && d3 < threshold && d4 < threshold
    }

    private func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
        sqrt(pow(a.x - b.x, 2) + pow(a.y - b.y, 2))
    }
}

/// Detects rectangles in camera frames using Vision.
/// Publishes detected rectangles for downstream processing.
final class RectangleDetector: ObservableObject {

    // MARK: - Published State

    /// Currently detected rectangles (usually 1-2 for book pages)
    @MainActor @Published private(set) var detectedRectangles: [DetectedRectangle] = []

    /// Whether any rectangle is currently detected
    @MainActor @Published private(set) var hasDetection: Bool = false

    /// Frame count for debugging
    @MainActor @Published private(set) var frameCount: Int = 0

    // MARK: - Processing Queue

    private let processingQueue = DispatchQueue(
        label: "pro.lgandecki.BookCompanion.rectangleDetection",
        qos: .userInteractive
    )

    // MARK: - Subscriptions

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    init() {}

    /// Subscribe to frame publisher from CameraManager
    func subscribe(to framePublisher: PassthroughSubject<CMSampleBuffer, Never>) {
        framePublisher
            .receive(on: processingQueue)
            .sink { [weak self] sampleBuffer in
                self?.processFrame(sampleBuffer)
            }
            .store(in: &cancellables)

        print("[RectangleDetector] Subscribed to frame publisher")
    }

    // MARK: - Frame Processing

    private func processFrame(_ sampleBuffer: CMSampleBuffer) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            print("[RectangleDetector] Failed to get pixel buffer")
            return
        }

        // Update frame count on main actor
        Task { @MainActor in
            self.frameCount += 1
        }

        // Create a fresh request for each frame
        let request = VNDetectRectanglesRequest { [weak self] request, error in
            self?.handleResults(request: request, error: error)
        }

        // Configure for book pages - tuned for actual page detection
        request.minimumAspectRatio = 0.5    // Portrait pages (taller than wide)
        request.maximumAspectRatio = 0.9    // Not too square (filters laptops)
        request.quadratureTolerance = 30    // Tolerance for skew
        request.minimumConfidence = 0.6     // Moderate confidence
        request.maximumObservations = 2     // Just 1-2 candidates
        request.minimumSize = 0.15          // At least 15% of screen (filters small rects)

        let handler = VNImageRequestHandler(
            cvPixelBuffer: pixelBuffer,
            orientation: .up,
            options: [:]
        )

        do {
            try handler.perform([request])
        } catch {
            print("[RectangleDetector] Detection error: \(error)")
        }
    }

    private func handleResults(request: VNRequest, error: Error?) {
        if let error = error {
            print("[RectangleDetector] Vision error: \(error)")
            Task { @MainActor in
                self.detectedRectangles = []
                self.hasDetection = false
            }
            return
        }

        guard let results = request.results as? [VNRectangleObservation] else {
            Task { @MainActor in
                self.detectedRectangles = []
                self.hasDetection = false
            }
            return
        }

        // Convert Vision observations to our model and filter for page-like rectangles
        let allRectangles = results.map { observation in
            DetectedRectangle(
                topLeft: observation.topLeft,
                topRight: observation.topRight,
                bottomLeft: observation.bottomLeft,
                bottomRight: observation.bottomRight,
                confidence: observation.confidence
            )
        }

        // Filter: must cover at least 5% of screen area (a real page would be much larger)
        // and prefer larger rectangles (actual pages vs small detected shapes)
        let rectangles = allRectangles
            .filter { $0.area > 0.05 }  // At least 5% of screen
            .sorted { $0.area > $1.area }  // Largest first
            .prefix(1)  // Just the best candidate
            .map { $0 }

        // Debug: log periodically
        if !results.isEmpty && Task.isCancelled == false {
            let areas = allRectangles.map { String(format: "%.2f", $0.area) }
            let filtered = rectangles.map { String(format: "%.2f", $0.area) }
            print("[RectangleDetector] Found \(results.count) rect(s), areas: \(areas), kept: \(filtered)")
        }

        Task { @MainActor in
            self.detectedRectangles = rectangles
            self.hasDetection = !rectangles.isEmpty
        }
    }
}
