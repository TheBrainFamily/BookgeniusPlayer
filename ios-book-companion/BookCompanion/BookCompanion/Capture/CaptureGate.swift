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

    // MARK: - Internal State

    private var cancellables = Set<AnyCancellable>()
    private var gateOpenTime: Date?
    private var autoCaptureTask: Task<Void, Never>?
    private var isInCooldown: Bool = false
    private var lastCapturedRectangle: DetectedRectangle?

    // MARK: - Haptics

    private let hapticGenerator = UIImpactFeedbackGenerator(style: .medium)

    // MARK: - Initialization

    init(
        rectangleDetector: RectangleDetector,
        motionTracker: MotionTracker,
        sharpnessBuffer: SharpnessFrameBuffer,
        dewarper: ImageDewarper
    ) {
        self.rectangleDetector = rectangleDetector
        self.motionTracker = motionTracker
        self.sharpnessBuffer = sharpnessBuffer
        self.dewarper = dewarper

        hapticGenerator.prepare()
        setupSubscriptions()
    }

    // MARK: - Public Methods

    /// Manually trigger capture
    func triggerCapture() {
        guard let rectangle = rectangleDetector.detectedRectangles.first else {
            return
        }
        performCapture(rectangle: rectangle)
    }

    // MARK: - Private Methods

    private func setupSubscriptions() {
        // Combine detection + motion signals
        Publishers.CombineLatest(
            rectangleDetector.$hasDetection,
            motionTracker.$isStable
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] hasDetection, deviceStable in
            self?.updateState(
                hasDetection: hasDetection,
                deviceStable: deviceStable
            )
        }
        .store(in: &cancellables)
    }

    private func updateState(
        hasDetection: Bool,
        deviceStable: Bool
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
        } else if !deviceStable {
            newState = .deviceMoving
        } else if !sharpnessBuffer.isSharpEnough() {
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
                  state == .ready,
                  let rectangle = rectangleDetector.detectedRectangles.first else {
                return
            }

            performCapture(rectangle: rectangle)
        }
    }

    private func performCapture(rectangle: DetectedRectangle) {
        // Prevent capture during cooldown
        guard !isInCooldown else { return }

        // Get the sharpest frame from buffer
        guard let sampleBuffer = sharpnessBuffer.getSharpestFrame() else {
            print("[CaptureGate] No sharp frame available")
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
}
