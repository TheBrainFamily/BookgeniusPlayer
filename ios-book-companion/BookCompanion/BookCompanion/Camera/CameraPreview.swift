//
//  CameraPreview.swift
//  BookCompanion
//
//  SwiftUI wrapper for AVCaptureVideoPreviewLayer.
//

import SwiftUI
import AVFoundation
import UIKit

/// SwiftUI view that displays the camera preview.
/// Uses UIViewRepresentable to bridge AVCaptureVideoPreviewLayer to SwiftUI.
struct CameraPreview: UIViewRepresentable {

    let session: AVCaptureSession
    let onPreviewLayer: ((AVCaptureVideoPreviewLayer) -> Void)?

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        onPreviewLayer?(view.previewLayer)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        // Session is set once; no updates needed
        onPreviewLayer?(uiView.previewLayer)
    }

    /// UIView subclass that uses AVCaptureVideoPreviewLayer as its backing layer.
    /// This gives better performance than adding a sublayer.
    class PreviewView: UIView {

        override class var layerClass: AnyClass {
            AVCaptureVideoPreviewLayer.self
        }

        var previewLayer: AVCaptureVideoPreviewLayer {
            layer as! AVCaptureVideoPreviewLayer
        }
    }
}
