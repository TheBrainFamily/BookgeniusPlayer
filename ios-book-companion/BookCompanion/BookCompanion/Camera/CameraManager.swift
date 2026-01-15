//
//  CameraManager.swift
//  BookCompanion
//
//  Camera session management with frame output for analysis.
//  Uses AVCaptureVideoDataOutput for real-time frames.
//

@preconcurrency import AVFoundation
import Combine

/// Manages the camera session and provides frames for analysis.
/// Configures for 1080p to balance OCR detail and processing speed.
@MainActor
final class CameraManager: NSObject, ObservableObject {

    // MARK: - Published State

    @Published private(set) var isSessionRunning = false
    @Published private(set) var permissionGranted = false
    @Published private(set) var error: CameraError?

    // MARK: - Session Components (nonisolated for delegate access)

    /// The capture session - accessed from background queue
    nonisolated(unsafe) let captureSession = AVCaptureSession()

    private var videoOutput: AVCaptureVideoDataOutput?

    /// Rotation coordinator - accessed from delegate
    nonisolated(unsafe) private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?

    // MARK: - Frame Processing

    /// Publisher for sample buffers - subscribers can process frames
    /// nonisolated(unsafe) because it's accessed from delegate callback
    nonisolated(unsafe) let framePublisher = PassthroughSubject<CMSampleBuffer, Never>()

    /// Queue for video frame processing (off main thread)
    private let videoOutputQueue = DispatchQueue(
        label: "pro.lgandecki.BookCompanion.videoOutput",
        qos: .userInteractive
    )

    // MARK: - Frame Throttling (nonisolated for delegate access)

    /// Frame counter for throttling - accessed from delegate
    nonisolated(unsafe) private var frameCounter: Int = 0

    // MARK: - Initialization

    override init() {
        super.init()
    }

    // MARK: - Public Methods

    /// Request camera permission and set up session if granted
    func requestPermissionAndSetup() async {
        let status = AVCaptureDevice.authorizationStatus(for: .video)

        switch status {
        case .authorized:
            permissionGranted = true
            setupCaptureSession()

        case .notDetermined:
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            permissionGranted = granted
            if granted {
                setupCaptureSession()
            }

        case .denied, .restricted:
            permissionGranted = false
            error = .permissionDenied

        @unknown default:
            permissionGranted = false
            error = .permissionDenied
        }
    }

    /// Start the capture session
    func startSession() {
        guard permissionGranted else { return }

        let session = captureSession
        videoOutputQueue.async {
            guard !session.isRunning else { return }
            session.startRunning()
            Task { @MainActor [weak self] in
                self?.isSessionRunning = session.isRunning
            }
        }
    }

    /// Stop the capture session
    func stopSession() {
        let session = captureSession
        videoOutputQueue.async {
            guard session.isRunning else { return }
            session.stopRunning()
            Task { @MainActor [weak self] in
                self?.isSessionRunning = false
            }
        }
    }

    // MARK: - Private Setup

    private func setupCaptureSession() {
        captureSession.beginConfiguration()
        defer { captureSession.commitConfiguration() }

        // Set session preset for 1080p
        if captureSession.canSetSessionPreset(.hd1920x1080) {
            captureSession.sessionPreset = .hd1920x1080
        } else if captureSession.canSetSessionPreset(.hd1280x720) {
            captureSession.sessionPreset = .hd1280x720
        }

        // Get the back camera
        guard let camera = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: .back
        ) else {
            error = .cameraUnavailable
            return
        }

        // Configure camera for document scanning
        do {
            try camera.lockForConfiguration()

            // Enable auto-focus for close-up reading
            if camera.isFocusModeSupported(.continuousAutoFocus) {
                camera.focusMode = .continuousAutoFocus
            }

            // Enable auto-exposure
            if camera.isExposureModeSupported(.continuousAutoExposure) {
                camera.exposureMode = .continuousAutoExposure
            }

            camera.unlockForConfiguration()
        } catch {
            self.error = .configurationFailed
            return
        }

        // Add camera input
        do {
            let input = try AVCaptureDeviceInput(device: camera)
            if captureSession.canAddInput(input) {
                captureSession.addInput(input)
            } else {
                self.error = .configurationFailed
                return
            }
        } catch {
            self.error = .configurationFailed
            return
        }

        // Set up video output for frame processing
        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        output.setSampleBufferDelegate(self, queue: videoOutputQueue)

        if captureSession.canAddOutput(output) {
            captureSession.addOutput(output)
            videoOutput = output

            // Set up rotation coordinator for correct orientation
            if let connection = output.connection(with: .video) {
                // Use RotationCoordinator for iOS 17+
                rotationCoordinator = AVCaptureDevice.RotationCoordinator(
                    device: camera,
                    previewLayer: nil
                )

                // Apply initial rotation
                if let angle = rotationCoordinator?.videoRotationAngleForHorizonLevelCapture {
                    if connection.isVideoRotationAngleSupported(angle) {
                        connection.videoRotationAngle = angle
                    }
                }
            }
        } else {
            self.error = .configurationFailed
            return
        }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension CameraManager: AVCaptureVideoDataOutputSampleBufferDelegate {

    nonisolated func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        // Throttle frame processing - we don't need every frame
        // This saves battery and keeps analysis fast
        frameCounter += 1

        // Process every 4th frame at 60fps ≈ 15fps for analysis
        guard frameCounter % 4 == 0 else { return }

        // Update rotation if needed (device orientation changed)
        if let coordinator = rotationCoordinator {
            let angle = coordinator.videoRotationAngleForHorizonLevelCapture
            if connection.isVideoRotationAngleSupported(angle) {
                connection.videoRotationAngle = angle
            }
        }

        // Publish frame for subscribers (RectangleDetector, etc.)
        framePublisher.send(sampleBuffer)

        // Debug: log every 60 frames (~1 second at 15fps published rate)
        if frameCounter % 240 == 0 {
            print("[CameraManager] Published frame #\(frameCounter / 4)")
        }
    }
}

// MARK: - Error Types

enum CameraError: LocalizedError {
    case permissionDenied
    case cameraUnavailable
    case configurationFailed

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Camera access denied. Please enable in Settings."
        case .cameraUnavailable:
            return "Camera is not available on this device."
        case .configurationFailed:
            return "Failed to configure camera."
        }
    }
}
