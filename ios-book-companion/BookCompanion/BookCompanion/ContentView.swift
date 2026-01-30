//
//  ContentView.swift
//  BookCompanion
//
//  Main app content - tab-based navigation between Scanner and Companion.
//

import SwiftUI

/// State for resuming a session
struct ResumeState {
    let bookSlug: String
    let bookTitle: String
    let lastPageIndex: Int
    let processedChapters: [Int]
}

/// Convert book title to URL-safe slug
func slugify(_ title: String) -> String {
    title
        .lowercased()
        .folding(options: .diacriticInsensitive, locale: .current) // é → e
        .components(separatedBy: CharacterSet.alphanumerics.inverted)
        .filter { !$0.isEmpty }
        .joined(separator: "-")
}

struct ContentView: View {

    @State private var selectedTab = 0
    @State private var hasActiveSession = false
    @State private var startingPageIndex: Int = 1
    @State private var resumeState: ResumeState?
    @State private var isCheckingSession = true
    @State private var selectedChapterNumber: Int = 1

    // Persisted book info - survives app restarts, shared across all tabs
    @AppStorage("lastSelectedBookSlug") private var lastSelectedBookSlug: String = ""
    @AppStorage("lastSelectedBookTitle") private var lastSelectedBookTitle: String = ""

    // Computed property for convenience - nil when empty
    private var currentBookSlug: String? {
        lastSelectedBookSlug.isEmpty ? nil : lastSelectedBookSlug
    }

    private var currentBookTitle: String? {
        lastSelectedBookTitle.isEmpty ? nil : lastSelectedBookTitle
    }

    // Shared upload service for the app
    private let uploadService = UploadService()

    var body: some View {
        TabView(selection: $selectedTab) {
            // Scanner tab - shows resume prompt, quick start, book title input, or scanner
            Group {
                if isCheckingSession {
                    // Loading state while checking for persisted session
                    ProgressView("Checking for active session...")
                } else if let resume = resumeState, !hasActiveSession {
                    // Show resume prompt for existing scanning session
                    ResumeSessionView(
                        resumeState: resume,
                        onResume: {
                            // Resume scanning from where we left off
                            startingPageIndex = resume.lastPageIndex + 1
                            lastSelectedBookSlug = resume.bookSlug
                            lastSelectedBookTitle = resume.bookTitle
                            hasActiveSession = true
                            resumeState = nil
                        },
                        onNewBook: {
                            // Start fresh with a new book
                            Task {
                                await uploadService.clearSessionAndPersistence()
                            }
                            lastSelectedBookSlug = ""
                            lastSelectedBookTitle = ""
                            resumeState = nil
                        }
                    )
                } else if hasActiveSession {
                    ScannerView(uploadService: uploadService, startingPageIndex: startingPageIndex)
                } else {
                    // Show BookTitleView - pre-filled if we have a selected book
                    BookTitleView(
                        uploadService: uploadService,
                        initialTitle: currentBookTitle ?? ""
                    ) { sessionId, bookSlug, bookTitle in
                        lastSelectedBookSlug = bookSlug
                        lastSelectedBookTitle = bookTitle
                        startingPageIndex = 1
                        hasActiveSession = true
                    }
                }
            }
            .tabItem {
                Label("Scan", systemImage: "camera.viewfinder")
            }
            .tag(0)

            // Companion tab
            CompanionView(bookSlug: currentBookSlug, selectedChapterNumber: $selectedChapterNumber)
                .tabItem {
                    Label("Companion", systemImage: "book.fill")
                }
                .tag(1)

            // Settings tab
            SettingsPlaceholder(
                hasActiveSession: hasActiveSession,
                currentBookTitle: currentBookTitle,
                processedChapters: resumeState?.processedChapters ?? [],
                onSelectBook: { title, slug in
                    lastSelectedBookTitle = title
                    lastSelectedBookSlug = slug
                    // Check if there's an existing session for this book
                    Task {
                        await checkForExistingSession(bookSlug: slug, bookTitle: title)
                    }
                },
                onStartNewBook: {
                    Task {
                        await uploadService.clearSessionAndPersistence()
                    }
                    hasActiveSession = false
                    lastSelectedBookSlug = ""
                    lastSelectedBookTitle = ""
                    resumeState = nil
                    startingPageIndex = 1
                }
            )
            .tabItem {
                Label("Settings", systemImage: "gear")
            }
            .tag(2)

            // Ask tab - AI-powered page question/answer
            PageQuestionView(
                bookSlug: currentBookSlug,
                chapterNumber: selectedChapterNumber
            )
            .tabItem {
                Label("Ask", systemImage: "questionmark.bubble")
            }
            .tag(3)
        }
        .task {
            await checkForPersistedSession()
        }
    }

