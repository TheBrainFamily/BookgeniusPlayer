//
//  ContentView.swift
//  ConvexReactiveAssets
//
//  Configuration UI for Convex asset-manager mount
//

import SwiftUI
import FileProvider

struct ContentView: View {
    @State private var convexUrl: String = ""
    @State private var adminKey: String = ""
    @State private var isMounted: Bool = false
    @State private var isLoading: Bool = false
    @State private var statusMessage: String = ""
    @State private var errorMessage: String?
    @State private var currentDomain: NSFileProviderDomain?

    private let domainDisplayName = "Convex Assets"

    var body: some View {
        VStack(spacing: 20) {
            // Header
            HStack {
                Image(systemName: "externaldrive.connected.to.line.below")
                    .font(.largeTitle)
                    .foregroundStyle(.blue)
                Text("Convex Assets")
                    .font(.largeTitle)
                    .fontWeight(.bold)
            }
            .padding(.top)

            // Status indicator
            HStack {
                Circle()
                    .fill(isMounted ? Color.green : Color.gray)
                    .frame(width: 12, height: 12)
                Text(isMounted ? "Mounted" : "Not Mounted")
                    .foregroundStyle(isMounted ? .green : .secondary)
            }
            .padding(.bottom)

            // Configuration form
            GroupBox("Configuration") {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Convex Deployment URL")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("https://your-deployment.convex.cloud", text: $convexUrl)
                            .textFieldStyle(.roundedBorder)
                            .disabled(isMounted)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Admin Key (optional)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        SecureField("prod:abc123...", text: $adminKey)
                            .textFieldStyle(.roundedBorder)
                            .disabled(isMounted)
                    }
                }
                .padding(.vertical, 8)
            }
            .padding(.horizontal)

            // Error message
            if let error = errorMessage {
                Text(error)
                    .foregroundStyle(.red)
                    .font(.caption)
                    .padding(.horizontal)
            }

            // Status message
            if !statusMessage.isEmpty {
                Text(statusMessage)
                    .foregroundStyle(.secondary)
                    .font(.caption)
                    .padding(.horizontal)
            }

            // Action buttons
            HStack(spacing: 16) {
                if isMounted {
                    Button(action: unmount) {
                        Label("Unmount", systemImage: "eject")
                    }
                    .buttonStyle(.bordered)
                    .disabled(isLoading)

                    Button(action: openInFinder) {
                        Label("Open in Finder", systemImage: "folder")
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button(action: mount) {
                        Label("Mount", systemImage: "externaldrive.badge.plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isLoading || convexUrl.isEmpty)
                }
            }
            .padding()

            if isLoading {
                ProgressView()
                    .scaleEffect(0.8)
            }

            Spacer()

            // Help text
            Text("The mounted volume will appear in Finder's sidebar.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.bottom)
        }
        .frame(minWidth: 400, minHeight: 400)
        .padding()
        .onAppear {
            loadConfiguration()
            checkMountStatus()
        }
    }

    // MARK: - Actions

    private func mount() {
        guard !convexUrl.isEmpty else { return }

        isLoading = true
        errorMessage = nil
        statusMessage = "Saving configuration..."

        Task {
            // Save configuration
            let config = AppConfiguration.shared
            config.convexUrl = convexUrl
            config.adminKey = adminKey.isEmpty ? nil : adminKey

            await MainActor.run {
                statusMessage = "Registering domain..."
            }

            // Create domain (config passed via identifier encoding)
            // Format: "convex|{encodedUrl}|{encodedAdminKey}"
            let encodedUrl = convexUrl.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
            let encodedKey = (adminKey.isEmpty ? "" : adminKey).addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
            let domainId = NSFileProviderDomainIdentifier("convex|\(encodedUrl)|\(encodedKey)")
            let domain = NSFileProviderDomain(
                identifier: domainId,
                displayName: "Convex Assets"
            )

            do {
                try await NSFileProviderManager.add(domain)
                await MainActor.run {
                    currentDomain = domain
                    isMounted = true
                    isLoading = false
                    statusMessage = "Mounted successfully"
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    errorMessage = "Mount failed: \(error.localizedDescription)"
                    statusMessage = ""
                }
            }
        }
    }

    private func unmount() {
        isLoading = true
        errorMessage = nil
        statusMessage = "Unmounting..."

        Task {
            // Find and remove the domain by displayName
            let domains = try? await NSFileProviderManager.domains()
            guard let domain = domains?.first(where: { $0.displayName == domainDisplayName }) else {
                await MainActor.run {
                    isLoading = false
                    errorMessage = "No domain found to unmount"
                }
                return
            }

            do {
                try await NSFileProviderManager.remove(domain)
                await MainActor.run {
                    isMounted = false
                    isLoading = false
                    statusMessage = "Unmounted"
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    errorMessage = "Unmount failed: \(error.localizedDescription)"
                    statusMessage = ""
                }
            }
        }
    }

    private func openInFinder() {
        Task {
            guard let domain = currentDomain else {
                await MainActor.run {
                    errorMessage = "No domain available"
                }
                return
            }

            if let manager = NSFileProviderManager(for: domain) {
                do {
                    let url = try await manager.getUserVisibleURL(for: .rootContainer)
                    NSWorkspace.shared.open(url)
                } catch {
                    await MainActor.run {
                        errorMessage = "Could not open Finder: \(error.localizedDescription)"
                    }
                }
            }
        }
    }

    private func loadConfiguration() {
        let config = AppConfiguration.shared
        convexUrl = config.convexUrl ?? ""
        adminKey = config.adminKey ?? ""
    }

    private func checkMountStatus() {
        Task {
            do {
                let domains = try await NSFileProviderManager.domains()
                let existingDomain = domains.first { $0.displayName == domainDisplayName }

                await MainActor.run {
                    currentDomain = existingDomain
                    isMounted = existingDomain != nil

                    if let domain = existingDomain {
                        let hasUrl = (domain.userInfo?["convexUrl"] as? String)?.isEmpty == false
                        if hasUrl {
                            statusMessage = "Domain is active"
                        } else {
                            statusMessage = "Domain exists but no URL - remount with URL"
                        }
                    }
                }
            } catch {
                await MainActor.run {
                    statusMessage = "Could not check status"
                }
            }
        }
    }
}

// MARK: - Async Extensions

extension NSFileProviderManager {
    static func add(_ domain: NSFileProviderDomain) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            NSFileProviderManager.add(domain) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    static func remove(_ domain: NSFileProviderDomain) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            NSFileProviderManager.remove(domain) { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }

    static func domains() async throws -> [NSFileProviderDomain] {
        try await withCheckedThrowingContinuation { continuation in
            NSFileProviderManager.getDomainsWithCompletionHandler { domains, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: domains)
                }
            }
        }
    }

    func getUserVisibleURL(for identifier: NSFileProviderItemIdentifier) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            self.getUserVisibleURL(for: identifier) { url, error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else if let url = url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: NSError(domain: "FileProvider", code: -1))
                }
            }
        }
    }
}

#Preview {
    ContentView()
}
