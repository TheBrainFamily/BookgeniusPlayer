//
//  FilteredCameraPreview.swift
//  BookCompanion
//
//  Camera preview with real-time edge detection filter to prevent spoilers.
//  Shows page outlines clearly while making text unreadable.
//

import SwiftUI
import MetalKit
import CoreImage
import AVFoundation
import Combine
import UIKit

/// SwiftUI view that displays edge-detected camera preview (spoiler prevention mode)
struct FilteredCameraPreview: UIViewRepresentable {

    let framePublisher: PassthroughSubject<CMSampleBuffer, Never>

    func makeUIView(context: UIViewRepresentableContext<FilteredCameraPreview>) -> EdgeDetectionView {
        let view = EdgeDetectionView()
        context.coordinator.view = view
        context.coordinator.subscribe(to: framePublisher)
        return view
    }

    func updateUIView(_ uiView: EdgeDetectionView, context: UIViewRepresentableContext<FilteredCameraPreview>) {
        // No updates needed
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator {
        weak var view: EdgeDetectionView?
        private var cancellable: AnyCancellable?

        func subscribe(to publisher: PassthroughSubject<CMSampleBuffer, Never>) {
            cancellable = publisher
                .receive(on: DispatchQueue.main)
                .sink { [weak self] sampleBuffer in
                    self?.view?.processSampleBuffer(sampleBuffer)
                }
        }
    }
}

/// Metal-backed view that renders pixelated video frames (spoiler prevention)
class EdgeDetectionView: MTKView, MTKViewDelegate {

    private var ciContext: CIContext?
    private var commandQueue: MTLCommandQueue?
    private let pixellateFilter = CIFilter(name: "CIPixellate")!

    /// Latest processed image to render
    private var currentImage: CIImage?
    private let imageLock = NSLock()

    override init(frame: CGRect, device: MTLDevice?) {
        let metalDevice = device ?? MTLCreateSystemDefaultDevice()
        super.init(frame: frame, device: metalDevice)
        setup()
    }

    required init(coder: NSCoder) {
        super.init(coder: coder)
        self.device = MTLCreateSystemDefaultDevice()
        setup()
    }

    private func setup() {
        guard let device = self.device else { return }

        ciContext = CIContext(mtlDevice: device, options: [
            .cacheIntermediates: false,
            .priorityRequestLow: true
        ])
        commandQueue = device.makeCommandQueue()

        // Configure for continuous video display
        framebufferOnly = false
        isPaused = false  // Enable continuous rendering
        enableSetNeedsDisplay = false
        preferredFramesPerSecond = 30
        self.contentMode = .scaleAspectFit
        self.backgroundColor = UIColor.black
        self.delegate = self
    }

    func processSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)

        // Apply heavy pixelation - large cells make text unreadable but page shape visible
        // Cell size of 40-50 pixels makes individual letters merge into blocks
        pixellateFilter.setValue(ciImage, forKey: kCIInputImageKey)
        pixellateFilter.setValue(5, forKey: kCIInputScaleKey)

        guard let finalImage = pixellateFilter.outputImage else { return }

        // Store for rendering in draw callback
        imageLock.lock()
        currentImage = finalImage
        imageLock.unlock()
    }

    // MARK: - MTKViewDelegate

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        // Size changed - will be handled in next draw
    }

    func draw(in view: MTKView) {
        imageLock.lock()
        guard let image = currentImage else {
            imageLock.unlock()
            return
        }
        imageLock.unlock()

        guard let drawable = currentDrawable,
              let commandBuffer = commandQueue?.makeCommandBuffer(),
              let ciContext = ciContext else { return }

        let drawableSize = drawableSize
        guard drawableSize.width > 0, drawableSize.height > 0 else { return }

        let bounds = CGRect(origin: .zero, size: drawableSize)

        // Scale image to fit drawable while maintaining aspect ratio
        let scaleX = drawableSize.width / image.extent.width
        let scaleY = drawableSize.height / image.extent.height
        let scale = min(scaleX, scaleY)

        let scaledWidth = image.extent.width * scale
        let scaledHeight = image.extent.height * scale
        let offsetX = (drawableSize.width - scaledWidth) / 2
        let offsetY = (drawableSize.height - scaledHeight) / 2

        let scaledImage = image
            .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            .transformed(by: CGAffineTransform(translationX: offsetX, y: offsetY))

        // Clear to black and render
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        ciContext.render(
            scaledImage,
            to: drawable.texture,
            commandBuffer: commandBuffer,
            bounds: bounds,
            colorSpace: colorSpace
        )

        commandBuffer.present(drawable)
        commandBuffer.commit()
    }
}

// MARK: - Preview

#Preview {
    Color.black
        .overlay(
            Text("Edge Detection Preview")
                .foregroundStyle(.white)
        )
}
