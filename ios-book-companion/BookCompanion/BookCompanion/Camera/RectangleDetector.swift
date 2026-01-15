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

/// Rectangle observation tied to a specific video frame timestamp
struct TimedRectangle: Equatable {
    let rectangle: DetectedRectangle
    let timestamp: CMTime
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

    /// Size of the current video frame (pixels)
    @MainActor @Published private(set) var imageSize: CGSize = .zero

    /// Most recent rectangle observation with timestamp
    @MainActor @Published private(set) var latestObservation: TimedRectangle?

    // MARK: - Processing Queue

    private let processingQueue = DispatchQueue(
        label: "pro.lgandecki.BookCompanion.rectangleDetection",
        qos: .userInteractive
    )

    // MARK: - Subscriptions

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Selection State

    /// Last selected rectangle for temporal consistency
    private var lastRectangle: DetectedRectangle?

    // MARK: - Tracking

    private var sequenceHandler = VNSequenceRequestHandler()
    private var trackingRequest: VNTrackRectangleRequest?
    private var trackingFrameIndex: Int = 0
    private let detectionRefreshInterval: Int = 12
    private let trackingConfidenceThreshold: Float = 0.6

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

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        // Update frame count on main actor
        Task { @MainActor in
            self.frameCount += 1
            let newSize = CGSize(width: width, height: height)
            if self.imageSize != newSize {
                self.imageSize = newSize
            }
        }

        trackingFrameIndex += 1
        let shouldRefreshDetection = trackingRequest != nil && trackingFrameIndex % detectionRefreshInterval == 0

