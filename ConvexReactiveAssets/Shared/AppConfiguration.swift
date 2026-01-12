//
//  AppConfiguration.swift
//  ConvexReactiveAssets
//
//  Shared configuration storage using a file (App Groups workaround)
//

import Foundation

/// Configuration data structure
struct ConvexConfig: Codable {
    var convexUrl: String?
    var adminKey: String?
    var rootPath: String?
}

/// Manages configuration shared between the main app and the File Provider extension
/// Uses a file in /tmp/ since App Groups requires paid developer account
final class AppConfiguration: @unchecked Sendable {
    static let shared = AppConfiguration()

    // File-based config in REAL user's home directory (not sandboxed container)
    private var configFileURL: URL {
        // Get real home directory, not sandboxed one
        let realHome: String
        if let pw = getpwuid(getuid()) {
            realHome = String(cString: pw.pointee.pw_dir)
        } else {
            realHome = NSHomeDirectory() // fallback
        }

        let configDir = URL(fileURLWithPath: realHome)
            .appendingPathComponent(".config/convex-reactive-assets", isDirectory: true)

        // Ensure directory exists
        try? FileManager.default.createDirectory(at: configDir, withIntermediateDirectories: true)

        return configDir.appendingPathComponent("config.json")
    }

    private init() {}

    // MARK: - File-based Storage

    private func loadConfig() -> ConvexConfig {
        guard FileManager.default.fileExists(atPath: configFileURL.path) else {
            return ConvexConfig()
        }
        do {
            let data = try Data(contentsOf: configFileURL)
            return try JSONDecoder().decode(ConvexConfig.self, from: data)
        } catch {
            print("AppConfiguration: Failed to load config: \(error)")
            return ConvexConfig()
        }
    }

    private func saveConfig(_ config: ConvexConfig) {
        do {
            let data = try JSONEncoder().encode(config)
            try data.write(to: configFileURL, options: .atomic)
            print("AppConfiguration: Saved config to \(configFileURL.path)")
        } catch {
            print("AppConfiguration: Failed to save config: \(error)")
        }
    }

    // MARK: - Properties

    /// The Convex deployment URL (e.g., "https://your-deployment.convex.cloud")
    var convexUrl: String? {
        get { loadConfig().convexUrl }
        set {
            var config = loadConfig()
            config.convexUrl = newValue
            saveConfig(config)
        }
    }

    /// The Convex admin key for authentication
    var adminKey: String? {
        get { loadConfig().adminKey }
        set {
            var config = loadConfig()
            config.adminKey = newValue
            saveConfig(config)
        }
    }

    /// Optional root path to filter the mounted folder tree
    var rootPath: String? {
        get { loadConfig().rootPath }
        set {
            var config = loadConfig()
            config.rootPath = newValue
            saveConfig(config)
        }
    }

    // MARK: - Computed Properties

    /// Returns the site URL for HTTP routes (converts .cloud to .site)
    var siteUrl: String? {
        guard let url = convexUrl else { return nil }
        let trimmed = url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if trimmed.hasSuffix(".cloud") {
            return String(trimmed.dropLast(6)) + ".site"
        }
        return trimmed
    }

    /// Base URL for file version access: {siteUrl}/am/file/v
    var fileVersionBaseUrl: String? {
        guard let site = siteUrl else { return nil }
        return "\(site)/am/file/v"
    }

    /// Whether configuration is complete and valid
    var isConfigured: Bool {
        guard let url = convexUrl, !url.isEmpty else { return false }
        return true
    }

    // MARK: - Methods

    /// Clears all stored configuration
    func clear() {
        try? FileManager.default.removeItem(at: configFileURL)
    }

    /// Debug: Print current config location and contents
    func debugPrint() {
        print("AppConfiguration file: \(configFileURL.path)")
        print("Exists: \(FileManager.default.fileExists(atPath: configFileURL.path))")
        let config = loadConfig()
        print("URL: \(config.convexUrl ?? "nil")")
        print("AdminKey: \(config.adminKey != nil ? "[set]" : "nil")")
    }
}
