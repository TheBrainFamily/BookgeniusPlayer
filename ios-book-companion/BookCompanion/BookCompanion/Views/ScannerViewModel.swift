//
//  ScannerViewModel.swift
//  BookCompanion
//
//  Orchestrates all scanning components and manages state.
//

import SwiftUI
import UIKit
import Combine
@preconcurrency import AVFoundation

/// ViewModel for the scanner view, coordinating all components
@MainActor
final class ScannerViewModel: ObservableObject {

    // MARK: - Published State

    @Published private(set) var lastCapturedImage: UIImage?
    @Published private(set) var captureCount: Int = 0

    // MARK: - Forwarded State (from child objects, for SwiftUI reactivity)

    @Published private(set) var detectedRectangles: [DetectedRectangle] = []
    @Published private(set) var hasDetection: Bool = false
    @Published private(set) var frameCount: Int = 0
    @Published private(set) var gateState: CaptureGateState = .noRectangle
    @Published private(set) var isRectangleStable: Bool = false
    @Published private(set) var isDeviceStable: Bool = false
    @Published private(set) var smoothedRectangle: DetectedRectangle?
    @Published private(set) var lockedRectangle: DetectedRectangle?
    @Published private(set) var isCaptureRequested: Bool = false
    @Published private(set) var storedCaptures: [StoredCapture] = []

    // MARK: - Components

    let cameraManager: CameraManager
    let rectangleDetector: RectangleDetector
    let rectangleTracker: RectangleTracker
    let motionTracker: MotionTracker
    let captureGate: CaptureGate

    // MARK: - Private Components

    private let sharpnessBuffer: SharpnessFrameBuffer
    private let dewarper: ImageDewarper
    private let captureStore: CaptureStore
    private let postCaptureProcessor: PostCaptureProcessor

    // MARK: - Subscriptions

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Captured Pages

    private var nextCaptureIndex: Int = 1

    // MARK: - Frame Eligibility

    private let frameEligibilityLock = NSLock()
    private var isFrameEligible: Bool = false

    // MARK: - Initialization

    init() {
        // Initialize components
        cameraManager = CameraManager()
        rectangleDetector = RectangleDetector()
        rectangleTracker = RectangleTracker()
        motionTracker = MotionTracker()
        sharpnessBuffer = SharpnessFrameBuffer(bufferSize: 8)
        dewarper = ImageDewarper()
        captureStore = CaptureStore()
        postCaptureProcessor = PostCaptureProcessor()

        // Initialize capture gate with dependencies
        captureGate = CaptureGate(
            rectangleDetector: rectangleDetector,
            rectangleTracker: rectangleTracker,
            motionTracker: motionTracker,
            sharpnessBuffer: sharpnessBuffer,
            dewarper: dewarper
        )
        captureGate.isEnabled = false

        setupSubscriptions()
    }

    // MARK: - Lifecycle

    func start() async {
        print("[ScannerViewModel] Starting...")

        // Request camera permission and set up session
        await cameraManager.requestPermissionAndSetup()

        guard cameraManager.permissionGranted else {
            print("[ScannerViewModel] Camera permission denied")
            return
        }

        print("[ScannerViewModel] Camera permission granted, starting services...")

        // Start motion tracking
        motionTracker.start()
        print("[ScannerViewModel] Motion tracker started")

        // Start camera
        cameraManager.startSession()
        print("[ScannerViewModel] Camera session started")

        captureGate.isEnabled = true
    }

    func stop() {
        cameraManager.stopSession()
        motionTracker.stop()
        captureGate.isEnabled = false
    }

    // MARK: - Actions

    func requestCapture() {
        captureGate.requestCapture()
    }

    // MARK: - Private Methods

