//
//  PostCaptureProcessor.swift
//  BookCompanion
//
//  Trims captured images with a conservative heuristic.
//

import CoreImage
import UIKit

final class PostCaptureProcessor {

    private let trimmer = ImageTrimmer()

    func process(_ image: UIImage) -> UIImage? {
        trimmer.trim(image)
    }
}

final class ImageTrimmer {

    private let analysisSize = CGSize(width: 256, height: 256)
    private let ciContext = CIContext(options: [
        .useSoftwareRenderer: false,
        .cacheIntermediates: false
    ])

    func trim(_ image: UIImage) -> UIImage? {
        guard let cgImage = image.cgImage else { return nil }
        let ciImage = CIImage(cgImage: cgImage)

        guard let cropRect = estimateCropRect(ciImage) else {
            return image
        }

        let cropped = ciImage.cropped(to: cropRect)
        return renderToUIImage(cropped)
    }

    private func estimateCropRect(_ image: CIImage) -> CGRect? {
        let imageSize = image.extent.size
        guard imageSize.width > 0, imageSize.height > 0 else {
            return nil
        }

        guard let bitmap = renderGrayscaleBitmap(image, size: analysisSize) else {
            return nil
        }

        let width = Int(analysisSize.width)
        let height = Int(analysisSize.height)

        let (rowEnergy, colEnergy) = computeEdgeEnergy(bitmap: bitmap, width: width, height: height)

        let centerRows = max(1, height / 6)
        let centerCols = max(1, width / 6)
        let centerRow = height / 2
        let centerCol = width / 2

        let centerRowRange = max(0, centerRow - centerRows / 2)..<min(height, centerRow + centerRows / 2 + 1)
        let centerColRange = max(0, centerCol - centerCols / 2)..<min(width, centerCol + centerCols / 2 + 1)

        let centerRowAvg = centerRowRange.map { rowEnergy[$0] }.reduce(0, +) / Float(centerRowRange.count)
        let centerColAvg = centerColRange.map { colEnergy[$0] }.reduce(0, +) / Float(centerColRange.count)

        let rowThreshold = max(8, centerRowAvg * 0.35)
        let colThreshold = max(8, centerColAvg * 0.35)
        let guardRows = 3
        let guardCols = 3

        let lowerRow = findLowerBound(
            energies: rowEnergy,
            centerIndex: centerRow,
            threshold: rowThreshold,
            guardCount: guardRows
        )
        let upperRow = findUpperBound(
            energies: rowEnergy,
            centerIndex: centerRow,
            threshold: rowThreshold,
            guardCount: guardRows
        )
        let lowerCol = findLowerBound(
            energies: colEnergy,
            centerIndex: centerCol,
            threshold: colThreshold,
            guardCount: guardCols
        )
        let upperCol = findUpperBound(
            energies: colEnergy,
            centerIndex: centerCol,
            threshold: colThreshold,
            guardCount: guardCols
        )

        guard upperRow > lowerRow, upperCol > lowerCol else {
            return nil
        }

        let minWidth = Int(analysisSize.width * 0.55)
        let minHeight = Int(analysisSize.height * 0.55)
        if (upperCol - lowerCol) < minWidth || (upperRow - lowerRow) < minHeight {
            return nil
        }

        let marginX = Int(analysisSize.width * 0.08)
        let marginY = Int(analysisSize.height * 0.08)

        let paddedLeft = max(0, lowerCol - marginX)
        let paddedRight = min(width - 1, upperCol + marginX)
        let paddedBottom = max(0, lowerRow - marginY)
        let paddedTop = min(height - 1, upperRow + marginY)

        let scaleX = imageSize.width / CGFloat(width)
        let scaleY = imageSize.height / CGFloat(height)

        let cropX = CGFloat(paddedLeft) * scaleX
        let cropY = CGFloat(paddedBottom) * scaleY
        let cropWidth = CGFloat(paddedRight - paddedLeft + 1) * scaleX
        let cropHeight = CGFloat(paddedTop - paddedBottom + 1) * scaleY

        let cropRect = CGRect(x: cropX, y: cropY, width: cropWidth, height: cropHeight)
        let clamped = cropRect.intersection(image.extent)
        return clamped.isNull ? nil : clamped
    }

