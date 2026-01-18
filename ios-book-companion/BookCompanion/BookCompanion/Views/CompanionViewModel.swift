//
//  CompanionViewModel.swift
//  BookCompanion
//
//  Loads book metadata and chapter HTML from Convex for the Companion view.
//

import Foundation
import SwiftUI

@MainActor
final class CompanionViewModel: ObservableObject {

    @Published var searchQuery: String = ""
    @Published var selectedChapterNumber: Int = 1
    @Published var selectedPage: Int = 1
    @Published private(set) var characters: [CharacterProfile] = []
    @Published private(set) var chapters: [Chapter] = []
    @Published private(set) var pages: [Int] = []
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var errorMessage: String?

    private let convexClient = ConvexPublicClient()
    private var bookSlug: String?
    private var charactersByChapter: [Int: Set<String>] = [:]
    private var hasLoaded = false

    var isMissingBook: Bool {
        bookSlug == nil
    }

    init(bookSlug: String?) {
        self.bookSlug = bookSlug
    }

    func updateBookSlug(_ slug: String?) {
        if slug != bookSlug {
            bookSlug = slug
            hasLoaded = false
            Task { [weak self] in
                await self?.loadIfNeeded()
            }
        }
    }

    func loadIfNeeded() async {
        guard !isMissingBook else { return }
        guard !hasLoaded else { return }
        await load()
    }

    func isCharacter(_ character: CharacterProfile, in chapterNumber: Int) -> Bool {
        charactersByChapter[chapterNumber]?.contains(character.slug) == true
    }

    /// Returns the first chapter number where this character appears (from HTML parsing)
    /// Used as fallback for legacy books without per-chapter summaries
    func firstAppearanceChapter(for character: CharacterProfile) -> Int? {
        charactersByChapter
            .filter { $0.value.contains(character.slug) }
            .map { $0.key }
            .min()
    }

    var selectedChapter: Chapter {
        chapters.first(where: { $0.number == selectedChapterNumber }) ?? Chapter(number: 1, title: "Chapter 1", startPage: 1, endPage: 1)
    }

    var filteredCharacters: [CharacterProfile] {
        let trimmed = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let base: [CharacterProfile]
        if trimmed.isEmpty {
            base = charactersForSelectedChapter()
        } else {
            base = characters
        }
        return base.filter { $0.matches(trimmed) }
    }

    var chapterBinding: Binding<Int> {
        Binding(get: {
            self.selectedChapterNumber
        }, set: { newValue in
            self.setChapter(newValue)
        })
    }

    var pageBinding: Binding<Int> {
        Binding(get: {
            self.selectedPage
        }, set: { newValue in
            self.setPage(newValue)
        })
    }

