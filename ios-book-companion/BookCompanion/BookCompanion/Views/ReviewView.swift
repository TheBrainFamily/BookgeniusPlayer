//
//  ReviewView.swift
//  BookCompanion
//
//  Simple in-app gallery for captured pages.
//

import SwiftUI

struct ReviewView: View {

    let captures: [StoredCapture]
    @Binding var prefersCropped: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var selectedCapture: StoredCapture?

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("\(captures.count) captured")
                            .font(.headline)
                        Spacer()
                    }

                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(Array(captures.enumerated()), id: \.element.id) { index, capture in
                            ReviewThumbnail(
                                index: index + 1,
                                url: preferredURL(for: capture),
                                onTap: { selectedCapture = capture }
                            )
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Review")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("Mode", selection: $prefersCropped) {
                        Text("Cropped").tag(true)
                        Text("Raw").tag(false)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 180)
                }
            }
        }
        .sheet(item: $selectedCapture) { capture in
            ReviewDetailView(
                capture: capture,
                prefersCropped: $prefersCropped
            )
        }
    }

    private func preferredURL(for capture: StoredCapture) -> URL {
        if prefersCropped, let processed = capture.processedFileURL {
            return processed
        }
        return capture.fileURL
    }
}

private struct ReviewThumbnail: View {

    let index: Int
    let url: URL
    let onTap: () -> Void

    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Color.black.opacity(0.08)
                    ProgressView()
                }
            }
            .frame(height: 160)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 10))

            Text("\(index)")
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
                .background(.black.opacity(0.6), in: Capsule())
                .foregroundStyle(.white)
                .padding(6)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
        .task(id: url) {
            image = await loadImage(from: url)
        }
    }

    private func loadImage(from url: URL) async -> UIImage? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                let image = UIImage(contentsOfFile: url.path)
                continuation.resume(returning: image)
            }
        }
    }

}

private struct ReviewDetailView: View {

    let capture: StoredCapture
    @Binding var prefersCropped: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var scale: CGFloat = 1
    @State private var lastScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()

                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(magnificationGesture)
                        .gesture(dragGesture)
                        .animation(.easeInOut(duration: 0.2), value: scale)
                } else {
                    ProgressView()
                        .tint(.white)
                }
            }
            .navigationTitle("Page")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Picker("Mode", selection: $prefersCropped) {
                        Text("Cropped").tag(true)
                        Text("Raw").tag(false)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 180)
                }
            }
        }
        .task(id: preferredURL()) {
            image = await loadImage(from: preferredURL())
            resetTransforms()
        }
    }

    private func preferredURL() -> URL {
        if prefersCropped, let processed = capture.processedFileURL {
            return processed
        }
        return capture.fileURL
    }

    private func loadImage(from url: URL) async -> UIImage? {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .utility).async {
                let image = UIImage(contentsOfFile: url.path)
                continuation.resume(returning: image)
            }
        }
    }

    private var magnificationGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                scale = max(1, min(6, lastScale * value))
            }
            .onEnded { _ in
                lastScale = scale
            }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = CGSize(
                    width: lastOffset.width + value.translation.width,
                    height: lastOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                lastOffset = offset
            }
    }

    private func resetTransforms() {
        scale = 1
        lastScale = 1
        offset = .zero
        lastOffset = .zero
    }
}