    private func setupSubscriptions() {
        // Connect rectangle detector to camera frames
        rectangleDetector.subscribe(to: cameraManager.framePublisher)

        // Connect rectangle tracker to detector
        rectangleTracker.subscribe(to: rectangleDetector)

        // Feed frames to sharpness buffer
        cameraManager.framePublisher
            .receive(on: DispatchQueue.global(qos: .userInteractive))
            .sink { [weak self] sampleBuffer in
                guard let self else { return }
                let eligible = self.currentFrameEligibility()
                self.sharpnessBuffer.addFrame(sampleBuffer, eligible: eligible)
            }
            .store(in: &cancellables)

        // Handle capture events
        captureGate.capturePublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] result in
                self?.handleCapture(result)
            }
            .store(in: &cancellables)

        // MARK: - Forward child state to trigger SwiftUI updates

        // Forward rectangle detector state
        rectangleDetector.$detectedRectangles
            .receive(on: DispatchQueue.main)
            .assign(to: &$detectedRectangles)

        rectangleDetector.$hasDetection
            .receive(on: DispatchQueue.main)
            .assign(to: &$hasDetection)

        rectangleDetector.$frameCount
            .receive(on: DispatchQueue.main)
            .assign(to: &$frameCount)

        // Forward rectangle tracker state
        rectangleTracker.$isStable
            .receive(on: DispatchQueue.main)
            .assign(to: &$isRectangleStable)

        rectangleTracker.$smoothedRectangle
            .receive(on: DispatchQueue.main)
            .assign(to: &$smoothedRectangle)

        rectangleTracker.$lockedRectangle
            .receive(on: DispatchQueue.main)
            .assign(to: &$lockedRectangle)

        // Update frame eligibility for sharpness buffering
        Publishers.CombineLatest(
            motionTracker.$isStable,
            captureGate.$isCaptureRequested
        )
        .receive(on: DispatchQueue.main)
        .sink { [weak self] deviceStable, captureRequested in
            self?.setFrameEligibility(deviceStable && captureRequested)
        }
        .store(in: &cancellables)

        // Forward motion tracker state
        motionTracker.$isStable
            .receive(on: DispatchQueue.main)
            .assign(to: &$isDeviceStable)

        // Forward capture gate state
        captureGate.$state
            .receive(on: DispatchQueue.main)
            .assign(to: &$gateState)

        captureGate.$isCaptureRequested
            .receive(on: DispatchQueue.main)
            .assign(to: &$isCaptureRequested)
    }

    private func handleCapture(_ result: CaptureResult) {
        // Show preview briefly
        lastCapturedImage = result.image

        let captureIndex = nextCaptureIndex
        nextCaptureIndex += 1

        Task.detached(priority: .utility) { [weak self] in
            guard let self else { return }
            if let stored = await self.captureStore.save(result: result, index: captureIndex) {
                await MainActor.run {
                    self.storedCaptures.append(stored)
                    self.captureCount = self.storedCaptures.count
                }

                if let processed = self.postCaptureProcessor.process(result.image),
                   let processedURL = await self.captureStore.saveProcessed(image: processed, for: stored) {
                    await MainActor.run {
                        self.updateStoredCapture(id: stored.id, processedURL: processedURL)
                        if self.lastCapturedImage == result.image {
                            self.lastCapturedImage = processed
                        }
                    }
                }
            }
        }

        // Hide preview after delay
        Task {
            try? await Task.sleep(for: .seconds(0.5))
            if lastCapturedImage == result.image {
                withAnimation {
                    lastCapturedImage = nil
                }
            }
        }
    }

    private func setFrameEligibility(_ value: Bool) {
        frameEligibilityLock.lock()
        let previous = isFrameEligible
        isFrameEligible = value
        frameEligibilityLock.unlock()

        if previous && !value {
            sharpnessBuffer.clear()
        }
    }

    private func currentFrameEligibility() -> Bool {
        frameEligibilityLock.lock()
        let value = isFrameEligible
        frameEligibilityLock.unlock()
        return value
    }

    private func updateStoredCapture(id: UUID, processedURL: URL) {
        guard let index = storedCaptures.firstIndex(where: { $0.id == id }) else { return }
        storedCaptures[index].processedFileURL = processedURL
    }
}
