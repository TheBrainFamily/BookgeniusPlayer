//
//  CompanionView.swift
//  BookCompanion
//
//  Character companion view with chapter/page selectors and avatar grid.
//  Supports both portrait (vertical) and landscape (horizontal) layouts.
//

import SwiftUI

struct CompanionView: View {

    let bookSlug: String?
    @Binding var selectedChapterNumber: Int

    @StateObject private var viewModel: CompanionViewModel
    @State private var selectedCharacter: CharacterProfile?

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    /// Returns true when in landscape orientation (compact height or regular width with compact height)
    private var isLandscape: Bool {
        verticalSizeClass == .compact
    }

    init(bookSlug: String?, selectedChapterNumber: Binding<Int>) {
        self.bookSlug = bookSlug
        self._selectedChapterNumber = selectedChapterNumber
        _viewModel = StateObject(wrappedValue: CompanionViewModel(bookSlug: bookSlug))
    }

    var body: some View {
        Group {
            if isLandscape {
                horizontalLayout
            } else {
                verticalLayout
            }
        }
        .task {
            await viewModel.loadIfNeeded()
        }
        .onChange(of: bookSlug) { newValue in
            viewModel.updateBookSlug(newValue)
        }
        .onChange(of: viewModel.selectedChapterNumber) { _, newValue in
            selectedChapterNumber = newValue
        }
    }

    // MARK: - Vertical Layout (Portrait)

