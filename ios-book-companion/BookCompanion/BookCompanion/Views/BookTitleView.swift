//
//  BookTitleView.swift
//  BookCompanion
//
//  Input screen for book title before starting a scanning session.
//

import SwiftUI

struct BookTitleView: View {

    @State private var bookTitle: String = ""
    @State private var isLoading: Bool = false
    @State private var errorMessage: String?

    let uploadService: UploadService
    let onSessionStarted: (String, String) -> Void  // (sessionId, bookSlug)

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                // Icon
                Image(systemName: "book.closed")
                    .font(.system(size: 60))
                    .foregroundStyle(.blue)

                // Title
                Text("Start New Book")
                    .font(.title)
                    .fontWeight(.bold)

                // Instructions
                Text("Enter the book title to start scanning.\nThis helps organize your scanned pages.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)

                // Text field
                TextField("Book Title", text: $bookTitle)
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, 40)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .onSubmit {
                        startSession()
                    }

                // Error message
                if let error = errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                // Start button
//                Button(action: startSession) {
//                    if isLoading {
//                        ProgressView()
//                            .progressViewStyle(.circular)
//                            .tint(.white)
//                    } else {
//                        Text("Start Scanning")
//                            .fontWeight(.semibold)
//                    }
//                }
//                .buttonStyle(.plain)
//                .frame(maxWidth: .infinity)
//                .frame(height: 50)
//                .background(bookTitle.isEmpty ? Color.gray : Color.blue)
//                .foregroundStyle(.white)
//                .clipShape(RoundedRectangle(cornerRadius: 12))
//                .contentShape(Rectangle())
//                .padding(.horizontal, 40)
//                .disabled(bookTitle.isEmpty || isLoading)

                Spacer()
                Spacer()
            }
            .navigationTitle("New Book")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func startSession() {
        guard !bookTitle.isEmpty else { return }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                let response = try await uploadService.startSession(bookTitle: bookTitle)
                await MainActor.run {
                    isLoading = false
                    onSessionStarted(response.sessionId, response.bookSlug)
                }
            } catch {
                await MainActor.run {
                    isLoading = false
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

#Preview {
    BookTitleView(uploadService: UploadService()) { sessionId, bookSlug in
        print("Session started: \(sessionId) - \(bookSlug)")
    }
}
