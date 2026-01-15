//
//  ScannerView.swift
//  BookCompanion
//
//  Main scanning interface with camera preview and detection overlay.
//

import SwiftUI
import UIKit

/// Main view for the page scanning interface
struct ScannerView: View {

    @StateObject private var viewModel = ScannerViewModel()

    var body: some View {
        ZStack {
            // Camera preview
            CameraPreview(session: viewModel.cameraManager.captureSession)
                .ignoresSafeArea()

            // Detection overlay
            DetectionOverlay(
                rectangles: viewModel.detectedRectangles,
                gateState: viewModel.gateState
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
                    isDeviceStable: viewModel.isDeviceStable
                )
                .padding()

                Spacer()

                // Bottom bar - controls
                ControlBar(
                    gateState: viewModel.gateState,
                    onManualCapture: viewModel.manualCapture,
                    onToggleAutoCapture: viewModel.toggleAutoCapture,
                    autoCapture: viewModel.autoCapture
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
    }
}

// MARK: - Detection Overlay

/// Draws the detected rectangle(s) on the camera preview
struct DetectionOverlay: View {

    let rectangles: [DetectedRectangle]
    let gateState: CaptureGateState

    var body: some View {
        GeometryReader { geometry in
            ForEach(rectangles.indices, id: \.self) { index in
                RectanglePath(rectangle: rectangles[index], size: geometry.size)
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

    func path(in rect: CGRect) -> Path {
        var path = Path()

        // Convert normalized coordinates to screen coordinates
        // Note: Vision Y is bottom-up, SwiftUI Y is top-down
        let topLeft = CGPoint(
            x: rectangle.topLeft.x * size.width,
            y: (1 - rectangle.topLeft.y) * size.height
        )
        let topRight = CGPoint(
            x: rectangle.topRight.x * size.width,
            y: (1 - rectangle.topRight.y) * size.height
        )
        let bottomLeft = CGPoint(
            x: rectangle.bottomLeft.x * size.width,
            y: (1 - rectangle.bottomLeft.y) * size.height
        )
        let bottomRight = CGPoint(
            x: rectangle.bottomRight.x * size.width,
            y: (1 - rectangle.bottomRight.y) * size.height
        )

        path.move(to: topLeft)
        path.addLine(to: topRight)
        path.addLine(to: bottomRight)
        path.addLine(to: bottomLeft)
        path.closeSubpath()

        return path
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
            return "Point at a book page"
        case .deviceMoving:
            return "Keep phone still..."
        case .blurry:
            return "Too blurry"
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
    let onToggleAutoCapture: () -> Void
    let autoCapture: Bool

    var body: some View {
        HStack(spacing: 40) {
            // Auto-capture toggle
            Button(action: onToggleAutoCapture) {
                VStack(spacing: 4) {
                    Image(systemName: autoCapture ? "bolt.fill" : "bolt.slash")
                        .font(.title2)
                    Text(autoCapture ? "Auto" : "Manual")
                        .font(.caption2)
                }
                .foregroundStyle(autoCapture ? .yellow : .white)
            }

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
            .disabled(gateState != .ready && !autoCapture)

            // Placeholder for symmetry
            VStack(spacing: 4) {
                Image(systemName: "photo.stack")
                    .font(.title2)
                Text("Review")
                    .font(.caption2)
            }
            .foregroundStyle(.white)
            .opacity(0.5)
        }
        .padding(.horizontal, 30)
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
