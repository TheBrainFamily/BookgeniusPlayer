import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { useScanSession } from "@/contexts/scan-session-context";
import { PIPELINE_URL } from "@/lib/pipeline";

export default function SettingsScreen() {
  const {
    hasActiveSession,
    currentBookTitle,
    processedChapters,
    companionBookSlug,
    clearSessionAndPersistence,
    setCompanionBookSlug,
  } = useScanSession();

  const [bookSlugInput, setBookSlugInput] = useState("");

  const handleSetSlug = async () => {
    const trimmed = bookSlugInput.trim();
    if (!trimmed) return;
    await setCompanionBookSlug(trimmed);
    setBookSlugInput("");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {hasActiveSession && currentBookTitle ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Current Session</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Book</Text>
            <Text style={styles.value}>{currentBookTitle}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Chapters processed</Text>
            <Text style={styles.value}>{processedChapters.length}</Text>
          </View>
          <Text style={styles.helperText}>Chapters are processed automatically as you scan.</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Companion Book</Text>
        {companionBookSlug ? (
          <View style={styles.row}>
            <Text style={styles.label}>Current</Text>
            <Text style={styles.value}>{companionBookSlug}</Text>
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            value={bookSlugInput}
            onChangeText={setBookSlugInput}
            placeholder="Book slug"
            autoCapitalize="none"
            style={styles.input}
          />
          <Pressable style={styles.primaryButton} onPress={handleSetSlug}>
            <Text style={styles.primaryButtonText}>Go</Text>
          </Pressable>
        </View>
        <Text style={styles.helperText}>Enter a book slug to view in Companion and Ask.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Scanning</Text>
        <Text style={styles.helperText}>Auto-capture and focus indicators are disabled.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Session</Text>
        <Pressable style={styles.secondaryButton} onPress={clearSessionAndPersistence}>
          <Text style={styles.secondaryButtonText}>Start a Different Book</Text>
        </Pressable>
        <Text style={styles.helperText}>
          This clears the current session and lets you scan a new book.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pipeline</Text>
        <Text style={styles.value}>{PIPELINE_URL}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: {
    color: "#6b7280",
  },
  value: {
    color: "#111827",
    fontWeight: "600",
  },
  helperText: {
    color: "#9ca3af",
    fontSize: 12,
    lineHeight: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontWeight: "600",
    color: "#111827",
  },
});
