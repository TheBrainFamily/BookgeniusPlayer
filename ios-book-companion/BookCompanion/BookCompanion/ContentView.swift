//
//  ContentView.swift
//  BookCompanion
//
//  Main app content - tab-based navigation between Scanner and Companion.
//

import SwiftUI

struct ContentView: View {

    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Scanner tab
            ScannerView()
                .tabItem {
                    Label("Scan", systemImage: "camera.viewfinder")
                }
                .tag(0)

            // Companion tab (placeholder for now)
            CompanionPlaceholder()
                .tabItem {
                    Label("Companion", systemImage: "book.fill")
                }
                .tag(1)

            // Settings tab
            SettingsPlaceholder()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(2)
        }
    }
}

/// Placeholder for the reading companion view
struct CompanionPlaceholder: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "books.vertical")
                    .font(.system(size: 60))
                    .foregroundStyle(.secondary)

                Text("Reading Companion")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("Scan some pages first, then come here\nto explore characters and get help.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .navigationTitle("Companion")
        }
    }
}

/// Placeholder for settings
struct SettingsPlaceholder: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Scanning") {
                    Toggle("Auto-capture", isOn: .constant(true))
                    Toggle("Haptic feedback", isOn: .constant(true))
                }

                Section("Enhancement") {
                    Picker("Mode", selection: .constant(0)) {
                        Text("Document Enhancer").tag(0)
                        Text("Binarized").tag(1)
                        Text("Light").tag(2)
                    }
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
