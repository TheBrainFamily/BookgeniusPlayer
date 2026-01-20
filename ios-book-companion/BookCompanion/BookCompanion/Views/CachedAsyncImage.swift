//
//  CachedAsyncImage.swift
//  BookCompanion
//
//  A drop-in replacement for AsyncImage that caches loaded images in memory.
//  Prevents re-fetching when views are recycled in LazyVGrid/LazyVStack.
//

import SwiftUI
import UIKit

/// Global image cache shared across all CachedAsyncImage instances
/// Uses NSCache for automatic memory management under pressure
final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()

    private let cache = NSCache<NSURL, UIImage>()

    private init() {
        // Configure cache limits
        cache.countLimit = 100 // Max 100 images
        cache.totalCostLimit = 50 * 1024 * 1024 // 50 MB
    }

    func image(for url: URL) -> UIImage? {
        cache.object(forKey: url as NSURL)
    }

    func setImage(_ image: UIImage, for url: URL) {
        let cost = image.pngData()?.count ?? 0
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }
}

/// Actor to manage in-flight loading tasks (prevents duplicate downloads)
private actor ImageLoadingCoordinator {
    static let shared = ImageLoadingCoordinator()

    private var loadingTasks: [URL: Task<UIImage?, Never>] = [:]

    func loadImage(from url: URL) async -> UIImage? {
        // Check cache first (cache is thread-safe)
        if let cached = ImageCache.shared.image(for: url) {
            return cached
        }

        // Check if already loading
        if let existingTask = loadingTasks[url] {
            return await existingTask.value
        }

        // Start new loading task
        let task = Task<UIImage?, Never> {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                if let image = UIImage(data: data) {
                    ImageCache.shared.setImage(image, for: url)
                    return image
                }
            } catch {
                print("[ImageCache] Failed to load \(url): \(error)")
            }
            return nil
        }

        loadingTasks[url] = task
        let result = await task.value
        loadingTasks.removeValue(forKey: url)

        return result
    }
}

/// Cached version of AsyncImage - caches loaded images to prevent re-fetching
struct CachedAsyncImage<Content: View, Placeholder: View>: View {
    let url: URL?
    let content: (Image) -> Content
    let placeholder: () -> Placeholder

    @State private var loadedImage: UIImage?
    @State private var isLoading = false

    init(
        url: URL?,
        @ViewBuilder content: @escaping (Image) -> Content,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.content = content
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let image = loadedImage {
                content(Image(uiImage: image))
            } else {
                placeholder()
                    .task(id: url) {
                        await loadImage()
                    }
            }
        }
    }

    private func loadImage() async {
        guard let url = url else { return }
        guard !isLoading else { return }

        // Check cache synchronously first
        if let cached = ImageCache.shared.image(for: url) {
            loadedImage = cached
            return
        }

        isLoading = true
        loadedImage = await ImageLoadingCoordinator.shared.loadImage(from: url)
        isLoading = false
    }
}

// Convenience initializer matching AsyncImage's common usage pattern
extension CachedAsyncImage where Content == Image, Placeholder == ProgressView<EmptyView, EmptyView> {
    init(url: URL?) {
        self.init(url: url) { image in
            image
        } placeholder: {
            ProgressView()
        }
    }
}
