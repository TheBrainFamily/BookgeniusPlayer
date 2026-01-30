//
//  SharpnessScorer.swift
//  BookCompanion
//
//  Measures image sharpness using Laplacian variance.
//  Used to detect blur and select the sharpest frame from a buffer.
//

import CoreImage
import Accelerate
@preconcurrency import AVFoundation

/// Calculates sharpness scores for images using Laplacian variance.
/// Higher scores = sharper images. Used to filter out blurry captures.
final class SharpnessScorer {

    // MARK: - Configuration

    /// Minimum acceptable sharpness score (tuned empirically)
    /// Laplacian variance varies widely - this is a very low threshold
    /// to avoid false "too blurry" rejections. Real blur is <5.
    let minimumSharpnessThreshold: Float = 10

    /// Size to downsample to before analysis (faster processing)
    private let analysisSize = CGSize(width: 256, height: 256)

    // MARK: - Core Image Context

    private let ciContext: CIContext

    // MARK: - Initialization

    init() {
        // Create context optimized for video processing
        ciContext = CIContext(options: [
            .useSoftwareRenderer: false,
            .cacheIntermediates: false
        ])
    }

    // MARK: - Public Methods

    /// Calculate sharpness score for a sample buffer
    /// - Returns: Sharpness score (higher = sharper), or nil if processing failed
    func score(sampleBuffer: CMSampleBuffer) -> Float? {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return nil
        }
        return score(pixelBuffer: pixelBuffer)
    }

    /// Calculate sharpness score for a pixel buffer
    func score(pixelBuffer: CVPixelBuffer) -> Float? {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        return score(ciImage: ciImage)
    }

    /// Calculate sharpness score for a CIImage
    func score(ciImage: CIImage) -> Float? {
        // Convert to grayscale
        guard let grayscale = ciImage.applyingFilter("CIColorControls", parameters: [
            kCIInputSaturationKey: 0.0
        ]).applyingFilter("CILanczosScaleTransform", parameters: [
            kCIInputScaleKey: analysisSize.width / ciImage.extent.width,
            kCIInputAspectRatioKey: 1.0
        ]) as CIImage? else {
            return nil
        }

        // Render to bitmap
        let width = Int(analysisSize.width)
        let height = Int(analysisSize.height)

        var bitmap = [UInt8](repeating: 0, count: width * height)

        let colorSpace = CGColorSpaceCreateDeviceGray()
        guard CGContext(
            data: &bitmap,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) != nil else {
            return nil
        }

        ciContext.render(
            grayscale,
            toBitmap: &bitmap,
            rowBytes: width,
            bounds: CGRect(origin: .zero, size: analysisSize),
            format: .L8,
            colorSpace: colorSpace
        )

        // Calculate Laplacian variance
        return calculateLaplacianVariance(bitmap: bitmap, width: width, height: height)
    }

    // MARK: - Laplacian Variance

    /// Calculates variance of Laplacian - classic focus measure.
    /// The Laplacian detects edges; variance of edge response indicates sharpness.
    private func calculateLaplacianVariance(
        bitmap: [UInt8],
        width: Int,
        height: Int
    ) -> Float {
        // Convert to float for processing
        var floatBitmap = [Float](repeating: 0, count: width * height)
        vDSP_vfltu8(bitmap, 1, &floatBitmap, 1, vDSP_Length(bitmap.count))

        // Apply 3x3 Laplacian kernel
        // [0, 1, 0]
        // [1,-4, 1]
        // [0, 1, 0]
        var laplacian = [Float](repeating: 0, count: width * height)

        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let idx = y * width + x

                let center = floatBitmap[idx]
                let top = floatBitmap[(y - 1) * width + x]
                let bottom = floatBitmap[(y + 1) * width + x]
                let left = floatBitmap[y * width + (x - 1)]
                let right = floatBitmap[y * width + (x + 1)]

                laplacian[idx] = top + bottom + left + right - 4 * center
            }
        }

        // Calculate variance of Laplacian response
        var mean: Float = 0
        var variance: Float = 0
        vDSP_normalize(laplacian, 1, nil, 1, &mean, &variance, vDSP_Length(laplacian.count))

        return variance
    }
}

