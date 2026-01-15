//
//  ImageDewarper.swift
//  BookCompanion
//
//  Performs perspective correction (dewarp) on captured images.
//  Uses CIPerspectiveCorrection to flatten skewed page captures.
//

import CoreImage
@preconcurrency import AVFoundation
import UIKit

/// Handles perspective correction and image enhancement for captured pages.
/// Takes a camera frame + detected rectangle → produces a flat, enhanced page image.
final class ImageDewarper {

    // MARK: - Core Image Context

    /// Shared context for efficient rendering
    /// Configured for video-style processing (no intermediate caching)
    private let ciContext: CIContext

    // MARK: - Page Enhancer

    private let pageEnhancer: PageEnhancer

    // MARK: - Initialization

    init() {
        // Create optimized context for video processing
        ciContext = CIContext(options: [
            .useSoftwareRenderer: false,
            .cacheIntermediates: false,  // Better memory for video
            .highQualityDownsample: true
        ])

        pageEnhancer = PageEnhancer()
    }

    // MARK: - Public Methods

    /// Process a frame with a detected rectangle into a dewarped, enhanced image
    /// - Parameters:
    ///   - sampleBuffer: The camera frame
    ///   - rectangle: The detected page rectangle (normalized coordinates)
    /// - Returns: A dewarped and enhanced UIImage, or nil if processing failed
    func processFrame(
        sampleBuffer: CMSampleBuffer,
        rectangle: DetectedRectangle
    ) -> UIImage? {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return nil
        }

        return processPixelBuffer(pixelBuffer, rectangle: rectangle)
    }

    /// Process a pixel buffer with a detected rectangle
    func processPixelBuffer(
        _ pixelBuffer: CVPixelBuffer,
        rectangle: DetectedRectangle
    ) -> UIImage? {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        return processImage(ciImage, rectangle: rectangle)
    }

    /// Process a CIImage with a detected rectangle
    func processImage(
        _ image: CIImage,
        rectangle: DetectedRectangle
    ) -> UIImage? {
        // Convert normalized Vision coordinates to pixel coordinates
        let imageSize = image.extent.size
        let pixelCoords = convertToPixelCoordinates(
            rectangle: rectangle,
            imageSize: imageSize
        )

        // Apply perspective correction
        guard let dewarped = applyPerspectiveCorrection(
            to: image,
            corners: pixelCoords
        ) else {
            return nil
        }

        // Apply document enhancement
        let enhanced = pageEnhancer.enhance(dewarped)

        // Render to UIImage
        return renderToUIImage(enhanced)
    }

    // MARK: - Private Methods

    /// Convert normalized Vision coordinates to pixel coordinates
    /// Vision uses bottom-left origin; we need to flip Y
    private func convertToPixelCoordinates(
        rectangle: DetectedRectangle,
        imageSize: CGSize
    ) -> (topLeft: CGPoint, topRight: CGPoint, bottomLeft: CGPoint, bottomRight: CGPoint) {
        // Vision coordinates: origin at bottom-left, Y increases upward
        // CIImage coordinates: origin at bottom-left, Y increases upward (same!)
        // So we just scale by image size

        let topLeft = CGPoint(
            x: rectangle.topLeft.x * imageSize.width,
            y: rectangle.topLeft.y * imageSize.height
        )
        let topRight = CGPoint(
            x: rectangle.topRight.x * imageSize.width,
            y: rectangle.topRight.y * imageSize.height
        )
        let bottomLeft = CGPoint(
            x: rectangle.bottomLeft.x * imageSize.width,
            y: rectangle.bottomLeft.y * imageSize.height
        )
        let bottomRight = CGPoint(
            x: rectangle.bottomRight.x * imageSize.width,
            y: rectangle.bottomRight.y * imageSize.height
        )

        return (topLeft, topRight, bottomLeft, bottomRight)
    }

    /// Apply CIPerspectiveCorrection to dewarp the image
    private func applyPerspectiveCorrection(
        to image: CIImage,
        corners: (topLeft: CGPoint, topRight: CGPoint, bottomLeft: CGPoint, bottomRight: CGPoint)
    ) -> CIImage? {
        // CIPerspectiveCorrection maps the quadrilateral to a rectangle
        let corrected = image.applyingFilter("CIPerspectiveCorrection", parameters: [
            "inputTopLeft": CIVector(cgPoint: corners.topLeft),
            "inputTopRight": CIVector(cgPoint: corners.topRight),
            "inputBottomLeft": CIVector(cgPoint: corners.bottomLeft),
            "inputBottomRight": CIVector(cgPoint: corners.bottomRight)
        ])

        return corrected
    }

    /// Render CIImage to UIImage
    private func renderToUIImage(_ ciImage: CIImage) -> UIImage? {
        // Get the extent (size) of the result
        let extent = ciImage.extent

        // Render to CGImage
        guard let cgImage = ciContext.createCGImage(ciImage, from: extent) else {
            return nil
        }

        // Convert to UIImage with correct orientation
        return UIImage(cgImage: cgImage, scale: 1.0, orientation: .up)
    }
}