    private func load() async {
        guard let bookSlug else { return }

        isLoading = true
        errorMessage = nil

        let bookPath = "books/\(bookSlug)"

        do {
            async let bundlesTask: [CharacterBundle] = convexClient.query(
                path: "bookQueries:listCharacterBundles",
                args: ["bookPath": bookPath]
            )
            async let chaptersTask: [HtmlSourceChapter]? = convexClient.query(
                path: "bookQueries:listHtmlSourceChapters",
                args: ["bookPath": bookPath]
            )
            async let summariesTask: [CharacterChapterSummary] = convexClient.query(
                path: "metadata:listAllChapterSummariesForBook",
                args: ["bookPath": bookPath]
            )

            let (bundles, chaptersSourceOptional, allSummaries) = try await (bundlesTask, chaptersTask, summariesTask)
            let chaptersSource = chaptersSourceOptional ?? []

            // Build a map of character slug -> chapter number -> summary info
            // Filter out chapter 0 (front matter/prologue)
            var summariesByCharacter: [String: [Int: ChapterSummaryInfo]] = [:]
            for summary in allSummaries where summary.chapterNumber > 0 {
                if summariesByCharacter[summary.characterSlug] == nil {
                    summariesByCharacter[summary.characterSlug] = [:]
                }
                summariesByCharacter[summary.characterSlug]?[summary.chapterNumber] = ChapterSummaryInfo(
                    summary: summary.summary,
                    isFirstAppearance: summary.isFirstAppearance
                )
            }

            let profiles = bundles.map { bundle in
                CharacterProfile(
                    slug: bundle.slug,
                    name: bundle.name,
                    globalSummary: bundle.metadata.summary ?? "Summary coming soon.",
                    avatarUrl: bundle.avatarLarge?.url ?? bundle.avatar?.url,
                    chapterSummaries: summariesByCharacter[bundle.slug] ?? [:]
                )
            }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

            // Filter out chapter 0 (front matter/prologue) - start from chapter 1
            let allChapters = ChapterBuilder.buildChapters(from: chaptersSource)
            let computedChapters = allChapters.filter { $0.number > 0 }
            let pages = ChapterBuilder.buildPages(from: computedChapters)

            // Filter chapter appearances to exclude chapter 0
            let allAppearances = try await loadChapterAppearances(from: chaptersSource)
            let chapterAppearances = allAppearances.filter { $0.key > 0 }

            self.characters = profiles
            self.chapters = computedChapters
            self.pages = pages
            self.charactersByChapter = chapterAppearances

            if let first = computedChapters.first {
                selectedChapterNumber = first.number
                selectedPage = first.startPage
            } else {
                selectedChapterNumber = 1
                selectedPage = 1
            }

            hasLoaded = true
        } catch {
            errorMessage = "Failed to load book data. \(error.localizedDescription)"
        }

        isLoading = false
    }

    private func loadChapterAppearances(from chapters: [HtmlSourceChapter]) async throws -> [Int: Set<String>] {
        var results: [Int: Set<String>] = [:]

        try await withThrowingTaskGroup(of: (Int, Set<String>).self) { group in
            for chapter in chapters {
                guard let url = URL(string: chapter.url) else { continue }
                group.addTask {
                    let (data, _) = try await URLSession.shared.data(from: url)
                    let html = String(data: data, encoding: .utf8) ?? ""
                    let slugs = CharacterSlugParser.parse(from: html)
                    return (chapter.chapterNumber, slugs)
                }
            }

            for try await (chapterNumber, slugs) in group {
                results[chapterNumber] = slugs
            }
        }

        return results
    }

    private func charactersForSelectedChapter() -> [CharacterProfile] {
        guard let slugs = charactersByChapter[selectedChapterNumber], !slugs.isEmpty else {
            return characters
        }
        return characters.filter { slugs.contains($0.slug) }
    }

    private func setChapter(_ number: Int) {
        guard let chapter = chapters.first(where: { $0.number == number }) else { return }
        selectedChapterNumber = number
        selectedPage = chapter.startPage
    }

    private func setPage(_ page: Int) {
        selectedPage = page
        if let chapter = chapters.first(where: { $0.contains(page: page) }),
           chapter.number != selectedChapterNumber {
            selectedChapterNumber = chapter.number
        }
    }
}

struct Chapter: Identifiable {
    let id = UUID()
    let number: Int
    let title: String
    let startPage: Int
    let endPage: Int

    func contains(page: Int) -> Bool {
        page >= startPage && page <= endPage
    }
}

struct ChapterSummaryInfo {
    let summary: String
    let isFirstAppearance: Bool
}

struct CharacterProfile: Identifiable {
    let id = UUID()
    let slug: String
    let name: String
    let globalSummary: String
    let avatarUrl: String?
    let chapterSummaries: [Int: ChapterSummaryInfo]

    let symbolName: String
    let gradient: LinearGradient

