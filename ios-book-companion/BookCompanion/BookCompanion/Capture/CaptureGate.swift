//
//  CaptureGate.swift
//  BookCompanion
//
//  Combines multiple signals to determine when to capture a page.
//  Gate opens when: rectangle detected + phone stable + image sharp.
//

import Foundation
import Combine
@preconcurrency import AVFoundation
import UIKit

/// Represents the state of the capture gate
enum CaptureGateState: Equatable {
    case noRectangle          // No page detected
    case deviceMoving         // Page detected but device moving
    case blurry               // Stable but image is blurry
    case ready                // All conditions met - ready to capture
    case captured             // Just captured, in cooldown
}

/// Result of a capture operation
struct CaptureResult {
    let image: UIImage
    let rectangle: DetectedRectangle
    let timestamp: Date
}

/// Coordinates all capture signals and determines when to trigger capture.
/// Simplified logic: detect rectangle + hold phone still = capture.
@MainActor
final class CaptureGate: ObservableObject {

    // MARK: - Published State

    /// Current gate state
    @Published private(set) var state: CaptureGateState = .noRectangle

    /// Whether the gate is currently open (ready to capture)
    @Published private(set) var isOpen: Bool = false

    /// Whether the user has requested a capture
    @Published private(set) var isCaptureRequested: Bool = false

    /// Publisher for capture events
    let capturePublisher = PassthroughSubject<CaptureResult, Never>()

    // MARK: - Dependencies

    private let rectangleDetector: RectangleDetector
    private let rectangleTracker: RectangleTracker
    private let motionTracker: MotionTracker
    private let sharpnessBuffer: SharpnessFrameBuffer
    private let dewarper: ImageDewarper

    // MARK: - Configuration

    /// Whether the capture gate is enabled
    var isEnabled: Bool = true {
        didSet {
            guard oldValue != isEnabled else { return }
            if !isEnabled {
                isInCooldown = false
                isCaptureRequested = false
                state = .noRectangle
                isOpen = false
            }
        }
    }

    /// Cooldown between captures (prevents double-captures)
    private let captureCooldown: TimeInterval = 0.5

    /// Short window to pick the sharpest frame once stable
    private let captureBurstWindow: TimeInterval = 0.2

    // MARK: - Internal State

    private var cancellables = Set<AnyCancellable>()
    private var isInCooldown: Bool = false
    // MARK: - Rectangle Observation Buffer

    private var recentObservations: [TimedRectangle] = []
    private let observationBufferSize: Int = 12
    private let observationMaxDelta: TimeInterval = 0.25

    // MARK: - Initialization

    init(
        rectangleDetector: RectangleDetector,
        rectangleTracker: RectangleTracker,
        motionTracker: MotionTracker,
        sharpnessBuffer: SharpnessFrameBuffer,
        dewarper: ImageDewarper
    ) {
        self.rectangleDetector = rectangleDetector
        self.rectangleTracker = rectangleTracker
        self.motionTracker = motionTracker
        self.sharpnessBuffer = sharpnessBuffer
        self.dewarper = dewarper

        setupSubscriptions()
    }

    // MARK: - Public Methods

    /// Manually trigger capture
    func requestCapture() {
        guard isEnabled else { return }
        guard !isCaptureRequested else { return }
        isCaptureRequested = true
    }

    // MARK: - Private Methods

    private func setupSubscriptions() {
        // Combine frame tick + motion signals (detection is optional for capture)
        Publishers.CombineLatest(
            rectangleDetector.$frameCount,
            motionTracker.$isStable
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] _, deviceStable in
            self?.updateState(deviceStable: deviceStable)
        }
        .store(in: &cancellables)

        rectangleDetector.$latestObservation
            .receive(on: DispatchQueue.main)
            .sink { [weak self] observation in
                guard let observation else { return }
                self?.storeObservation(observation)
            }
            .store(in: &cancellables)
    }

    private func updateState(deviceStable: Bool) {
        // Skip updates during cooldown
        guard !isInCooldown else { return }
        guard isEnabled else {
            if state != .noRectangle {
                state = .noRectangle
                isOpen = false
            }
            isCaptureRequested = false
            return
        }

        guard isCaptureRequested else {
            if state != .noRectangle {
                state = .noRectangle
                isOpen = false
            }
            return
        }

        // Determine state based on signals
        let newState: CaptureGateState

        if !deviceStable {
            newState = .deviceMoving
        } else if !sharpnessBuffer.isSharpEnough(eligibleOnly: true) {
            newState = .blurry
        } else {
            newState = .ready
        }

        // Update state
        state = newState
        isOpen = (newState == .ready)

        if newState == .ready {
            performCapture()
        }
    }

    private func performCapture() {
        // Prevent capture during cooldown
        guard !isInCooldown, isEnabled, isCaptureRequested else { return }

        // Get the sharpest eligible frame from recent burst window
        guard let sampleBuffer = sharpnessBuffer.getSharpestFrame(
            eligibleOnly: true,
            within: captureBurstWindow
        ) ?? sharpnessBuffer.getSharpestFrame(eligibleOnly: true) else {
            print("[CaptureGate] No sharp frame available")
            return
        }

        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        let rectangle = rectangleForTimestamp(timestamp)
            ?? rectangleTracker.lockedRectangle
            ?? rectangleDetector.detectedRectangles.first
            ?? defaultRectangle()

        guard let rawImage = dewarper.renderRaw(sampleBuffer: sampleBuffer) else {
            print("[CaptureGate] Raw render failed")
            return
        }

        // Create result
        let result = CaptureResult(
            image: rawImage,
            rectangle: rectangle,
            timestamp: Date()
        )

        // Trigger success haptic
        let successHaptic = UINotificationFeedbackGenerator()
        successHaptic.notificationOccurred(.success)

        print("[CaptureGate] CAPTURED!")

        // Enter cooldown
        isCaptureRequested = false
        enterCooldown()
        rectangleTracker.enterCooldown()

        // Publish result
        capturePublisher.send(result)

        // Clear the buffer
        sharpnessBuffer.clear()
    }

    private func enterCooldown() {
        isInCooldown = true
        state = .captured
        isOpen = false

        // Exit cooldown after delay
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(captureCooldown))
            isInCooldown = false
        }
    }

    private func storeObservation(_ observation: TimedRectangle) {
        recentObservations.append(observation)
        if recentObservations.count > observationBufferSize {
            recentObservations.removeFirst(recentObservations.count - observationBufferSize)
        }
    }

    private func rectangleForTimestamp(_ timestamp: CMTime) -> DetectedRectangle? {
        guard !recentObservations.isEmpty else { return nil }

        let target = CMTimeGetSeconds(timestamp)
        var best: TimedRectangle?
        var bestDelta = Double.greatestFiniteMagnitude

        for observation in recentObservations {
            let delta = abs(CMTimeGetSeconds(observation.timestamp) - target)
            if delta < bestDelta {
                bestDelta = delta
                best = observation
            }
        }

        guard bestDelta <= observationMaxDelta else {
            return nil
        }

        return best?.rectangle
    }

    private func defaultRectangle() -> DetectedRectangle {
        DetectedRectangle(
            topLeft: CGPoint(x: 0, y: 1),
            topRight: CGPoint(x: 1, y: 1),
            bottomLeft: CGPoint(x: 0, y: 0),
            bottomRight: CGPoint(x: 1, y: 0),
            confidence: 0
        )
    }
}
