//
//  ContentView.swift
//  BookCompanion
//
//  Main app content - tab-based navigation between Scanner and Companion.
//

import SwiftUI

struct ContentView: View {

    @State private var selectedTab = 0
    @State private var hasActiveSession = false
    @State private var currentBookTitle: String?

    // Shared upload service for the app
    private let uploadService = UploadService()

    var body: some View {
        TabView(selection: $selectedTab) {
            // Scanner tab - shows book title input or scanner based on session state
            Group {
                if hasActiveSession {
                    ScannerView(uploadService: uploadService)
                } else {
                    BookTitleView(uploadService: uploadService) { sessionId, bookSlug in
                        currentBookTitle = bookSlug
                        hasActiveSession = true
                    }
                }
            }
            .tabItem {
                Label("Scan", systemImage: "camera.viewfinder")
            }
            .tag(0)

            // Companion tab
            CompanionView(bookSlug: currentBookTitle)
                .tabItem {
                    Label("Companion", systemImage: "book.fill")
                }
                .tag(1)

            // Settings tab
            SettingsPlaceholder(
                hasActiveSession: hasActiveSession,
                currentBookTitle: currentBookTitle,
                onSelectBook: { bookSlug in
                    currentBookTitle = bookSlug
                },
                onEndSession: {
                    Task {
                        // Finish the session on the server
                        try? await uploadService.finishSession()
                        uploadService.clearSession()
                    }
                    hasActiveSession = false
                    currentBookTitle = nil
                }
            )
            .tabItem {
                Label("Settings", systemImage: "gear")
            }
            .tag(2)
        }
    }
}

/// Placeholder for settings
struct SettingsPlaceholder: View {

    let hasActiveSession: Bool
    let currentBookTitle: String?
    let onSelectBook: (String) -> Void
    let onEndSession: () -> Void

    @State private var bookSlugInput: String = ""

    var body: some View {
        NavigationStack {
            List {
                // Current session info
                if hasActiveSession, let bookTitle = currentBookTitle {
                    Section("Current Session") {
                        HStack {
                            Text("Book")
                            Spacer()
                            Text(bookTitle)
                                .foregroundStyle(.secondary)
                        }

                        Button("Finish & Process Book", role: .destructive) {
                            onEndSession()
                        }
                    }
                }

                // Book selection - manual entry
                Section {
                    if let current = currentBookTitle {
                        HStack {
                            Text("Current")
                            Spacer()
                            Text(current)
                                .foregroundStyle(.blue)
                                .fontWeight(.medium)
                        }
                    }

                    HStack {
                        TextField("Book slug", text: $bookSlugInput)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        Button("Go") {
                            let trimmed = bookSlugInput.trimmingCharacters(in: .whitespacesAndNewlines)
                            if !trimmed.isEmpty {
                                onSelectBook(trimmed)
                                bookSlugInput = ""
                            }
                        }
                        .disabled(bookSlugInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                } header: {
                    Text("Book")
                } footer: {
                    Text("Enter a book slug to view in Companion and use for scanning.")
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
