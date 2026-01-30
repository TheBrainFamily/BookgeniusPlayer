//
//  PageQuestionService.swift
//  BookCompanion
//
//  Handles page question streaming API for AI-powered reading assistance.
//  Uses two-step flow: POST upload, then GET stream (iOS disconnects POST+SSE early)
//

import Foundation
import EventSource

/// Events received from the page question SSE stream
enum PageQuestionEvent {
    case session(id: String)
    case chunk(delta: String)
    case done(fullResponse: String)
    case error(message: String)
}

/// Errors specific to the page question service
enum PageQuestionError: Error, LocalizedError {
    case serverUnreachable
    case invalidResponse
    case sessionExpired
    case requestFailed(String)

    var errorDescription: String? {
        switch self {
        case .serverUnreachable:
            return "Cannot reach the server. Make sure the pipeline is running."
        case .invalidResponse:
            return "Received an invalid response from the server."
        case .sessionExpired:
            return "The session has expired. Please take a new photo."
        case .requestFailed(let message):
            return "Request failed: \(message)"
        }
    }
}

/// Service for AI-powered page question/answer with streaming responses
actor PageQuestionService {

    // MARK: - Configuration

    /// Base URL for the pipeline server
    private let baseURL = URL(string: "http://192.168.1.26:4000")!

    // MARK: - Session State

    private var currentSessionId: String?

    /// The current session ID (if any)
    var sessionId: String? {
        currentSessionId
    }

    // MARK: - Public Interface

    /// Start a new page question session with an image
    /// Two-step flow: POST upload, then GET stream (iOS disconnects POST+SSE)
    func startSession(
        bookSlug: String,
        chapterNumber: Int,
        imageData: Data
    ) -> AsyncThrowingStream<PageQuestionEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    // Step 1: Upload image via POST (returns sessionId)
                    let uploadUrl = baseURL.appendingPathComponent("api/page-question/upload")

                    let boundary = UUID().uuidString
                    var uploadRequest = URLRequest(url: uploadUrl)
                    uploadRequest.httpMethod = "POST"
                    uploadRequest.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

                    var body = Data()
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"bookSlug\"\r\n\r\n\(bookSlug)\r\n".data(using: .utf8)!)
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"chapterNumber\"\r\n\r\n\(chapterNumber)\r\n".data(using: .utf8)!)
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"image\"; filename=\"page.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
                    body.append(imageData)
                    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
                    uploadRequest.httpBody = body

                    print("[PageQuestionService] Uploading image (\(imageData.count) bytes)...")
                    let (uploadData, uploadResponse) = try await URLSession.shared.data(for: uploadRequest)

                    guard let httpResponse = uploadResponse as? HTTPURLResponse else {
                        continuation.yield(.error(message: "Invalid response"))
                        continuation.finish()
                        return
                    }

                    print("[PageQuestionService] Upload status: \(httpResponse.statusCode)")

                    if httpResponse.statusCode != 200 {
                        let errorBody = String(data: uploadData, encoding: .utf8) ?? "no body"
                        print("[PageQuestionService] Upload error: \(errorBody)")
                        continuation.yield(.error(message: "Upload failed: \(errorBody)"))
                        continuation.finish()
                        return
                    }

                    struct UploadResponse: Decodable { let sessionId: String }
                    let uploadResult = try JSONDecoder().decode(UploadResponse.self, from: uploadData)
                    let sessionId = uploadResult.sessionId

                    print("[PageQuestionService] Got sessionId: \(sessionId)")
                    await self.setSessionId(sessionId)
                    continuation.yield(.session(id: sessionId))

                    // Step 2: Stream response via GET (SSE works with GET!)
                    let streamUrl = baseURL.appendingPathComponent("api/page-question/stream/\(sessionId)")
                    var streamRequest = URLRequest(url: streamUrl)
                    streamRequest.httpMethod = "GET"

                    print("[PageQuestionService] Starting stream...")
                    let (bytes, _) = try await URLSession.shared.bytes(for: streamRequest)

                    for try await event in bytes.events {
                        if let parsed = self.parseEvent(event) {
                            print("[PageQuestionService] Event: \(parsed)")
                            continuation.yield(parsed)
                        }
                    }

                    print("[PageQuestionService] Stream complete")
                    continuation.finish()

                } catch {
                    print("[PageQuestionService] Error: \(error)")
                    continuation.yield(.error(message: error.localizedDescription))
                    continuation.finish()
                }
            }
        }
    }

    /// Parse EventSource event
    private nonisolated func parseEvent(_ event: EventSource.Event) -> PageQuestionEvent? {
        guard let eventType = event.event else { return nil }
        let jsonData = Data(event.data.utf8)

        switch eventType {
        case "chunk":
            struct ChunkData: Decodable { let delta: String }
            guard let decoded = try? JSONDecoder().decode(ChunkData.self, from: jsonData) else { return nil }
            return .chunk(delta: decoded.delta)
        case "done":
            struct DoneData: Decodable { let fullResponse: String }
            guard let decoded = try? JSONDecoder().decode(DoneData.self, from: jsonData) else { return nil }
            return .done(fullResponse: decoded.fullResponse)
        case "error":
            struct ErrorData: Decodable { let message: String }
            guard let decoded = try? JSONDecoder().decode(ErrorData.self, from: jsonData) else { return nil }
            return .error(message: decoded.message)
        default:
            return nil
        }
    }

    /// Send a follow-up message in an existing session
    /// Uses GET with query param for SSE streaming
    func sendFollowUp(message: String) -> AsyncThrowingStream<PageQuestionEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                guard let sessionId = await self.currentSessionId else {
                    continuation.yield(.error(message: "No active session"))
                    continuation.finish()
                    return
                }

                do {
                    // Use GET with message as query param (SSE works with GET)
                    var components = URLComponents(url: baseURL.appendingPathComponent("api/page-question/stream-follow-up/\(sessionId)"), resolvingAgainstBaseURL: false)!
                    components.queryItems = [URLQueryItem(name: "message", value: message)]

                    var request = URLRequest(url: components.url!)
                    request.httpMethod = "GET"

                    print("[PageQuestionService] Sending follow-up via GET...")
                    let (bytes, _) = try await URLSession.shared.bytes(for: request)

                    for try await event in bytes.events {
                        if let parsed = self.parseEvent(event) {
                            continuation.yield(parsed)
                        }
                    }

                    continuation.finish()

                } catch {
                    print("[PageQuestionService] Follow-up error: \(error)")
                    continuation.yield(.error(message: error.localizedDescription))
                    continuation.finish()
                }
            }
        }
    }

    /// Clear the current session
    func clearSession() {
        currentSessionId = nil
    }

    // MARK: - Private Helpers

    private func setSessionId(_ id: String) {
        currentSessionId = id
    }
}
