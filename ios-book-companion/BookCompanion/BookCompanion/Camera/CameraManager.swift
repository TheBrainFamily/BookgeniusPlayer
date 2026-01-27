//
//  CameraManager.swift
//  BookCompanion
//
//  Camera session management with frame output for analysis.
//  Uses AVCaptureVideoDataOutput for real-time frames.
//

@preconcurrency import AVFoundation
import Combine
import UIKit

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
    private var photoOutput: AVCapturePhotoOutput?

    /// Rotation coordinator - accessed from delegate
    nonisolated(unsafe) private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?

    /// Preview layer for coordinate mapping and rotation alignment
    nonisolated(unsafe) private weak var previewLayer: AVCaptureVideoPreviewLayer?

    /// Capture device reference for rotation coordinator
    private var captureDevice: AVCaptureDevice?

    /// Photo capture delegate storage
    private var photoDelegates: [Int64: PhotoCaptureDelegate] = [:]


    /// Last applied rotation angles to avoid redundant updates
    nonisolated(unsafe) private var lastAppliedCaptureAngle: CGFloat?
    nonisolated(unsafe) private var lastAppliedPreviewAngle: CGFloat?

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

    /// Attach the preview layer so rotation and coordinate mapping stay aligned
    func setPreviewLayer(_ layer: AVCaptureVideoPreviewLayer) {
        previewLayer = layer
        updateRotationCoordinatorIfPossible()
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

    /// Capture a full-resolution photo using the photo output.
    func capturePhoto(onShutter: @escaping () -> Void, completion: @escaping (UIImage?) -> Void) {
        guard let photoOutput else {
            completion(nil)
            return
        }

        let codec: AVVideoCodecType = photoOutput.availablePhotoCodecTypes.contains(.hevc) ? .hevc : .jpeg
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: codec])
        settings.flashMode = .off
        settings.photoQualityPrioritization = .speed
        if #available(iOS 16.0, *) {
            let maxDimensions = photoOutput.maxPhotoDimensions
            if maxDimensions.width > 0 && maxDimensions.height > 0 {
                settings.maxPhotoDimensions = maxDimensions
            }
        } else {
            settings.isHighResolutionPhotoEnabled = true
        }

        let delegate = PhotoCaptureDelegate(
            onShutter: onShutter,
            completion: { [weak self] (image: UIImage?, uniqueID: Int64) in
                Task { @MainActor in
                    self?.photoDelegates[uniqueID] = nil
                    completion(image)
                }
            }
        )

        photoDelegates[settings.uniqueID] = delegate
        photoOutput.capturePhoto(with: settings, delegate: delegate)
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

        // Set session preset for full-resolution photos
        if captureSession.canSetSessionPreset(.photo) {
            captureSession.sessionPreset = .photo
        } else if captureSession.canSetSessionPreset(.hd1920x1080) {
            captureSession.sessionPreset = .hd1920x1080
        } else if captureSession.canSetSessionPreset(.hd1280x720) {
            captureSession.sessionPreset = .hd1280x720
        }

        // Get the back camera (prefer standard wide angle)
        guard let camera = selectBackCamera() else {
            error = .cameraUnavailable
            return
        }
        captureDevice = camera

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

            // Ensure we stay on the native wide camera (no digital zoom)
            if camera.minAvailableVideoZoomFactor <= 1.0 && camera.maxAvailableVideoZoomFactor >= 1.0 {
                camera.videoZoomFactor = 1.0
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
                updateRotationCoordinatorIfPossible()

                // Apply initial rotation for capture connection
                if let angle = rotationCoordinator?.videoRotationAngleForHorizonLevelCapture,
                   connection.isVideoRotationAngleSupported(angle) {
                    connection.videoRotationAngle = angle
                    lastAppliedCaptureAngle = angle
                }
            }
        } else {
            self.error = .configurationFailed
            return
        }

        let photoOutput = AVCapturePhotoOutput()
        if captureSession.canAddOutput(photoOutput) {
            captureSession.addOutput(photoOutput)
            self.photoOutput = photoOutput
            photoOutput.maxPhotoQualityPrioritization = .speed

            if #available(iOS 17.0, *) {
                if photoOutput.isResponsiveCaptureSupported {
                    photoOutput.isResponsiveCaptureEnabled = true
                }
                if photoOutput.isZeroShutterLagSupported {
                    photoOutput.isZeroShutterLagEnabled = true
                }
                if photoOutput.isFastCapturePrioritizationSupported {
                    photoOutput.isFastCapturePrioritizationEnabled = true
                }
                if photoOutput.isAutoDeferredPhotoDeliverySupported {
                    photoOutput.isAutoDeferredPhotoDeliveryEnabled = false
                }
            }

            if #available(iOS 16.0, *) {
                let supported = camera.activeFormat.supportedMaxPhotoDimensions
                if let best = supported.max(by: { lhs, rhs in
                    Int(lhs.width) * Int(lhs.height) < Int(rhs.width) * Int(rhs.height)
                }) {
                    photoOutput.maxPhotoDimensions = best
                }
            } else {
                photoOutput.isHighResolutionCaptureEnabled = true
            }

            let codec: AVVideoCodecType = photoOutput.availablePhotoCodecTypes.contains(.hevc) ? .hevc : .jpeg
            let preparedSettings = AVCapturePhotoSettings(format: [AVVideoCodecKey: codec])
            preparedSettings.photoQualityPrioritization = .speed
            if #available(iOS 16.0, *) {
                let maxDimensions = photoOutput.maxPhotoDimensions
                if maxDimensions.width > 0 && maxDimensions.height > 0 {
                    preparedSettings.maxPhotoDimensions = maxDimensions
                }
            } else {
                preparedSettings.isHighResolutionPhotoEnabled = true
            }
            photoOutput.setPreparedPhotoSettingsArray([preparedSettings], completionHandler: nil)
        }
    }

    private func updateRotationCoordinatorIfPossible() {
        guard let device = captureDevice else { return }
        rotationCoordinator = AVCaptureDevice.RotationCoordinator(
            device: device,
            previewLayer: previewLayer
        )
    }

    private func selectBackCamera() -> AVCaptureDevice? {
        let preferredTypes: [AVCaptureDevice.DeviceType] = [
            .builtInWideAngleCamera,
            .builtInDualCamera,
            .builtInTripleCamera
        ]

        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: preferredTypes,
            mediaType: .video,
            position: .back
        )

        for type in preferredTypes {
            if let device = discovery.devices.first(where: { $0.deviceType == type }) {
                return device
            }
        }

        return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    }
}

