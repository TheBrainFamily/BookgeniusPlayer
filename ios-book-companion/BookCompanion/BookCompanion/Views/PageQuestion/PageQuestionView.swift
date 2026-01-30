//
//  PageQuestionView.swift
//  BookCompanion
//
//  Main view for the page question feature - camera capture followed by chat.
//

import SwiftUI

/// Main view for the page question feature
struct PageQuestionView: View {
    let bookSlug: String?
    let chapterNumber: Int

    @StateObject private var viewModel = PageQuestionViewModel()

    var body: some View {
        NavigationStack {
            Group {
                switch viewModel.phase {
                case .camera:
                    CameraQuestionView(viewModel: viewModel)
                case .chat:
                    ChatQuestionView(viewModel: viewModel)
                }
            }
            .navigationTitle("Ask About Page")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if viewModel.phase == .chat {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("New Photo") {
                            viewModel.resetToCamera()
                        }
                        .disabled(viewModel.isStreaming)
                    }
                }
            }
        }
        .onAppear {
            viewModel.bookSlug = bookSlug
            viewModel.chapterNumber = chapterNumber
        }
        .onChange(of: bookSlug) { _, newValue in
            viewModel.bookSlug = newValue
        }
        .onChange(of: chapterNumber) { _, newValue in
            viewModel.chapterNumber = newValue
        }
    }
}

// MARK: - Camera Phase

/// Camera view for capturing a book page
struct CameraQuestionView: View {
    @ObservedObject var viewModel: PageQuestionViewModel
    @State private var showImagePicker = false
    @State private var showCamera = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Icon
            Image(systemName: "camera.viewfinder")
                .font(.system(size: 80))
                .foregroundStyle(.blue)

            // Instructions
            VStack(spacing: 8) {
                Text("Take a Photo of the Page")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("Point at any text you want help with")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Context info
            if let bookSlug = viewModel.bookSlug {
                VStack(spacing: 4) {
                    Text(bookSlug)
                        .font(.headline)
                    Text("Chapter \(viewModel.chapterNumber)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding()
                .background(Color.blue.opacity(0.1))
                .cornerRadius(12)
            }

            Spacer()

            // Capture button
            VStack(spacing: 12) {
                Button {
                    showCamera = true
                } label: {
                    Label("Take Photo", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }

                Button {
                    showImagePicker = true
                } label: {
                    Text("Choose from Library")
                        .foregroundStyle(.blue)
                }
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 40)
        }
        .sheet(isPresented: $showCamera) {
            ImagePicker(sourceType: .camera) { image in
                Task {
                    await viewModel.captureAndAsk(image: image)
                }
            }
        }
        .sheet(isPresented: $showImagePicker) {
            ImagePicker(sourceType: .photoLibrary) { image in
                Task {
                    await viewModel.captureAndAsk(image: image)
                }
            }
        }
    }
}

// MARK: - Chat Phase

/// Chat view showing the conversation
struct ChatQuestionView: View {
    @ObservedObject var viewModel: PageQuestionViewModel
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Chat messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        // Show the captured image at the top
                        if let image = viewModel.capturedImage {
                            Image(uiImage: image)
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(maxHeight: 200)
                                .cornerRadius(12)
                                .padding(.horizontal)
                                .padding(.top, 8)
                        }

                        // Messages
                        ForEach(viewModel.messages) { message in
                            ChatBubbleView(message: message)
                                .id(message.id)
                        }

                        // Streaming indicator
                        if viewModel.isStreaming && viewModel.streamingText.isEmpty {
                            HStack {
                                ProgressView()
                                    .scaleEffect(0.8)
                                Text("Thinking...")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.bottom, 8)
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    if let lastMessage = viewModel.messages.last {
                        withAnimation {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }

            // Error message
            if let error = viewModel.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
                    .padding(.vertical, 4)
            }

            Divider()

            // Input area
            HStack(spacing: 12) {
                TextField("Ask a follow-up question...", text: $viewModel.inputText, axis: .vertical)
                    .textFieldStyle(.plain)
                    .padding(10)
                    .background(Color(.systemGray6))
                    .cornerRadius(20)
                    .focused($isInputFocused)
                    .lineLimit(1...4)
                    .disabled(viewModel.isStreaming)

                Button {
                    Task {
                        await viewModel.sendFollowUp()
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title)
                        .foregroundStyle(canSend ? .blue : .gray)
                }
                .disabled(!canSend)
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private var canSend: Bool {
        !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !viewModel.isStreaming
    }
}

// MARK: - Chat Bubble

/// A single message bubble in the chat
struct ChatBubbleView: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.role == .user {
                Spacer(minLength: 60)
            }

            Text(message.content)
                .padding(12)
                .background(backgroundColor)
                .foregroundColor(textColor)
                .cornerRadius(16)

            if message.role == .assistant {
                Spacer(minLength: 60)
            }
        }
        .padding(.horizontal)
    }

    private var backgroundColor: Color {
        switch message.role {
        case .user:
            return .blue
        case .assistant:
            return Color(.systemGray5)
        }
    }

    private var textColor: Color {
        switch message.role {
        case .user:
            return .white
        case .assistant:
            return .primary
        }
    }
}

// MARK: - Image Picker

/// UIImagePickerController wrapper for SwiftUI
struct ImagePicker: UIViewControllerRepresentable {
    let sourceType: UIImagePickerController.SourceType
    let onImagePicked: (UIImage) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = sourceType
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ImagePicker

        init(_ parent: ImagePicker) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.onImagePicked(image)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

#Preview {
    PageQuestionView(bookSlug: "pride-and-prejudice", chapterNumber: 5)
}