// MARK: - Frame Buffer with Sharpness Tracking

/// Ring buffer that keeps track of recent frames and their sharpness scores.
/// When capture is triggered, returns the sharpest frame in the buffer.
final class SharpnessFrameBuffer {

    // MARK: - Types

    struct ScoredFrame {
        let sampleBuffer: CMSampleBuffer
        let sharpnessScore: Float
        let timestamp: CMTime
        let isEligible: Bool
    }

    // MARK: - Configuration

    private let bufferSize: Int
    private let scorer: SharpnessScorer

    // MARK: - State

    private var frames: [ScoredFrame] = []
    private let lock = NSLock()

    // MARK: - Initialization

    init(bufferSize: Int = 8) {
        self.bufferSize = bufferSize
        self.scorer = SharpnessScorer()
    }

    // MARK: - Public Methods

    /// Add a frame to the buffer, scoring it for sharpness
    func addFrame(_ sampleBuffer: CMSampleBuffer, eligible: Bool) {
        guard eligible else { return }
        guard let score = scorer.score(sampleBuffer: sampleBuffer) else {
            return
        }

        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let scored = ScoredFrame(
            sampleBuffer: sampleBuffer,
            sharpnessScore: score,
            timestamp: timestamp,
            isEligible: eligible
        )

        lock.lock()
        defer { lock.unlock() }

        frames.append(scored)
        if frames.count > bufferSize {
            frames.removeFirst()
        }
    }

    /// Get the sharpest frame currently in the buffer
    /// - Returns: The frame with highest sharpness score, or nil if buffer is empty
    func getSharpestFrame(
        eligibleOnly: Bool = false,
        within seconds: TimeInterval? = nil
    ) -> CMSampleBuffer? {
        lock.lock()
        defer { lock.unlock() }

        let filtered = filterFrames(eligibleOnly: eligibleOnly, within: seconds)
        return filtered.max(by: { $0.sharpnessScore < $1.sharpnessScore })?.sampleBuffer
    }

    /// Get the current sharpness score (latest frame)
    func currentSharpness(eligibleOnly: Bool = false) -> Float? {
        lock.lock()
        defer { lock.unlock() }

        return filterFrames(eligibleOnly: eligibleOnly, within: nil).last?.sharpnessScore
    }

    /// Check if current sharpness is above minimum threshold
    func isSharpEnough(eligibleOnly: Bool = false) -> Bool {
        guard let score = currentSharpness(eligibleOnly: eligibleOnly) else {
            print("[SharpnessBuffer] No frames in buffer")
            return false
        }
        let isSharp = score >= scorer.minimumSharpnessThreshold
        // Log periodically (every check, since this is called less frequently)
        print("[SharpnessBuffer] Score: \(String(format: "%.1f", score)), threshold: \(scorer.minimumSharpnessThreshold), pass: \(isSharp)")
        return isSharp
    }

    /// Clear all buffered frames
    func clear() {
        lock.lock()
        defer { lock.unlock() }

        frames.removeAll()
    }

    private func filterFrames(eligibleOnly: Bool, within seconds: TimeInterval?) -> [ScoredFrame] {
        var filtered = frames
        if eligibleOnly {
            filtered = filtered.filter { $0.isEligible }
        }

        if let seconds {
            let now = filtered.last?.timestamp ?? CMTime.invalid
            let nowSeconds = now == CMTime.invalid ? nil : CMTimeGetSeconds(now)
            if let nowSeconds {
                filtered = filtered.filter { abs(CMTimeGetSeconds($0.timestamp) - nowSeconds) <= seconds }
            }
        }

        return filtered
    }
}
