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

    /// Publisher for capture events
    let capturePublisher = PassthroughSubject<CaptureResult, Never>()

    // MARK: - Dependencies

    private let rectangleDetector: RectangleDetector
    private let rectangleTracker: RectangleTracker
    private let motionTracker: MotionTracker
    private let sharpnessBuffer: SharpnessFrameBuffer
    private let dewarper: ImageDewarper

    // MARK: - Configuration

    /// Automatically capture when gate opens (vs manual trigger)
    var autoCapture: Bool = true

    /// Minimum time gate must be open before auto-capture
    /// Gives user a moment to see the "ready" state
    private let autoCaptureDelay: TimeInterval = 0.3

    /// Cooldown between captures (prevents double-captures)
    private let captureCooldown: TimeInterval = 0.5

    /// Short window to pick the sharpest frame once stable
    private let captureBurstWindow: TimeInterval = 0.2

    // MARK: - Internal State

    private var cancellables = Set<AnyCancellable>()
    private var gateOpenTime: Date?
    private var autoCaptureTask: Task<Void, Never>?
    private var isInCooldown: Bool = false
    private var lastCapturedRectangle: DetectedRectangle?

    // MARK: - Rectangle Observation Buffer

    private var recentObservations: [TimedRectangle] = []
    private let observationBufferSize: Int = 12
    private let observationMaxDelta: TimeInterval = 0.25

    // MARK: - Haptics

    private let hapticGenerator = UIImpactFeedbackGenerator(style: .medium)

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

        hapticGenerator.prepare()
        setupSubscriptions()
    }

    // MARK: - Public Methods

    /// Manually trigger capture
    func triggerCapture() {
        performCapture()
    }

    // MARK: - Private Methods

    private func setupSubscriptions() {
        // Combine detection + motion signals
        Publishers.CombineLatest3(
            rectangleDetector.$hasDetection,
            motionTracker.$isStable,
            rectangleTracker.$isStable
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] hasDetection, deviceStable, rectangleStable in
            self?.updateState(
                hasDetection: hasDetection,
                deviceStable: deviceStable,
                rectangleStable: rectangleStable
            )
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

    private func updateState(
        hasDetection: Bool,
        deviceStable: Bool,
        rectangleStable: Bool
    ) {
        // Skip updates during cooldown
        guard !isInCooldown else { return }

        // Cancel any pending auto-capture
        autoCaptureTask?.cancel()
        autoCaptureTask = nil

        // Determine state based on signals
        let newState: CaptureGateState

        if !hasDetection {
            newState = .noRectangle
        } else if !deviceStable || !rectangleStable {
            newState = .deviceMoving
        } else if !sharpnessBuffer.isSharpEnough(eligibleOnly: true) {
            newState = .blurry
        } else {
            newState = .ready
        }

        // Update state
        let wasReady = state == .ready
        state = newState
        isOpen = (newState == .ready)

        // Handle state transitions
        if newState == .ready && !wasReady {
            // Just became ready
            gateOpenTime = Date()
            hapticGenerator.impactOccurred()

            // Schedule auto-capture if enabled
            if autoCapture {
                scheduleAutoCapture()
            }
        } else if newState != .ready {
            gateOpenTime = nil
        }
    }

    private func scheduleAutoCapture() {
        autoCaptureTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(autoCaptureDelay))

            guard !Task.isCancelled,
                  state == .ready else {
                return
            }

            performCapture()
        }
    }

    private func performCapture() {
        // Prevent capture during cooldown
        guard !isInCooldown else { return }

        // Get the sharpest eligible frame from recent burst window
        guard let sampleBuffer = sharpnessBuffer.getSharpestFrame(
            eligibleOnly: true,
            within: captureBurstWindow
        ) ?? sharpnessBuffer.getSharpestFrame(eligibleOnly: true) else {
            print("[CaptureGate] No sharp frame available")
            return
        }

        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        guard let rectangle = rectangleForTimestamp(timestamp)
            ?? rectangleTracker.lockedRectangle
            ?? rectangleDetector.detectedRectangles.first else {
            print("[CaptureGate] No rectangle for capture")
            return
        }

        // Dewarp and enhance the image
        guard let processedImage = dewarper.processFrame(
            sampleBuffer: sampleBuffer,
            rectangle: rectangle
        ) else {
            print("[CaptureGate] Dewarp failed")
            return
        }

        // Create result
        let result = CaptureResult(
            image: processedImage,
            rectangle: rectangle,
            timestamp: Date()
        )

        // Trigger success haptic
        let successHaptic = UINotificationFeedbackGenerator()
        successHaptic.notificationOccurred(.success)

        print("[CaptureGate] CAPTURED!")

        // Enter cooldown
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
}
