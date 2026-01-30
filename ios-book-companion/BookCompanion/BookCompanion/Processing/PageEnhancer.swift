//
//  PageEnhancer.swift
//  BookCompanion
//
//  Enhances page images for better OCR accuracy.
//  Uses Apple's documentEnhancer + optional binarization.
//

import CoreImage

/// Enhancement mode for page processing
enum EnhancementMode {
    /// Document enhancement only (color preserved)
    case documentEnhancer

    /// Document enhancement + adaptive threshold (black & white)
    case binarized

    /// Light enhancement for colored pages (less aggressive)
    case light
}

/// Enhances captured page images for optimal OCR results.
/// Uses Apple's CIDocumentEnhancer for shadow removal and contrast boosting.
final class PageEnhancer {

    // MARK: - Configuration

    /// Current enhancement mode
    var mode: EnhancementMode = .documentEnhancer

    // MARK: - Public Methods

    /// Enhance a page image for OCR
    /// - Parameter image: The dewarped page image
    /// - Returns: Enhanced image optimized for text recognition
    func enhance(_ image: CIImage) -> CIImage {
        switch mode {
        case .documentEnhancer:
            return applyDocumentEnhancer(image)

        case .binarized:
            let enhanced = applyDocumentEnhancer(image)
            return applyBinarization(enhanced)

        case .light:
            return applyLightEnhancement(image)
        }
    }

    // MARK: - Enhancement Methods

    /// Apply Apple's document enhancer filter
    /// This is specifically designed for documents - removes shadows, whitens background
    private func applyDocumentEnhancer(_ image: CIImage) -> CIImage {
        // CIDocumentEnhancer (iOS 15+, macOS 12+)
        // Automatically enhances document images
        guard let filter = CIFilter(name: "CIDocumentEnhancer") else {
            // Fallback if filter not available
            return applyFallbackEnhancement(image)
        }

        filter.setValue(image, forKey: kCIInputImageKey)

        // Amount: 0-10, default 1
        // Higher values = more aggressive enhancement
        filter.setValue(1.0, forKey: "inputAmount")

        return filter.outputImage ?? image
    }

    /// Apply Otsu's threshold for binarization
    /// Creates pure black text on white background
    private func applyBinarization(_ image: CIImage) -> CIImage {
        // First convert to grayscale
        let grayscale = image.applyingFilter("CIColorControls", parameters: [
            kCIInputSaturationKey: 0.0
        ])

        // Apply Otsu's threshold (adaptive)
        // CIColorThresholdOtsu automatically determines optimal threshold
        guard let thresholdFilter = CIFilter(name: "CIColorThresholdOtsu") else {
            return grayscale
        }

        thresholdFilter.setValue(grayscale, forKey: kCIInputImageKey)

        return thresholdFilter.outputImage ?? grayscale
    }

    /// Light enhancement for pages where color matters
    /// Less aggressive than documentEnhancer
    private func applyLightEnhancement(_ image: CIImage) -> CIImage {
        // Slight contrast boost
        var enhanced = image.applyingFilter("CIColorControls", parameters: [
            kCIInputContrastKey: 1.1,
            kCIInputBrightnessKey: 0.02
        ])

        // Sharpen slightly
        enhanced = enhanced.applyingFilter("CISharpenLuminance", parameters: [
            kCIInputSharpnessKey: 0.3
        ])

        return enhanced
    }

    /// Fallback enhancement if CIDocumentEnhancer isn't available
    private func applyFallbackEnhancement(_ image: CIImage) -> CIImage {
        // Manual approximation of document enhancement:
        // 1. Increase contrast
        // 2. Slight exposure adjustment
        // 3. Unsharp mask for text clarity

        var enhanced = image

        // Boost contrast
        enhanced = enhanced.applyingFilter("CIColorControls", parameters: [
            kCIInputContrastKey: 1.2,
            kCIInputSaturationKey: 0.0  // Grayscale
        ])

        // Adjust exposure
        enhanced = enhanced.applyingFilter("CIExposureAdjust", parameters: [
            kCIInputEVKey: 0.3
        ])

        // Unsharp mask for sharpening
        enhanced = enhanced.applyingFilter("CIUnsharpMask", parameters: [
            kCIInputRadiusKey: 2.5,
            kCIInputIntensityKey: 0.5
        ])

        return enhanced
    }
}

// MARK: - Spine Shadow Removal

extension PageEnhancer {

    /// Remove the shadow typically found at the book spine (center of spread)
    /// Uses a vertical gradient to brighten the center region
    func removeSpineShadow(_ image: CIImage) -> CIImage {
        let extent = image.extent

        // Create a horizontal gradient (dark at edges, bright in center)
        // This will be used to brighten the spine area
        let centerX = extent.midX

        // Create radial gradient centered horizontally
        guard let gradientFilter = CIFilter(name: "CIRadialGradient") else {
            return image
        }

        gradientFilter.setValue(CIVector(x: centerX, y: extent.midY), forKey: "inputCenter")
        gradientFilter.setValue(extent.width * 0.3, forKey: "inputRadius0")  // Inner radius
        gradientFilter.setValue(extent.width * 0.5, forKey: "inputRadius1")  // Outer radius
        gradientFilter.setValue(CIColor.white, forKey: "inputColor0")
        gradientFilter.setValue(CIColor.clear, forKey: "inputColor1")

        guard let gradient = gradientFilter.outputImage else {
            return image
        }

        // Use screen blend to brighten shadow areas
        guard let blendFilter = CIFilter(name: "CIScreenBlendMode") else {
            return image
        }

        // Reduce gradient intensity
        let dimmedGradient = gradient.applyingFilter("CIColorControls", parameters: [
            kCIInputBrightnessKey: -0.7  // Dim the gradient so it's subtle
        ])

        blendFilter.setValue(image, forKey: kCIInputBackgroundImageKey)
        blendFilter.setValue(dimmedGradient, forKey: kCIInputImageKey)

        return blendFilter.outputImage ?? image
    }
}