    private var verticalLayout: some View {
        NavigationStack {
            Group {
                if viewModel.isMissingBook {
                    EmptyCompanionState()
                } else {
                    ScrollView {
                        VStack(spacing: 16) {
                            selectionHeader

                            if viewModel.isLoading {
                                ProgressView("Loading book data...")
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 16)
                            }

                            if let errorMessage = viewModel.errorMessage {
                                Text(errorMessage)
                                    .foregroundStyle(.red)
                                    .font(.footnote)
                                    .padding(.horizontal, 16)
                            }

                            LazyVGrid(columns: gridColumns, spacing: 16) {
                                ForEach(viewModel.filteredCharacters) { character in
                                    Button {
                                        selectedCharacter = character
                                    } label: {
                                        AvatarCard(character: character)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.bottom, 24)
                        }
                        .padding(.top, 12)
                    }
                }
            }
            .navigationTitle("Companion")
            .searchable(
                text: $viewModel.searchQuery,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search characters"
            )
            .sheet(item: $selectedCharacter) { character in
                CharacterSummarySheet(
                    character: character,
                    chapter: viewModel.selectedChapter,
                    page: viewModel.selectedPage,
                    isInChapter: viewModel.isCharacter(character, in: viewModel.selectedChapter.number),
                    firstAppearanceChapter: viewModel.firstAppearanceChapter(for: character)
                )
            }
        }
    }

    // MARK: - Horizontal Layout (Landscape)

    private var horizontalLayout: some View {
        Group {
            if viewModel.isMissingBook {
                EmptyCompanionState()
            } else {
                VStack(spacing: 0) {
                    // Top bar: Chapter, Page, Search - all in one line
                    landscapeTopBar
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color(.systemBackground))

                    Divider()

                    // Full-width character grid, scrollable vertically
                    ScrollView(.vertical, showsIndicators: true) {
                        LazyVGrid(columns: landscapeGridColumns, spacing: 12) {
                            ForEach(viewModel.filteredCharacters) { character in
                                Button {
                                    selectedCharacter = character
                                } label: {
                                    LandscapeAvatarCard(character: character)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                    }
                }
            }
        }
        .sheet(item: $selectedCharacter) { character in
            CharacterSummarySheet(
                character: character,
                chapter: viewModel.selectedChapter,
                page: viewModel.selectedPage,
                isInChapter: viewModel.isCharacter(character, in: viewModel.selectedChapter.number),
                firstAppearanceChapter: viewModel.firstAppearanceChapter(for: character)
            )
        }
    }

    // MARK: - Landscape Top Bar (Chapter, Page, Search in one line)

    private var landscapeTopBar: some View {
        HStack(spacing: 12) {
            // Chapter picker
            Menu {
                ForEach(viewModel.chapters.map { $0.number }, id: \.self) { number in
                    Button("Chapter \(number)") {
                        viewModel.chapterBinding.wrappedValue = number
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text("Ch. \(viewModel.selectedChapterNumber)")
                        .fontWeight(.semibold)
                    Image(systemName: "chevron.down")
                        .font(.caption)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            // Page picker
            Menu {
                ForEach(viewModel.pages, id: \.self) { page in
                    Button("Page \(page)") {
                        viewModel.pageBinding.wrappedValue = page
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text("Pg. \(viewModel.selectedPage)")
                        .fontWeight(.semibold)
                    Image(systemName: "chevron.down")
                        .font(.caption)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)

            // Search field - takes remaining space
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search characters", text: $viewModel.searchQuery)
                    .textFieldStyle(.plain)
                if !viewModel.searchQuery.isEmpty {
                    Button {
                        viewModel.searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 8))

            // Character count
            Text("\(viewModel.filteredCharacters.count)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var landscapeGridColumns: [GridItem] {
        // More columns in landscape for full-width grid
        [
            GridItem(.adaptive(minimum: 100, maximum: 140), spacing: 12)
        ]
    }

    // MARK: - Portrait Grid Columns

    private var gridColumns: [GridItem] {
        [
            GridItem(.flexible(), spacing: 16),
            GridItem(.flexible(), spacing: 16),
            GridItem(.flexible(), spacing: 16)
        ]
    }

    // MARK: - Portrait Selection Header

    private var selectionHeader: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                SelectionPicker(
                    title: "Chapter",
                    selection: viewModel.chapterBinding,
                    options: viewModel.chapters.map { $0.number }
                ) { number in
                    Text("Chapter \(number)")
                }

                SelectionPicker(
                    title: "Page",
                    selection: viewModel.pageBinding,
                    options: viewModel.pages
                ) { number in
                    Text("\(number)")
                }
            }
            .padding(.horizontal, 16)

            HStack {
                Text(viewModel.selectedChapter.title)
                    .font(.headline)
                Spacer()
                Text("Page \(viewModel.selectedPage)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
        }
    }
}

private struct SelectionPicker<Option: Hashable, LabelView: View>: View {

    let title: String
    let selection: Binding<Option>
    let options: [Option]
    let label: (Option) -> LabelView

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)

            Picker(title, selection: selection) {
                ForEach(options, id: \.self) { option in
                    label(option)
                        .tag(option)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 120)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .clipped()
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .contentShape(Rectangle())
    }
}

private struct AvatarCard: View {

    let character: CharacterProfile

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(character.gradient)
                    .frame(height: 86)

                if let avatarUrl = character.avatarUrl, let url = URL(string: avatarUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        Image(systemName: character.symbolName)
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    .frame(width: 86, height: 86)
                    .clipShape(Circle())
                } else {
                    Image(systemName: character.symbolName)
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                }
            }

            Text(character.name)
                .font(.footnote)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .frame(maxWidth: .infinity)
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }
}

// MARK: - Landscape Avatar Card (compact for landscape grid)

private struct LandscapeAvatarCard: View {

    let character: CharacterProfile

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(character.gradient)
                    .frame(width: 56, height: 56)

                if let avatarUrl = character.avatarUrl, let url = URL(string: avatarUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        Image(systemName: character.symbolName)
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                    }
                    .frame(width: 56, height: 56)
                    .clipShape(Circle())
                } else {
                    Image(systemName: character.symbolName)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                }
            }

            Text(character.name)
                .font(.caption2)
                .fontWeight(.medium)
                .multilineTextAlignment(.center)
                .foregroundStyle(.primary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct CharacterSummarySheet: View {

    let character: CharacterProfile
    let chapter: Chapter
    let page: Int
    let isInChapter: Bool
    let firstAppearanceChapter: Int? // From HTML parsing, used for legacy fallback

    @Environment(\.dismiss) private var dismiss
    @State private var showingFullAvatar = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Avatar and name - centered layout with larger avatar
                    VStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(character.gradient)
                                .frame(width: 120, height: 120)

                            if let avatarUrl = character.avatarUrl, let url = URL(string: avatarUrl) {
                                CachedAsyncImage(url: url) { image in
                                    image
                                        .resizable()
                                        .scaledToFill()
                                } placeholder: {
                                    Image(systemName: character.symbolName)
                                        .font(.system(size: 48, weight: .semibold))
                                        .foregroundStyle(.white.opacity(0.95))
                                }
                                .frame(width: 120, height: 120)
                                .clipShape(Circle())
                            } else {
                                Image(systemName: character.symbolName)
                                    .font(.system(size: 48, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.95))
                            }
                        }
                        .onTapGesture {
                            if character.avatarUrl != nil {
                                showingFullAvatar = true
                            }
                        }

                        VStack(spacing: 4) {
                            Text(character.name)
                                .font(.title2)
                                .fontWeight(.bold)
                            Text("Chapter \(chapter.number) · Page \(page)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)

                    // Get first appearance info
                    let firstChapter = character.chapterSummaries
                        .filter { $0.value.isFirstAppearance }
                        .map { $0.key }
                        .min()
                    let isFirstAppearanceNow = firstChapter == chapter.number

                    // First appearance badge (shown below name when applicable)
                    if isFirstAppearanceNow {
                        HStack(spacing: 6) {
                            Image(systemName: "star.fill")
                                .foregroundStyle(.yellow)
                                .font(.caption)
                            Text("First Appearance")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if !isInChapter {
                        Text("Not detected in this chapter yet.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }

                    // Always show global bio
                    Text(character.globalSummary)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .padding(.top, 4)

                    // Show previous chapters section (only if not first appearance and has history)
                    let previousChapters = character.chapterSummaries
                        .filter { $0.key < chapter.number }
                        .sorted { $0.key < $1.key }

                    if !previousChapters.isEmpty {
                        Divider()
                            .padding(.vertical, 8)

                        Text("In previous chapters")
                            .font(.headline)

                        ForEach(previousChapters, id: \.key) { chapterNum, info in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Chapter \(chapterNum)")
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(.secondary)

                                Text(info.summary)
                                    .font(.body)
                                    .foregroundStyle(.primary)
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
                .padding(20)
            }
            .navigationTitle("Character")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .fullScreenCover(isPresented: $showingFullAvatar) {
            FullAvatarView(character: character)
        }
    }
}

private struct FullAvatarView: View {
    let character: CharacterProfile
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                if let avatarUrl = character.avatarUrl, let url = URL(string: avatarUrl) {
                    CachedAsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                    } placeholder: {
                        ProgressView()
                            .tint(.white)
                    }
                    .frame(maxWidth: 320, maxHeight: 320)
                }

                Text(character.name)
                    .font(.title)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)

                Spacer()
            }
            .padding(40)
        }
        .onTapGesture {
            dismiss()
        }
    }
}

private struct EmptyCompanionState: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "book.closed")
                .font(.system(size: 52))
                .foregroundStyle(.secondary)
            Text("No book loaded")
                .font(.title3)
                .fontWeight(.semibold)
            Text("Start a scan session to load characters and chapters here.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    CompanionView(bookSlug: "sample-book", selectedChapterNumber: .constant(1))
}
