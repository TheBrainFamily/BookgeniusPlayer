//
//  ConvexPublicClient.swift
//  BookCompanion
//
//  Minimal Convex query client for publicly available queries.
//

import Foundation

actor ConvexPublicClient {

    private let convexUrl: String
    private let session: URLSession

    init(convexUrl: String = "https://limitless-manatee-952.convex.cloud") {
        self.convexUrl = convexUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)
    }

    func query<T: Decodable>(path: String, args: [String: Any]) async throws -> T {
        let url = URL(string: "\(convexUrl)/api/query")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "path": path,
            "args": args
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ConvexPublicClientError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw ConvexPublicClientError.httpError(statusCode: httpResponse.statusCode, body: message)
        }

        let decoder = JSONDecoder()
        let wrapper = try decoder.decode(ConvexQueryResponse<T>.self, from: data)
        if let errorMessage = wrapper.errorMessage {
            throw ConvexPublicClientError.convexError(message: errorMessage)
        }
        guard let value = wrapper.value else {
            throw ConvexPublicClientError.emptyResponse
        }

        return value
    }
}

private struct ConvexQueryResponse<T: Decodable>: Decodable {
    let status: String?
    let value: T?
    let errorMessage: String?
}

enum ConvexPublicClientError: LocalizedError {
    case invalidResponse
    case httpError(statusCode: Int, body: String)
    case convexError(message: String)
    case emptyResponse

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from Convex."
        case .httpError(let statusCode, let body):
            return "Convex HTTP \(statusCode): \(body)"
        case .convexError(let message):
            return "Convex error: \(message)"
        case .emptyResponse:
            return "Convex returned no data."
        }
    }
}

struct CharacterBundle: Decodable {
    let path: String
    let slug: String
    let name: String
    let metadata: CharacterMetadata
    let avatar: AssetInfo?
    let avatarLarge: AssetInfo?
}

struct CharacterMetadata: Decodable {
    let displayName: String?
    let summary: String?
    let aiPrompt: String?
    let avatarGenerationState: String?
    let avatarProposalUrls: [String]?
}

struct AssetInfo: Decodable {
    let url: String
    let versionId: String?
    let contentType: String?
}

struct HtmlSourceChapter: Decodable {
    let basename: String
    let url: String
    let versionId: String
    let chapterNumber: Int
    let title: String?
    let paragraphCount: Int?
    let sourceFormat: String?
}

struct CharacterChapterSummary: Decodable {
    let bookPath: String
    let characterSlug: String
    let chapterNumber: Int
    let summary: String
    let isFirstAppearance: Bool
}
