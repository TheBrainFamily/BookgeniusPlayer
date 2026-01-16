//
//  ScannerView.swift
//  BookCompanion
//
//  Main scanning interface with camera preview and detection overlay.
//

import SwiftUI
import UIKit
import AVFoundation
import AVKit

/// Main view for the page scanning interface
struct ScannerView: View {

    @StateObject private var viewModel = ScannerViewModel()
    @State private var previewLayer: AVCaptureVideoPreviewLayer?
    @State private var isReviewPresented = false
    @State private var prefersCropped = true

    var body: some View {
        ZStack {
            // Camera preview
            CameraPreview(
                session: viewModel.cameraManager.captureSession,
                onPreviewLayer: { layer in
                    if previewLayer !== layer {
                        previewLayer = layer
                    }
                    viewModel.cameraManager.setPreviewLayer(layer)
                }
            )
                .ignoresSafeArea()

            // Detection overlay
            DetectionOverlay(
                rectangles: overlayRectangles,
                gateState: viewModel.gateState,
                previewLayer: previewLayer
            )

            // UI controls overlay
            VStack {
                // Top bar - status
                StatusBar(
                    gateState: viewModel.gateState,
                    captureCount: viewModel.captureCount,
                    hasDetection: viewModel.hasDetection,
                    frameCount: viewModel.frameCount,
                    isRectangleStable: viewModel.isRectangleStable,
                    isDeviceStable: viewModel.isDeviceStable,
                    isCaptureRequested: viewModel.isCaptureRequested
                )
                .padding()

                Spacer()

                // Bottom bar - controls
                ControlBar(
                    gateState: viewModel.gateState,
                    onManualCapture: viewModel.requestCapture,
                    onReview: { isReviewPresented = true }
                )
                .padding()
                .padding(.bottom, 20)
            }

            // Captured image preview (briefly shown after capture)
            if let lastCapture = viewModel.lastCapturedImage {
                CapturePreview(image: lastCapture)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .task {
            await viewModel.start()
        }
        .onDisappear {
            viewModel.stop()
        }
        .onCameraCaptureEvent(isEnabled: viewModel.cameraManager.permissionGranted) { event in
            if event.phase == .ended {
                viewModel.requestCapture()
            }
        }
        .sheet(isPresented: $isReviewPresented) {
            ReviewView(
                captures: viewModel.storedCaptures,
                prefersCropped: $prefersCropped
            )
        }
    }

    private var overlayRectangles: [DetectedRectangle] {
        if viewModel.isRectangleStable, let locked = viewModel.lockedRectangle {
            return [locked]
        }
        if let smoothed = viewModel.smoothedRectangle {
            return [smoothed]
        }
        return viewModel.detectedRectangles
    }
}

// MARK: - Detection Overlay

/// Draws the detected rectangle(s) on the camera preview
struct DetectionOverlay: View {

    let rectangles: [DetectedRectangle]
    let gateState: CaptureGateState
    let previewLayer: AVCaptureVideoPreviewLayer?

    var body: some View {
        GeometryReader { geometry in
            ForEach(rectangles.indices, id: \.self) { index in
                RectanglePath(
                    rectangle: rectangles[index],
                    size: geometry.size,
                    previewLayer: previewLayer
                )
                    .stroke(strokeColor, lineWidth: strokeWidth)
                    .animation(.easeInOut(duration: 0.1), value: gateState)
            }
        }
    }

    private var strokeColor: Color {
        switch gateState {
        case .ready:
            return .green
        case .captured:
            return .green.opacity(0.5)
        case .noRectangle:
            return .clear
        default:
            return .yellow
        }
    }

    private var strokeWidth: CGFloat {
        gateState == .ready ? 4 : 2
    }
}

/// Shape that draws a quadrilateral from a DetectedRectangle
struct RectanglePath: Shape {

    let rectangle: DetectedRectangle
    let size: CGSize
    let previewLayer: AVCaptureVideoPreviewLayer?

    func path(in rect: CGRect) -> Path {
        var path = Path()

        let topLeft = convert(rectangle.topLeft)
        let topRight = convert(rectangle.topRight)
        let bottomLeft = convert(rectangle.bottomLeft)
        let bottomRight = convert(rectangle.bottomRight)

        path.move(to: topLeft)
        path.addLine(to: topRight)
        path.addLine(to: bottomRight)
        path.addLine(to: bottomLeft)
        path.closeSubpath()

        return path
    }

    private func convert(_ visionPoint: CGPoint) -> CGPoint {
        guard let previewLayer else {
            return CGPoint(
                x: visionPoint.x * size.width,
                y: (1 - visionPoint.y) * size.height
            )
        }

        // Vision: normalized, origin bottom-left. Capture device: origin top-left.
        let devicePoint = CGPoint(x: visionPoint.x, y: 1 - visionPoint.y)
        let layerPoint = previewLayer.layerPointConverted(fromCaptureDevicePoint: devicePoint)

        let layerSize = previewLayer.bounds.size
        guard layerSize.width > 0, layerSize.height > 0 else {
            return layerPoint
        }

        let scaleX = size.width / layerSize.width
        let scaleY = size.height / layerSize.height
        return CGPoint(x: layerPoint.x * scaleX, y: layerPoint.y * scaleY)
    }
}

// MARK: - Status Bar

struct StatusBar: View {

    let gateState: CaptureGateState
    let captureCount: Int
    let hasDetection: Bool
    let frameCount: Int
    let isRectangleStable: Bool
    let isDeviceStable: Bool
    let isCaptureRequested: Bool

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                // Status indicator
                HStack(spacing: 8) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 12, height: 12)

                    Text(statusText)
                        .font(.subheadline)
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())