    /// Check if there's a persisted session and load its state from the server
    private func checkForPersistedSession() async {
        defer { isCheckingSession = false }

        // First, restore last selected book from AppStorage (already done via @AppStorage)
        // This ensures Companion tab works even without an active scanning session

        // Check if we have a persisted scanning session
        guard let bookSlug = await uploadService.persistedBookSlug else {
            print("[ContentView] No persisted scanning session found")
            // lastSelectedBookSlug from @AppStorage is already set if it exists
            return
        }

        print("[ContentView] Found persisted scanning session for: \(bookSlug)")

        // Try to get the session state from the server
        do {
            let sessionInfo = try await uploadService.getBookSession(bookSlug: bookSlug)

            // If the session is completed, clear scanning session but keep book selected
            if sessionInfo.status == "completed" {
                print("[ContentView] Session is completed, keeping book selected")
                lastSelectedBookSlug = sessionInfo.bookSlug
                await uploadService.clearSessionAndPersistence()
                return
            }

            // Set current book so Companion and Ask tabs work
            lastSelectedBookSlug = sessionInfo.bookSlug

            // Show resume prompt for scanning
            resumeState = ResumeState(
                bookSlug: sessionInfo.bookSlug,
                bookTitle: sessionInfo.bookTitle,
                lastPageIndex: sessionInfo.lastPageIndex,
                processedChapters: sessionInfo.processedChapters
            )

            print("[ContentView] Ready to resume scanning from page \(sessionInfo.lastPageIndex + 1)")
        } catch {
            print("[ContentView] Failed to get session from server: \(error)")
            // Clear the scanning session since it's invalid, but keep book selected
            await uploadService.clearSessionAndPersistence()
        }
    }

    /// Check if there's an existing session for a specific book (called when selecting a book in Settings)
    private func checkForExistingSession(bookSlug: String, bookTitle: String) async {
        print("[ContentView] Checking for existing session for: \(bookSlug)")

        do {
            let sessionInfo = try await uploadService.getBookSession(bookSlug: bookSlug)

            // If the session is completed, no need to resume - just view in Companion
            if sessionInfo.status == "completed" {
                print("[ContentView] Session is completed, ready to view in Companion")
                return
            }

            // Found an active session - update title from server and show resume prompt
            await MainActor.run {
                lastSelectedBookTitle = sessionInfo.bookTitle
                resumeState = ResumeState(
                    bookSlug: sessionInfo.bookSlug,
                    bookTitle: sessionInfo.bookTitle,
                    lastPageIndex: sessionInfo.lastPageIndex,
                    processedChapters: sessionInfo.processedChapters
                )
            }

            print("[ContentView] Found existing session, can resume from page \(sessionInfo.lastPageIndex + 1)")
        } catch {
            print("[ContentView] No existing session found for \(bookSlug): \(error)")
            // No session exists - that's fine, user can start a new one from Scan tab
            await MainActor.run {
                resumeState = nil
            }
        }
    }
}

/// View shown when resuming a previous session
struct ResumeSessionView: View {
    let resumeState: ResumeState
    let onResume: () -> Void
    let onNewBook: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "book.pages")
                .font(.system(size: 60))
                .foregroundStyle(.blue)

            VStack(spacing: 8) {
                Text("Continue Scanning")
                    .font(.title)
                    .fontWeight(.bold)

                Text(resumeState.bookTitle)
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 4) {
                Text("Start from page \(resumeState.lastPageIndex + 1)")
                    .font(.headline)
                    .foregroundStyle(.blue)

                if !resumeState.processedChapters.isEmpty {
                    Text("\(resumeState.processedChapters.count) chapter(s) already processed")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .background(Color.blue.opacity(0.1))
            .cornerRadius(12)

            Spacer()

            VStack(spacing: 12) {
                Button(action: onResume) {
                    Label("Continue Scanning", systemImage: "camera.viewfinder")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }

                Button(action: onNewBook) {
                    Text("Start a Different Book")
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
    }
}

/// Placeholder for settings
struct SettingsPlaceholder: View {

    let hasActiveSession: Bool
    let currentBookTitle: String?
    let processedChapters: [Int]
    let onSelectBook: (String, String) -> Void  // (title, slug)
    let onStartNewBook: () -> Void

    @State private var bookTitleInput: String = ""

    var body: some View {
        NavigationStack {
            List {
                // Current book (shown even without active scanning session)
                if let bookTitle = currentBookTitle {
                    Section("Current Book") {
                        HStack {
                            Text("Book")
                            Spacer()
                            Text(bookTitle)
                                .foregroundStyle(.blue)
                                .fontWeight(.medium)
                        }

                        if hasActiveSession {
                            if !processedChapters.isEmpty {
                                HStack {
                                    Text("Chapters processed")
                                    Spacer()
                                    Text("\(processedChapters.count)")
                                        .foregroundStyle(.secondary)
                                }
                            }

                            // Note: No "Finish" button - processing happens automatically
                            Text("Chapters are processed automatically as you scan.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Start new book option (only shown if there's an active session)
                if hasActiveSession {
                    Section {
                        Button("Start a Different Book") {
                            onStartNewBook()
                        }
                    } footer: {
                        Text("This will clear the current session and let you scan a new book.")
                    }
                }

                // Book selection - manual entry (for Companion)
                Section {
                    HStack {
                        TextField("Book title", text: $bookTitleInput)
                            .autocorrectionDisabled()

                        Button("Go") {
                            let trimmed = bookTitleInput.trimmingCharacters(in: .whitespacesAndNewlines)
                            if !trimmed.isEmpty {
                                let slug = slugify(trimmed)
                                onSelectBook(trimmed, slug)
                                bookTitleInput = ""
                            }
                        }
                        .disabled(bookTitleInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                } header: {
                    Text("Change Book")
                } footer: {
                    Text("Enter a book title to view in Companion and Ask tabs.")
                }

                Section("Scanning") {
                    Toggle("Auto-capture", isOn: .constant(true))
                    Toggle("Haptic feedback", isOn: .constant(true))
                }

                Section("About") {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

#Preview {
    ContentView()
}
