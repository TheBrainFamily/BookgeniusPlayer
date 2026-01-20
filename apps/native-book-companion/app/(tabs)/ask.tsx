import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useScanSession } from "@/contexts/scan-session-context";
import { followUpPageQuestionStream, startPageQuestionStream } from "@/lib/page-question";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type Phase = "camera" | "chat";

export default function AskScreen() {
  const { currentBookSlug, companionBookSlug, selectedChapterNumber } = useScanSession();
  const bookSlug = currentBookSlug ?? companionBookSlug ?? "unknown";
  const isBookReady = bookSlug !== "unknown";

  const [phase, setPhase] = useState<Phase>("camera");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputText, setInputText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const streamRef = useRef<ReturnType<typeof startPageQuestionStream> | null>(null);

  const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  useEffect(() => {
    return () => {
      streamRef.current?.close();
    };
  }, []);

  const canSend = useMemo(
    () => inputText.trim().length > 0 && !isStreaming,
    [inputText, isStreaming],
  );

  const handleCapture = async (source: "camera" | "library") => {
    setErrorMessage(null);

    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setErrorMessage("Permission is required to access photos.");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            quality: 0.8,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.8,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
          });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const assistantId = createId();
    const messageIndex = 0;
    setCapturedUri(asset.uri);
    setPhase("chat");
    setIsStreaming(true);
    setStreamingText("");
    setMessages([{ id: assistantId, role: "assistant", content: "" }]);
    setSessionId(null);

    streamRef.current?.close();
    streamRef.current = startPageQuestionStream({
      bookSlug,
      chapterNumber: selectedChapterNumber,
      imageUri: asset.uri,
      mimeType: asset.mimeType,
      handlers: {
        onEvent: (event) => {
          if (event.type === "session") {
            setSessionId(event.sessionId);
            return;
          }
          if (event.type === "chunk") {
            setStreamingText((prev) => {
              const next = prev + event.delta;
              setMessages((prevMessages) =>
                prevMessages.map((message, index) =>
                  index === messageIndex
                    ? { ...message, content: next }
                    : message,
                ),
              );
              return next;
            });
            return;
          }
          if (event.type === "done") {
            setMessages((prevMessages) =>
              prevMessages.map((message, index) =>
                index === messageIndex ? { ...message, content: event.fullResponse } : message,
              ),
            );
            setStreamingText("");
            setIsStreaming(false);
            return;
          }
          if (event.type === "error") {
            setErrorMessage(event.message);
            setIsStreaming(false);
          }
        },
        onError: (error) => {
          if (error instanceof Error) {
            setErrorMessage(error.message);
          }
          setIsStreaming(false);
        },
      },
    });
  };

  const sendFollowUp = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !sessionId || isStreaming) return;

    setInputText("");
    setErrorMessage(null);
    setIsStreaming(true);
    setStreamingText("");
    const assistantId = createId();
    const messageIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { id: createId(), role: "user", content: trimmed },
      { id: assistantId, role: "assistant", content: "" },
    ]);

    streamRef.current?.close();
    streamRef.current = followUpPageQuestionStream({
      sessionId,
      message: trimmed,
      handlers: {
        onEvent: (event) => {
          if (event.type === "chunk") {
            setStreamingText((prev) => {
              const next = prev + event.delta;
              setMessages((prevMessages) =>
                prevMessages.map((message, index) =>
                  index === messageIndex
                    ? { ...message, content: next }
                    : message,
                ),
              );
              return next;
            });
            return;
          }
          if (event.type === "done") {
            setMessages((prevMessages) =>
              prevMessages.map((message, index) =>
                index === messageIndex ? { ...message, content: event.fullResponse } : message,
              ),
            );
            setStreamingText("");
            setIsStreaming(false);
            return;
          }
          if (event.type === "error") {
            setErrorMessage(event.message);
            setIsStreaming(false);
          }
        },
        onError: (error) => {
          if (error instanceof Error) {
            setErrorMessage(error.message);
          }
          setIsStreaming(false);
        },
      },
    });
  };

  const reset = () => {
    streamRef.current?.close();
    setPhase("camera");
    setMessages([]);
    setStreamingText("");
    setIsStreaming(false);
    setCapturedUri(null);
    setErrorMessage(null);
    setSessionId(null);
  };

  if (phase === "camera") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Ask About Page</Text>
        <Text style={styles.subtitle}>Take a photo of the page and ask questions about it.</Text>
        <View style={styles.contextCard}>
          <Text style={styles.contextTitle}>{bookSlug}</Text>
          <Text style={styles.contextSubtitle}>Chapter {selectedChapterNumber}</Text>
        </View>
        <Pressable
          style={[styles.primaryButton, !isBookReady && styles.primaryButtonDisabled]}
          disabled={!isBookReady}
          onPress={() => handleCapture("camera")}
        >
          <Text style={styles.primaryButtonText}>Take Photo</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          disabled={!isBookReady}
          onPress={() => handleCapture("library")}
        >
          <Text style={styles.secondaryButtonText}>
            {isBookReady ? "Choose from Library" : "Set book slug in Settings"}
          </Text>
        </Pressable>
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.chatHeader}>
        <Text style={styles.chatTitle}>Ask About Page</Text>
        <Pressable disabled={isStreaming} onPress={reset}>
          <Text style={[styles.linkText, isStreaming && styles.linkTextDisabled]}>New Photo</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.chatContent}>
        {capturedUri ? (
          <Image source={{ uri: capturedUri }} style={styles.capturedImage} />
        ) : null}
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.role === "user" ? styles.messageUser : styles.messageAssistant,
            ]}
          >
            <Text style={message.role === "user" ? styles.messageUserText : styles.messageText}>
              {message.content}
            </Text>
          </View>
        ))}
        {isStreaming && streamingText.length === 0 ? (
          <View style={styles.streamingRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.streamingText}>Thinking...</Text>
          </View>
        ) : null}
      </ScrollView>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask a follow-up question..."
          value={inputText}
          onChangeText={setInputText}
          editable={!isStreaming}
          multiline
        />
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          disabled={!canSend}
          onPress={sendFollowUp}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  contextCard: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    alignItems: "center",
  },
  contextTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  contextSubtitle: {
    color: "#6b7280",
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  secondaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: "#2563eb",
    fontWeight: "600",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
    textAlign: "center",
  },
  chatContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  chatHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  linkText: {
    color: "#2563eb",
    fontWeight: "600",
  },
  linkTextDisabled: {
    color: "#9ca3af",
  },
  chatContent: {
    padding: 20,
    gap: 12,
  },
  capturedImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "82%",
  },
  messageUser: {
    alignSelf: "flex-end",
    backgroundColor: "#2563eb",
  },
  messageAssistant: {
    alignSelf: "flex-start",
    backgroundColor: "#e2e8f0",
  },
  messageText: {
    color: "#111827",
  },
  messageUserText: {
    color: "#ffffff",
  },
  streamingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streamingText: {
    color: "#6b7280",
    fontSize: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
  },
  sendButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  sendButtonDisabled: {
    backgroundColor: "#cbd5f5",
  },
  sendButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
