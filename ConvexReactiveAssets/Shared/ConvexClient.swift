//
//  ConvexClient.swift
//  ConvexReactiveAssets
//
//  HTTP client for communicating with Convex asset-manager
//

import Foundation
import os.log

private let clientLogger = Logger(subsystem: "pro.lgandecki.ConvexAssetMountProvider", category: "ConvexClient")

/// Client for communicating with Convex backend
actor ConvexClient {
    private let convexUrl: String
    private let adminKey: String?
    private let session: URLSession

    init(convexUrl: String, adminKey: String? = nil) {
        self.convexUrl = convexUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.adminKey = adminKey

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
    }

    // MARK: - Site URL Conversion

    /// Converts .cloud URL to .site URL for HTTP routes
    private var siteUrl: String {
        if convexUrl.hasSuffix(".cloud") {
            return String(convexUrl.dropLast(6)) + ".site"
        }
        return convexUrl
    }

    // MARK: - Query Execution

    /// Executes a Convex query function
    private func executeQuery<T: Decodable>(
        functionPath: String,
        args: [String: Any]
    ) async throws -> T {
        let url = URL(string: "\(convexUrl)/api/query")!
        clientLogger.info("=== CONVEX QUERY: \(functionPath) ===")
        clientLogger.info("URL: \(url.absoluteString)")
        clientLogger.info("Args: \(String(describing: args))")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Admin key goes in args as _adminKey, not in Authorization header
        var argsWithAdmin = args
        if let key = adminKey {
            argsWithAdmin["_adminKey"] = key
            clientLogger.info("Using admin key in args")
        } else {
            clientLogger.info("No admin key")
        }

        // Build the request body - cli functions are top-level, not components
        let body: [String: Any] = [
            "path": functionPath,
            "args": argsWithAdmin
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        clientLogger.info("Request body: \(String(data: request.httpBody!, encoding: .utf8) ?? "nil")")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            clientLogger.error("Invalid response type")
            throw ConvexClientError.invalidResponse
        }

        clientLogger.info("HTTP Status: \(httpResponse.statusCode)")
        let responseBody = String(data: data, encoding: .utf8) ?? "nil"
        clientLogger.info("Response body: \(responseBody.prefix(500))")

        guard httpResponse.statusCode == 200 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            clientLogger.error("HTTP error: \(httpResponse.statusCode) - \(errorBody)")
            throw ConvexClientError.httpError(statusCode: httpResponse.statusCode, body: errorBody)
        }

        // Convex returns { "value": <result>, "status": "success" } or { "errorMessage": "..." }
        let decoder = JSONDecoder()
        let wrapper = try decoder.decode(ConvexQueryResponse<T>.self, from: data)

        if let errorMessage = wrapper.errorMessage {
            clientLogger.error("Convex error: \(errorMessage)")
            throw ConvexClientError.convexError(message: errorMessage)
        }

        guard let value = wrapper.value else {
            clientLogger.error("Empty response value")
            throw ConvexClientError.emptyResponse
        }

        clientLogger.info("Query SUCCESS")
        return value
    }

    // MARK: - Folder Operations

    /// Lists child folders of a parent path
    func listFolders(parentPath: String? = nil) async throws -> [ConvexFolder] {
        var args: [String: Any] = [:]
        if let parentPath = parentPath {
            args["parentPath"] = parentPath
        }

        return try await executeQuery(
            functionPath: "cli:listFolders",
            args: args
        )
    }

    // MARK: - File Operations

    /// Lists published files in a folder (includes download URLs)
    func listPublishedFiles(folderPath: String) async throws -> [ConvexPublishedFile] {
        return try await executeQuery(
            functionPath: "cli:listPublishedFilesInFolder",
            args: ["folderPath": folderPath]
        )
    }

    /// Gets a single published file by looking it up in the folder listing
    func getPublishedFile(folderPath: String, basename: String) async throws -> ConvexPublishedFile? {
        let files = try await listPublishedFiles(folderPath: folderPath)
        return files.first { $0.basename == basename }
    }


    // MARK: - File Content

    /// Downloads file content from a direct URL
    func downloadFromURL(_ urlString: String) async throws -> (data: Data, contentType: String?) {
        guard let url = URL(string: urlString) else {
            throw ConvexClientError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        // Add auth header if needed for private files
        if let key = adminKey {
            request.setValue("Convex \(key)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexClientError.invalidResponse
        }

        // Handle redirects (for R2 or large Convex files)
        if httpResponse.statusCode == 302 || httpResponse.statusCode == 301 {
            guard let locationHeader = httpResponse.value(forHTTPHeaderField: "Location"),
                  let redirectUrl = URL(string: locationHeader) else {
                throw ConvexClientError.invalidRedirect
            }

            let redirectRequest = URLRequest(url: redirectUrl)
            let (redirectData, redirectResponse) = try await session.data(for: redirectRequest)

            guard let redirectHttpResponse = redirectResponse as? HTTPURLResponse,
                  redirectHttpResponse.statusCode == 200 else {
                throw ConvexClientError.downloadFailed
            }

            let contentType = redirectHttpResponse.value(forHTTPHeaderField: "Content-Type")
            return (redirectData, contentType)
        }

        guard httpResponse.statusCode == 200 else {
            throw ConvexClientError.httpError(statusCode: httpResponse.statusCode, body: "Download failed")
        }

        let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type")
        return (data, contentType)
    }

    /// Downloads file content by version ID (legacy method)
    func downloadFile(versionId: String) async throws -> (data: Data, contentType: String?) {
        let url = URL(string: "\(siteUrl)/am/file/v/\(versionId)")!

        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        if let key = adminKey {
            request.setValue("Convex \(key)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexClientError.invalidResponse
        }

        // Handle redirects (for R2 or large Convex files)
        if httpResponse.statusCode == 302 || httpResponse.statusCode == 301 {
            guard let locationHeader = httpResponse.value(forHTTPHeaderField: "Location"),
                  let redirectUrl = URL(string: locationHeader) else {
                throw ConvexClientError.invalidRedirect
            }

            // Follow the redirect
            let redirectRequest = URLRequest(url: redirectUrl)
            let (redirectData, redirectResponse) = try await session.data(for: redirectRequest)

            guard let redirectHttpResponse = redirectResponse as? HTTPURLResponse,
                  redirectHttpResponse.statusCode == 200 else {
                throw ConvexClientError.downloadFailed
            }

            let contentType = redirectHttpResponse.value(forHTTPHeaderField: "Content-Type")
            return (redirectData, contentType)
        }

        guard httpResponse.statusCode == 200 else {
            throw ConvexClientError.httpError(statusCode: httpResponse.statusCode, body: "Download failed")
        }

        let contentType = httpResponse.value(forHTTPHeaderField: "Content-Type")
        return (data, contentType)
    }

    /// Downloads file content to a local URL (from direct URL)
    func downloadToFile(from urlString: String, destinationURL: URL) async throws -> String? {
        let (data, contentType) = try await downloadFromURL(urlString)
        try data.write(to: destinationURL)
        return contentType
    }

    /// Downloads file content to a local URL (legacy versionId method)
    func downloadFileToURL(versionId: String, destinationURL: URL) async throws -> String? {
        let (data, contentType) = try await downloadFile(versionId: versionId)
        try data.write(to: destinationURL)
        return contentType
    }

    /// Builds the URL for a file version (for direct access)
    func fileVersionURL(versionId: String) -> URL {
        URL(string: "\(siteUrl)/am/file/v/\(versionId)")!
    }
}

// MARK: - Response Types

private struct ConvexQueryResponse<T: Decodable>: Decodable {
    let value: T?
    let status: String?
    let errorMessage: String?
}

// MARK: - Errors

enum ConvexClientError: LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int, body: String)
    case convexError(message: String)
    case emptyResponse
    case invalidRedirect
    case downloadFailed

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let statusCode, let body):
            return "HTTP error \(statusCode): \(body)"
        case .convexError(let message):
            return "Convex error: \(message)"
        case .emptyResponse:
            return "Empty response from server"
        case .invalidRedirect:
            return "Invalid redirect response"
        case .downloadFailed:
            return "File download failed"
        }
    }
}
