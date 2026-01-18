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

    // MARK: - Upload State

    @Published private(set) var uploadingPageIndex: Int?
    @Published private(set) var lastUploadError: String?
    @Published private(set) var uploadedPageCount: Int = 0

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
    @Published private(set) var shutterFlashToken: UUID?

    // MARK: - Components

    let cameraManager: CameraManager
    let rectangleDetector: RectangleDetector
    let rectangleTracker: RectangleTracker
    let motionTracker: MotionTracker

    // MARK: - Private Components

    private let captureStore: CaptureStore
    private let postCaptureProcessor: PostCaptureProcessor
    private let shutterHaptic = UIImpactFeedbackGenerator(style: .medium)

    // MARK: - Upload Components

    private let uploadService: UploadService

    // MARK: - Subscriptions

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Captured Pages

    private var nextCaptureIndex: Int = 1

    // MARK: - Initialization

    init(uploadService: UploadService) {
        // Initialize components
        cameraManager = CameraManager()
        rectangleDetector = RectangleDetector()
        rectangleTracker = RectangleTracker()
        motionTracker = MotionTracker()
        captureStore = CaptureStore()
        postCaptureProcessor = PostCaptureProcessor()
        self.uploadService = uploadService

        shutterHaptic.prepare()
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

    }

    func stop() {
        cameraManager.stopSession()
        motionTracker.stop()
    }

    // MARK: - Actions

    func requestCapture() {
        guard !isCaptureRequested else { return }
        isCaptureRequested = true

        cameraManager.capturePhoto(onShutter: { [weak self] in
            Task { @MainActor in
                self?.handleShutterFeedback()
            }
        }, completion: { [weak self] (image: UIImage?) in
            guard let self else { return }
            Task { @MainActor in
                self.isCaptureRequested = false
                guard let image else {
                    self.gateState = .noRectangle
                    return
                }

                let result = CaptureResult(
                    image: image,
                    rectangle: self.defaultRectangle(),
                    timestamp: Date()
                )
                self.handleCapture(result)
            }
        })
    }

    // MARK: - Private Methods

    private func setupSubscriptions() {
        // Rectangle detection currently not used for capture flow.

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

        // Forward motion tracker state
        motionTracker.$isStable
            .receive(on: DispatchQueue.main)
            .assign(to: &$isDeviceStable)
    }

    private func handleCapture(_ result: CaptureResult) {
        // Show preview briefly
        lastCapturedImage = result.image

        let captureIndex = nextCaptureIndex
        nextCaptureIndex += 1

        Task { [weak self] in
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

                    // Upload the processed image immediately
                    await self.uploadProcessedPage(
                        pageIndex: captureIndex,
                        processedImage: processed
                    )
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
            if gateState == .captured {
                gateState = .noRectangle
            }
        }
    }

    /// Upload a processed page to the pipeline server
    private func uploadProcessedPage(pageIndex: Int, processedImage: UIImage) async {
        guard let imageData = processedImage.jpegData(compressionQuality: 0.85) else {
            print("[ScannerViewModel] Failed to convert image to JPEG data")
            return
        }

        await MainActor.run {
            self.uploadingPageIndex = pageIndex
            self.lastUploadError = nil
        }

        do {
            _ = try await uploadService.uploadPage(pageIndex: pageIndex, imageData: imageData)
            await MainActor.run {
                self.uploadingPageIndex = nil
                self.uploadedPageCount += 1
            }
            print("[ScannerViewModel] Successfully uploaded page \(pageIndex)")
        } catch {
            await MainActor.run {
                self.uploadingPageIndex = nil
                self.lastUploadError = error.localizedDescription
            }
            print("[ScannerViewModel] Upload failed for page \(pageIndex): \(error)")
        }
    }

    private func updateStoredCapture(id: UUID, processedURL: URL) {
        guard let index = storedCaptures.firstIndex(where: { $0.id == id }) else { return }
        storedCaptures[index].processedFileURL = processedURL
    }

    private func handleShutterFeedback() {
        isCaptureRequested = false
        gateState = .captured
        shutterFlashToken = UUID()
        shutterHaptic.impactOccurred()

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(120))
            if gateState == .captured {
                gateState = .noRectangle
            }
        }
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