    private func renderGrayscaleBitmap(_ image: CIImage, size: CGSize) -> [UInt8]? {
        let grayscale = image.applyingFilter("CIColorControls", parameters: [
            kCIInputSaturationKey: 0.0
        ]).applyingFilter("CILanczosScaleTransform", parameters: [
            kCIInputScaleKey: size.width / image.extent.width,
            kCIInputAspectRatioKey: 1.0
        ])

        let width = Int(size.width)
        let height = Int(size.height)
        var bitmap = [UInt8](repeating: 0, count: width * height)
        let colorSpace = CGColorSpaceCreateDeviceGray()

        guard let _ = CGContext(
            data: &bitmap,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else {
            return nil
        }

        ciContext.render(
            grayscale,
            toBitmap: &bitmap,
            rowBytes: width,
            bounds: CGRect(origin: .zero, size: size),
            format: .L8,
            colorSpace: colorSpace
        )

        return bitmap
    }

    private func computeEdgeEnergy(
        bitmap: [UInt8],
        width: Int,
        height: Int
    ) -> (rows: [Float], cols: [Float]) {
        var rowEnergy = [Float](repeating: 0, count: height)
        var colEnergy = [Float](repeating: 0, count: width)

        func pixel(_ x: Int, _ y: Int) -> Int {
            bitmap[y * width + x].toInt()
        }

        for y in 1..<(height - 1) {
            for x in 1..<(width - 1) {
                let gx =
                    -pixel(x - 1, y - 1) + pixel(x + 1, y - 1) +
                    -2 * pixel(x - 1, y) + 2 * pixel(x + 1, y) +
                    -pixel(x - 1, y + 1) + pixel(x + 1, y + 1)

                let gy =
                    -pixel(x - 1, y - 1) - 2 * pixel(x, y - 1) - pixel(x + 1, y - 1) +
                    pixel(x - 1, y + 1) + 2 * pixel(x, y + 1) + pixel(x + 1, y + 1)

                let magnitude = abs(gx) + abs(gy)
                rowEnergy[y] += Float(magnitude)
                colEnergy[x] += Float(magnitude)
            }
        }

        // Normalize by number of samples per row/column
        let rowDivisor = Float(max(1, width - 2))
        let colDivisor = Float(max(1, height - 2))
        rowEnergy = rowEnergy.map { $0 / rowDivisor }
        colEnergy = colEnergy.map { $0 / colDivisor }

        return (rowEnergy, colEnergy)
    }

    private func findLowerBound(
        energies: [Float],
        centerIndex: Int,
        threshold: Float,
        guardCount: Int
    ) -> Int {
        var lastGood = centerIndex
        var consecutiveLow = 0
        var index = centerIndex

        while index > 0 {
            index -= 1
            if energies[index] >= threshold {
                lastGood = index
                consecutiveLow = 0
            } else {
                consecutiveLow += 1
                if consecutiveLow >= guardCount {
                    break
                }
            }
        }

        return lastGood
    }

    private func findUpperBound(
        energies: [Float],
        centerIndex: Int,
        threshold: Float,
        guardCount: Int
    ) -> Int {
        var lastGood = centerIndex
        var consecutiveLow = 0
        var index = centerIndex
        let maxIndex = energies.count - 1

        while index < maxIndex {
            index += 1
            if energies[index] >= threshold {
                lastGood = index
                consecutiveLow = 0
            } else {
                consecutiveLow += 1
                if consecutiveLow >= guardCount {
                    break
                }
            }
        }

        return lastGood
    }

    private func renderToUIImage(_ ciImage: CIImage) -> UIImage? {
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else {
            return nil
        }
        return UIImage(cgImage: cgImage, scale: 1.0, orientation: .up)
    }
}

private extension UInt8 {
    func toInt() -> Int {
        Int(self)
    }
}