    init(
        slug: String,
        name: String,
        globalSummary: String,
        avatarUrl: String?,
        chapterSummaries: [Int: ChapterSummaryInfo] = [:]
    ) {
        self.slug = slug
        self.name = name
        self.globalSummary = globalSummary
        self.avatarUrl = avatarUrl
        self.chapterSummaries = chapterSummaries
        self.symbolName = CharacterProfile.symbols.randomElement() ?? "person.fill"
        self.gradient = CharacterProfile.palette.randomElement() ?? LinearGradient(
            colors: [.blue, .purple],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// Returns the summary for a specific chapter, or nil if the character doesn't appear in that chapter
    func summary(forChapter chapterNumber: Int) -> String? {
        chapterSummaries[chapterNumber]?.summary
    }

    /// Returns whether this chapter is the character's first appearance
    func isFirstAppearance(inChapter chapterNumber: Int) -> Bool {
        chapterSummaries[chapterNumber]?.isFirstAppearance ?? false
    }

    func matches(_ query: String) -> Bool {
        let trimmed = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }

        let target = name.lowercased()
        if target.contains(trimmed) {
            return true
        }

        let tokens = trimmed.split(separator: " ").map(String.init)
        return tokens.allSatisfy { fuzzyMatch(token: $0, in: target) }
    }

    private func fuzzyMatch(token: String, in target: String) -> Bool {
        if target.contains(token) { return true }
        var currentIndex = target.startIndex
        for character in token {
            guard let nextIndex = target[currentIndex...].firstIndex(of: character) else {
                return false
            }
            currentIndex = target.index(after: nextIndex)
        }
        return true
    }

    private static let palette: [LinearGradient] = [
        LinearGradient(colors: [.orange, .pink], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.blue, .purple], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.green, .mint], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.teal, .cyan], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.indigo, .blue], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.pink, .red], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.yellow, .orange], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.purple, .mint], startPoint: .topLeading, endPoint: .bottomTrailing),
        LinearGradient(colors: [.gray, .blue], startPoint: .topLeading, endPoint: .bottomTrailing)
    ]

    private static let symbols = [
        "person.fill",
        "person.crop.circle.fill",
        "person.2.fill",
        "person.circle.fill",
        "person.badge.plus",
        "person.crop.square.filled.and.at.rectangle",
        "person.fill.turn.right",
        "person.fill.turn.down",
        "person.fill.turn.left"
    ]
}

enum ChapterBuilder {
    static func buildChapters(from sources: [HtmlSourceChapter]) -> [Chapter] {
        let sorted = sources.sorted { $0.chapterNumber < $1.chapterNumber }
        var chapters: [Chapter] = []
        var pageCursor = 1

        for source in sorted {
            let estimatedPages = estimatePages(paragraphCount: source.paragraphCount)
            let start = pageCursor
            let end = pageCursor + estimatedPages - 1
            pageCursor = end + 1

            chapters.append(
                Chapter(
                    number: source.chapterNumber,
                    title: source.title ?? "Chapter \(source.chapterNumber)",
                    startPage: start,
                    endPage: end
                )
            )
        }

        return chapters
    }

    static func buildPages(from chapters: [Chapter]) -> [Int] {
        guard let maxPage = chapters.map(\.endPage).max() else { return [1] }
        return Array(1...maxPage)
    }

    private static func estimatePages(paragraphCount: Int?) -> Int {
        let paragraphs = max(paragraphCount ?? 1, 1)
        let estimated = Int(ceil(Double(paragraphs) / 10.0))
        return max(estimated, 1)
    }
}

enum CharacterSlugParser {
    static func parse(from html: String) -> Set<String> {
        let speakerPattern = #"data-speaker\s*=\s*"([^"]+)""#
        let characterPattern = #"data-c\s*=\s*"([^"]+)""#

        var slugs = Set<String>()
        slugs.formUnion(matches(in: html, pattern: speakerPattern))
        slugs.formUnion(matches(in: html, pattern: characterPattern))
        return slugs
    }

    private static func matches(in text: String, pattern: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).compactMap { match in
            guard match.numberOfRanges > 1,
                  let slugRange = Range(match.range(at: 1), in: text) else {
                return nil
            }
            return String(text[slugRange])
        }
    }
}