private final class PhotoCaptureDelegate: NSObject, AVCapturePhotoCaptureDelegate {

    private let onShutter: () -> Void
    private let completion: (UIImage?, Int64) -> Void
    private var didSignalShutter = false

    init(onShutter: @escaping () -> Void, completion: @escaping (UIImage?, Int64) -> Void) {
        self.onShutter = onShutter
        self.completion = completion
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings
    ) {
        guard !didSignalShutter else { return }
        didSignalShutter = true
        DispatchQueue.main.async {
            self.onShutter()
        }
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        let image: UIImage?
        if let data = photo.fileDataRepresentation() {
            image = UIImage(data: data)
        } else {
            image = nil
        }
        completion(image, photo.resolvedSettings.uniqueID)
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
            if connection.isVideoRotationAngleSupported(angle),
               angle != lastAppliedCaptureAngle {
                connection.videoRotationAngle = angle
                lastAppliedCaptureAngle = angle
            }

            if let previewLayer = previewLayer {
                let previewAngle = coordinator.videoRotationAngleForHorizonLevelPreview
                if previewLayer.connection?.isVideoRotationAngleSupported(previewAngle) == true,
                   previewAngle != lastAppliedPreviewAngle {
                    lastAppliedPreviewAngle = previewAngle
                    DispatchQueue.main.async {
                        previewLayer.connection?.videoRotationAngle = previewAngle
                    }
                }
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
