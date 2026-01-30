//
//  PageQuestionViewModel.swift
//  BookCompanion
//
//  ViewModel for the page question feature - handles camera capture and chat state.
//

import SwiftUI
import UIKit

/// A message in the chat conversation
struct ChatMessage: Identifiable {
    let id = UUID()
    let role: Role
    var content: String
    let timestamp: Date

    enum Role {
        case user
        case assistant
    }
}

/// The current phase of the page question flow
enum PageQuestionPhase {
    case camera
    case chat
}

/// ViewModel for the page question feature
@MainActor
final class PageQuestionViewModel: ObservableObject {

    // MARK: - Published State

    /// Current phase (camera or chat)
    @Published var phase: PageQuestionPhase = .camera

    /// Chat messages
    @Published private(set) var messages: [ChatMessage] = []

    /// The currently streaming response text
    @Published private(set) var streamingText: String = ""

    /// Whether we're currently streaming a response
    @Published private(set) var isStreaming: Bool = false

    /// User's input text for follow-up questions
    @Published var inputText: String = ""

    /// Error message to display
    @Published var errorMessage: String?

    /// The captured image (for display in chat)
    @Published private(set) var capturedImage: UIImage?

    // MARK: - Book Context (set by parent view)

    var bookSlug: String?
    var chapterNumber: Int = 1

    // MARK: - Private State

    private let pageQuestionService = PageQuestionService()
    private var hasActiveSession: Bool = false

    // MARK: - Camera Actions

    /// Capture image and start the AI conversation
    func captureAndAsk(image: UIImage) async {
        // Store the captured image for display
        capturedImage = image

        // Convert to JPEG
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            errorMessage = "Failed to process image"
            return
        }

        // Transition to chat phase
        phase = .chat
        isStreaming = true
        streamingText = ""
        errorMessage = nil

        // Add a placeholder message for the assistant response
        let assistantMessage = ChatMessage(role: .assistant, content: "", timestamp: Date())
        messages.append(assistantMessage)
        let messageIndex = messages.count - 1

        // Start the session and stream response
        let stream = await pageQuestionService.startSession(
            bookSlug: bookSlug ?? "unknown",
            chapterNumber: chapterNumber,
            imageData: imageData
        )

        do {
            for try await event in stream {
                switch event {
                case .session:
                    hasActiveSession = true

                case .chunk(let delta):
                    streamingText += delta
                    // Update the message content as we stream
                    if messageIndex < messages.count {
                        messages[messageIndex].content = streamingText
                    }

                case .done(let fullResponse):
                    // Finalize the message
                    if messageIndex < messages.count {
                        messages[messageIndex].content = fullResponse
                    }
                    streamingText = ""
                    isStreaming = false

                case .error(let message):
                    errorMessage = message
                    isStreaming = false
                    // Remove the placeholder message if there was an error
                    if messageIndex < messages.count && messages[messageIndex].content.isEmpty {
                        messages.remove(at: messageIndex)
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
            isStreaming = false
        }
    }

    // MARK: - Chat Actions

    /// Send a follow-up message
    func sendFollowUp() async {
        let message = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }

        // Clear input immediately
        inputText = ""
        errorMessage = nil

        // Add user message
        messages.append(ChatMessage(role: .user, content: message, timestamp: Date()))

        // Add placeholder for assistant response
        isStreaming = true
        streamingText = ""
        let assistantMessage = ChatMessage(role: .assistant, content: "", timestamp: Date())
        messages.append(assistantMessage)
        let messageIndex = messages.count - 1

        // Stream the follow-up response
        let stream = await pageQuestionService.sendFollowUp(message: message)

        do {
            for try await event in stream {
                switch event {
                case .session:
                    break // Session already exists

                case .chunk(let delta):
                    streamingText += delta
                    if messageIndex < messages.count {
                        messages[messageIndex].content = streamingText
                    }

                case .done(let fullResponse):
                    if messageIndex < messages.count {
                        messages[messageIndex].content = fullResponse
                    }
                    streamingText = ""
                    isStreaming = false

                case .error(let message):
                    errorMessage = message
                    isStreaming = false
                    if messageIndex < messages.count && messages[messageIndex].content.isEmpty {
                        messages.remove(at: messageIndex)
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
            isStreaming = false
        }
    }

    // MARK: - Navigation

    /// Reset to camera phase for a new question
    func resetToCamera() {
        Task {
            await pageQuestionService.clearSession()
        }
        phase = .camera
        messages = []
        streamingText = ""
        isStreaming = false
        capturedImage = nil
        errorMessage = nil
        hasActiveSession = false
    }
}