                Spacer()

                // Capture count
                if captureCount > 0 {
                    Text("\(captureCount) pages")
                        .font(.subheadline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                }
            }

            // Debug info
            HStack(spacing: 6) {
                debugIndicator("F", value: frameCount > 0, detail: "\(frameCount)")
                debugIndicator("D", value: hasDetection)
                debugIndicator("R", value: isRectangleStable)
                debugIndicator("M", value: isDeviceStable)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(.ultraThinMaterial, in: Capsule())
        }
    }

    @ViewBuilder
    private func debugIndicator(_ label: String, value: Bool, detail: String? = nil) -> some View {
        HStack(spacing: 2) {
            Text(label)
                .font(.caption2)
                .fontWeight(.bold)
            Circle()
                .fill(value ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            if let detail = detail {
                Text(detail)
                    .font(.caption2)
            }
        }
        .foregroundStyle(.white.opacity(0.8))
    }

    private var statusColor: Color {
        switch gateState {
        case .ready:
            return .green
        case .captured:
            return .green
        case .noRectangle:
            return .gray
        case .deviceMoving, .blurry:
            return .yellow
        }
    }

    private var statusText: String {
        switch gateState {
        case .noRectangle:
            return isCaptureRequested ? "Hold still..." : "Press shutter or volume"
        case .deviceMoving:
            return "Keep phone still..."
        case .blurry:
            return "Checking focus..."
        case .ready:
            return "Ready!"
        case .captured:
            return "Captured!"
        }
    }
}

// MARK: - Control Bar

struct ControlBar: View {

    let gateState: CaptureGateState
    let onManualCapture: () -> Void
    let onReview: () -> Void

    var body: some View {
        HStack(spacing: 32) {
            // Manual capture button
            Button(action: onManualCapture) {
                ZStack {
                    Circle()
                        .fill(.white)
                        .frame(width: 70, height: 70)

                    Circle()
                        .fill(gateState == .ready ? Color.green : Color.gray)
                        .frame(width: 60, height: 60)
                }
            }

            // Placeholder for symmetry
            Button(action: onReview) {
                VStack(spacing: 4) {
                    Image(systemName: "photo.stack")
                        .font(.title2)
                    Text("Review")
                        .font(.caption2)
                }
                .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
    }
}

// MARK: - Capture Preview

/// Brief preview of captured image
struct CapturePreview: View {

    let image: UIImage

    var body: some View {
        Image(uiImage: image)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: 120, height: 180)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.green, lineWidth: 2)
            )
            .shadow(radius: 10)
            .position(x: 80, y: 200)
    }
}

// MARK: - Preview

#Preview {
    ScannerView()
}
