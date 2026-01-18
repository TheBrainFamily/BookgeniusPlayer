//
//  UploadService.swift
//  BookCompanion
//
//  Handles uploading scanned pages to the pipeline server for OCR processing.
//

import Foundation
import UIKit

/// Response from starting a scan session
struct StartSessionResponse: Codable {
    let sessionId: String
    let bookSlug: String
}

/// Response from uploading a page
struct UploadPageResponse: Codable {
    let pageIndex: Int
    let ocrStatus: String
}

/// Status of a single page
struct PageStatus: Codable {
    let pageIndex: Int
    let ocrStatus: String
    let text: String?
    let leftPage: Int?
    let rightPage: Int?
    let chapterNumber: Int?
    let chapterTitle: String?
    let error: String?
}

/// Response from session status endpoint
struct SessionStatusResponse: Codable {
    let sessionId: String
    let bookSlug: String
    let bookTitle: String
    let status: String
    let pages: [PageStatus]
}

/// Upload errors
enum UploadError: Error, LocalizedError {
    case serverUnreachable
    case invalidResponse
    case uploadFailed(String)
    case sessionNotStarted

    var errorDescription: String? {
        switch self {
        case .serverUnreachable:
            return "Cannot reach the server. Make sure the pipeline is running."
        case .invalidResponse:
            return "Received an invalid response from the server."
        case .uploadFailed(let message):
            return "Upload failed: \(message)"
        case .sessionNotStarted:
            return "No active scanning session. Please start a new book first."
        }
    }
}

/// Service for uploading scanned pages to the pipeline server
actor UploadService {

    // MARK: - Configuration

    /// Base URL for the pipeline server (hardcoded for local dev)
    private let baseURL = URL(string: "http://192.168.1.26:4000")!

    // MARK: - Session State

    private var currentSessionId: String?
    private var currentBookSlug: String?

    // MARK: - Public Interface

    /// Start a new scanning session for a book
    func startSession(bookTitle: String) async throws -> StartSessionResponse {
        let url = baseURL.appendingPathComponent("api/scan/start-session")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["bookTitle": bookTitle]
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw UploadError.serverUnreachable
        }

        let sessionResponse = try JSONDecoder().decode(StartSessionResponse.self, from: data)

        // Store session info
        currentSessionId = sessionResponse.sessionId
        currentBookSlug = sessionResponse.bookSlug

        print("[UploadService] Started session: \(sessionResponse.sessionId) for \(sessionResponse.bookSlug)")

        return sessionResponse
    }

    /// Upload a page image for OCR processing
    func uploadPage(pageIndex: Int, imageData: Data) async throws -> UploadPageResponse {
        guard let sessionId = currentSessionId,
              let bookSlug = currentBookSlug else {
            throw UploadError.sessionNotStarted
        }

        let url = baseURL.appendingPathComponent("api/scan/upload-page")

        // Create multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Add sessionId field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"sessionId\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(sessionId)\r\n".data(using: .utf8)!)

        // Add bookSlug field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"bookSlug\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(bookSlug)\r\n".data(using: .utf8)!)

        // Add pageIndex field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"pageIndex\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(pageIndex)\r\n".data(using: .utf8)!)

        // Add image file
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"page-\(pageIndex).jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)

        // End boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw UploadError.invalidResponse
        }

        if !(200...299).contains(httpResponse.statusCode) {
            let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw UploadError.uploadFailed(errorMessage)
        }

        let uploadResponse = try JSONDecoder().decode(UploadPageResponse.self, from: data)

        print("[UploadService] Uploaded page \(pageIndex): \(uploadResponse.ocrStatus)")

        return uploadResponse
    }

    /// Get the current session status
    func getSessionStatus() async throws -> SessionStatusResponse {
        guard let sessionId = currentSessionId,
              let bookSlug = currentBookSlug else {
            throw UploadError.sessionNotStarted
        }

        var urlComponents = URLComponents(url: baseURL.appendingPathComponent("api/scan/session/\(sessionId)/status"), resolvingAgainstBaseURL: false)!
        urlComponents.queryItems = [URLQueryItem(name: "bookSlug", value: bookSlug)]

        let (data, response) = try await URLSession.shared.data(from: urlComponents.url!)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw UploadError.serverUnreachable
        }

        return try JSONDecoder().decode(SessionStatusResponse.self, from: data)
    }

    /// Finish the current session and trigger chapter detection
    func finishSession() async throws {
        guard let sessionId = currentSessionId,
              let bookSlug = currentBookSlug else {
            throw UploadError.sessionNotStarted
        }

        let url = baseURL.appendingPathComponent("api/scan/session/\(sessionId)/finish")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["bookSlug": bookSlug]
        request.httpBody = try JSONEncoder().encode(body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw UploadError.serverUnreachable
        }

        print("[UploadService] Finished session \(sessionId)")
    }

    /// Check if there's an active session
    var hasActiveSession: Bool {
        currentSessionId != nil
    }

    /// Clear the current session
    nonisolated func clearSession() {
        Task {
            await self.doClearSession()
        }
    }

    private func doClearSession() {
        currentSessionId = nil
        currentBookSlug = nil
    }
}