        if shouldRefreshDetection {
            if performDetection(on: pixelBuffer, timestamp: timestamp) {
                return
            }
            if performTracking(on: pixelBuffer, timestamp: timestamp) {
                return
            }
        } else if trackingRequest != nil {
            if performTracking(on: pixelBuffer, timestamp: timestamp) {
                return
            }
            _ = performDetection(on: pixelBuffer, timestamp: timestamp)
        } else {
            _ = performDetection(on: pixelBuffer, timestamp: timestamp)
        }
    }

    private func performTracking(on pixelBuffer: CVPixelBuffer, timestamp: CMTime) -> Bool {
        guard let trackingRequest else { return false }

        do {
            try sequenceHandler.perform([trackingRequest], on: pixelBuffer, orientation: .up)
        } catch {
            handleTrackingError(error)
            self.trackingRequest = nil
            publishEmptyIfNeeded()
            return false
        }

        guard let results = trackingRequest.results else {
            self.trackingRequest = nil
            publishEmptyIfNeeded()
            return false
        }

        if let observation = results.first as? VNRectangleObservation {
            guard observation.confidence >= trackingConfidenceThreshold else {
                self.trackingRequest = nil
                publishEmptyIfNeeded()
                return false
            }

            let rectangle = rectangleFromObservation(observation)
            lastRectangle = rectangle
            trackingRequest.inputObservation = observation
            publish(rectangle: rectangle, timestamp: timestamp)
            return true
        }

        self.trackingRequest = nil
        publishEmptyIfNeeded()
        return false
    }

    private func performDetection(on pixelBuffer: CVPixelBuffer, timestamp: CMTime) -> Bool {
        let rectangleCandidate = performRectangleDetection(on: pixelBuffer)
        let segmentationCandidate = performDocumentSegmentation(on: pixelBuffer)

        if let selected = selectCandidate(
            rectangleCandidate: rectangleCandidate,
            segmentationCandidate: segmentationCandidate
        ) {
            lastRectangle = selected.rectangle
            updateTrackingRequest(with: selected.observation)
            publish(rectangle: selected.rectangle, timestamp: timestamp)
            return true
        }

        publishEmptyIfNeeded()
        return false
    }

    private func performDocumentSegmentation(
        on pixelBuffer: CVPixelBuffer
    ) -> (observation: VNRectangleObservation, rectangle: DetectedRectangle)? {
        guard #available(iOS 15.0, *) else {
            return nil
        }

        let handler = VNImageRequestHandler(
            cvPixelBuffer: pixelBuffer,
            orientation: .up,
            options: [:]
        )

        let firstPass = segmentationResults(
            handler: handler,
            regionOfInterest: lastRectangle.map { regionOfInterest(for: $0) }
        )

        let results = firstPass ?? segmentationResults(handler: handler, regionOfInterest: nil)

        guard let results, !results.isEmpty else {
            return nil
        }

        let candidates: [(observation: VNRectangleObservation, rectangle: DetectedRectangle)] = results.map { observation in
            (observation, rectangleFromObservation(observation))
        }

        let filtered = candidates.filter { $0.rectangle.area > 0.05 }
        let sorted = filtered.sorted { lhs, rhs in
            score(rectangle: lhs.rectangle) > score(rectangle: rhs.rectangle)
        }

        return sorted.first
    }

    private func performRectangleDetection(
        on pixelBuffer: CVPixelBuffer
    ) -> (observation: VNRectangleObservation, rectangle: DetectedRectangle)? {
        let request = VNDetectRectanglesRequest()

        // Configure for book pages - tuned for actual page detection
        request.minimumAspectRatio = 0.3    // Allow wide spreads
        request.maximumAspectRatio = 2.0    // Allow wide spreads
        request.quadratureTolerance = 30    // Tolerance for skew
        request.minimumConfidence = 0.6     // Moderate confidence
        request.maximumObservations = 2     // Just 1-2 candidates
        request.minimumSize = 0.15          // At least 15% of screen (filters small rects)

        let handler = VNImageRequestHandler(
            cvPixelBuffer: pixelBuffer,
            orientation: .up,
            options: [:]
        )

        let firstPass = rectangleResults(
            handler: handler,
            request: request,
            regionOfInterest: lastRectangle.map { regionOfInterest(for: $0) }
        )

        let results = firstPass ?? rectangleResults(handler: handler, request: request, regionOfInterest: nil)

        guard let results, !results.isEmpty else {
            return nil
        }

        let candidates: [(observation: VNRectangleObservation, rectangle: DetectedRectangle)] = results.map { observation in
            (observation, rectangleFromObservation(observation))
        }

        let filtered = candidates.filter { $0.rectangle.area > 0.05 }
        let sorted = filtered.sorted { lhs, rhs in
            score(rectangle: lhs.rectangle) > score(rectangle: rhs.rectangle)
        }

        return sorted.first
    }

    @available(iOS 15.0, *)
    private func segmentationResults(
        handler: VNImageRequestHandler,
        regionOfInterest: CGRect?
    ) -> [VNRectangleObservation]? {
        let request = VNDetectDocumentSegmentationRequest()
        if let regionOfInterest {
            request.regionOfInterest = regionOfInterest
        }

        do {
            try handler.perform([request])
        } catch {
            print("[RectangleDetector] Segmentation error: \(error)")
            return nil
        }

        let results = request.results ?? []
        let rectangles = results.compactMap { $0 as? VNRectangleObservation }
        return rectangles
    }

    private func rectangleResults(
        handler: VNImageRequestHandler,
        request: VNDetectRectanglesRequest,
        regionOfInterest: CGRect?
    ) -> [VNRectangleObservation]? {
        if let regionOfInterest {
            request.regionOfInterest = regionOfInterest
        } else {
            request.regionOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
        }

        do {
            try handler.perform([request])
        } catch {
            print("[RectangleDetector] Detection error: \(error)")
            return nil
        }

        return request.results as? [VNRectangleObservation]
    }

    private func makeTrackingRequest(from observation: VNRectangleObservation) -> VNTrackRectangleRequest {
        let request = VNTrackRectangleRequest(rectangleObservation: observation)
        request.trackingLevel = .accurate
        return request
    }

    private func updateTrackingRequest(with observation: VNRectangleObservation) {
        if let trackingRequest {
            trackingRequest.inputObservation = observation
        } else {
            trackingRequest = makeTrackingRequest(from: observation)
        }
    }

    private func handleTrackingError(_ error: Error) {
        let nsError = error as NSError
        let message = nsError.localizedDescription
        if nsError.domain == "com.apple.Vision" && nsError.code == 9 {
            if message.contains("Exceeded maximum allowed number of Trackers") {
                sequenceHandler = VNSequenceRequestHandler()
                print("[RectangleDetector] Tracker limit reached, resetting sequence handler")
            } else if message.contains("Tracking of") {
                // Low-confidence tracking failure is expected; fall back to detection quietly.
            } else {
                print("[RectangleDetector] Tracking error: \(error)")
            }
        } else {
            print("[RectangleDetector] Tracking error: \(error)")
        }
    }

    private func selectCandidate(
        rectangleCandidate: (observation: VNRectangleObservation, rectangle: DetectedRectangle)?,
        segmentationCandidate: (observation: VNRectangleObservation, rectangle: DetectedRectangle)?
    ) -> (observation: VNRectangleObservation, rectangle: DetectedRectangle)? {
        switch (rectangleCandidate, segmentationCandidate) {
        case (nil, nil):
            return nil
        case (let rect?, nil):
            return rect
        case (nil, let seg?):
            return seg
        case (let rect?, let seg?):
            // Avoid picking a much smaller segmentation rectangle (often text block).
            let areaRatio = seg.rectangle.area / max(rect.rectangle.area, 0.0001)
            if areaRatio < 0.7 {
                return rect
            }
            return score(rectangle: seg.rectangle) >= score(rectangle: rect.rectangle) ? seg : rect
        }
    }

    private func rectangleFromObservation(_ observation: VNRectangleObservation) -> DetectedRectangle {
        DetectedRectangle(
            topLeft: observation.topLeft,
            topRight: observation.topRight,
            bottomLeft: observation.bottomLeft,
            bottomRight: observation.bottomRight,
            confidence: observation.confidence
        )
    }

    private func regionOfInterest(for rectangle: DetectedRectangle) -> CGRect {
        let xs = [rectangle.topLeft.x, rectangle.bottomLeft.x, rectangle.topRight.x, rectangle.bottomRight.x]
        let ys = [rectangle.topLeft.y, rectangle.bottomLeft.y, rectangle.topRight.y, rectangle.bottomRight.y]

        let minX = xs.min() ?? 0
        let maxX = xs.max() ?? 1
        let minY = ys.min() ?? 0
        let maxY = ys.max() ?? 1

        let padding: CGFloat = 0.08
        let expanded = CGRect(
            x: minX - padding,
            y: minY - padding,
            width: (maxX - minX) + padding * 2,
            height: (maxY - minY) + padding * 2
        )

        let clampedX = max(0, expanded.origin.x)
        let clampedY = max(0, expanded.origin.y)
        let clampedMaxX = min(1, expanded.maxX)
        let clampedMaxY = min(1, expanded.maxY)

        return CGRect(
            x: clampedX,
            y: clampedY,
            width: max(0, clampedMaxX - clampedX),
            height: max(0, clampedMaxY - clampedY)
        )
    }

    private func publish(rectangle: DetectedRectangle, timestamp: CMTime) {
        Task { @MainActor in
            self.detectedRectangles = [rectangle]
            self.hasDetection = true
            self.latestObservation = TimedRectangle(rectangle: rectangle, timestamp: timestamp)
        }
    }

    private func publishEmptyIfNeeded() {
        guard trackingRequest == nil else { return }
        lastRectangle = nil
        Task { @MainActor in
            self.detectedRectangles = []
            self.hasDetection = false
            self.latestObservation = nil
        }
    }

    private func score(rectangle: DetectedRectangle) -> CGFloat {
        let areaScore = rectangle.area
        guard let last = lastRectangle else {
            return areaScore
        }

        let maxDistance = max(
            hypot(rectangle.topLeft.x - last.topLeft.x, rectangle.topLeft.y - last.topLeft.y),
            max(
                hypot(rectangle.topRight.x - last.topRight.x, rectangle.topRight.y - last.topRight.y),
                max(
                    hypot(rectangle.bottomLeft.x - last.bottomLeft.x, rectangle.bottomLeft.y - last.bottomLeft.y),
                    hypot(rectangle.bottomRight.x - last.bottomRight.x, rectangle.bottomRight.y - last.bottomRight.y)
                )
            )
        )

        // Normalize distance into [0,1] closeness score.
        let closeness = max(0, 1 - (maxDistance / 0.15))
        return areaScore * 0.8 + closeness * 0.2
    }
}
