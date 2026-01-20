import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";

import { useScanSession } from "@/contexts/scan-session-context";
import { useCameraCaptureControl } from "@/hooks/use-camera-capture-control";
import { uploadScannedPage } from "@/lib/pipeline";

export default function ScanScreen() {
  const {
    isCheckingSession,
    resumeState,
    hasActiveSession,
    startNewSession,
    resumeSession,
    clearSessionAndPersistence,
  } = useScanSession();

  if (isCheckingSession) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.centeredText}>Checking for active session...</Text>
      </View>
    );
  }

  if (resumeState && !hasActiveSession) {
    return (
      <ResumePrompt
        bookTitle={resumeState.bookTitle}
        lastPageIndex={resumeState.lastPageIndex}
        processedChapters={resumeState.processedChapters}
        onResume={resumeSession}
        onStartNew={clearSessionAndPersistence}
      />
    );
  }

  if (!hasActiveSession) {
    return <BookTitleScreen onStart={startNewSession} />;
  }

  return <ScannerView />;
}

function BookTitleScreen({ onStart }: { onStart: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      await onStart(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Start New Book</Text>
      <Text style={styles.subtitle}>
        Enter the book title to start scanning. This helps organize your scanned pages.
      </Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Book title"
        autoCapitalize="words"
        style={styles.input}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          (!title.trim() || isLoading) && styles.primaryButtonDisabled,
          pressed && !isLoading && title.trim() ? styles.primaryButtonPressed : null,
        ]}
        onPress={submit}
        disabled={!title.trim() || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Start Scanning</Text>
        )}
      </Pressable>
    </View>
  );
}

function ResumePrompt({
  bookTitle,
  lastPageIndex,
  processedChapters,
  onResume,
  onStartNew,
}: {
  bookTitle: string;
  lastPageIndex: number;
  processedChapters: number[];
  onResume: () => void;
  onStartNew: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Continue Scanning</Text>
      <Text style={styles.subtitle}>{bookTitle}</Text>
      <Text style={styles.resumeInfo}>Start from page {lastPageIndex + 1}</Text>
      {processedChapters.length > 0 ? (
        <Text style={styles.resumeSecondary}>
          {processedChapters.length} chapter(s) already processed
        </Text>
      ) : null}
      <View style={styles.row}>
        <Pressable style={styles.secondaryButton} onPress={onStartNew}>
          <Text style={styles.secondaryButtonText}>New Book</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={onResume}>
          <Text style={styles.primaryButtonText}>Resume</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ScannerView() {
  const {
    sessionId,
    currentBookSlug,
    currentBookTitle,
    startingPageIndex,
  } = useScanSession();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadingPageIndex, setUploadingPageIndex] = useState<number | null>(null);
  const [lastCaptureUri, setLastCaptureUri] = useState<string | null>(null);
  const [nextPageIndex, setNextPageIndex] = useState(startingPageIndex);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNextPageIndex(startingPageIndex);
  }, [startingPageIndex]);

  useEffect(() => {
    if (lastCaptureUri) {
      const timeout = setTimeout(() => setLastCaptureUri(null), 600);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [lastCaptureUri]);

  const canCapture = Boolean(
    sessionId && currentBookSlug && permission?.granted && isCameraReady && isFocused,
  );

  const handleCapture = async () => {
    if (!cameraRef.current || !canCapture || isCapturing) return;
    setIsCapturing(true);
    setError(null);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) {
        setError("No image captured.");
        return;
      }

      const pageIndex = nextPageIndex;
      setNextPageIndex((value) => value + 1);
      setCaptureCount((value) => value + 1);
      setLastCaptureUri(photo.uri);

      if (!sessionId || !currentBookSlug) {
        setError("Missing session information. Start a new session.");
        return;
      }

      setUploadingPageIndex(pageIndex);
      await uploadScannedPage({
        sessionId,
        bookSlug: currentBookSlug,
        pageIndex,
        imageUri: photo.uri,
      });
      setUploadedCount((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture page.");
    } finally {
      setUploadingPageIndex(null);
      setIsCapturing(false);
    }
  };

  useCameraCaptureControl({
    cameraRef,
    enabled: canCapture && !isCapturing,
    onCapture: handleCapture,
  });

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Camera access is required to scan pages.</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      {isFocused ? (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          onCameraReady={() => setIsCameraReady(true)}
        />
      ) : (
        <View style={styles.cameraPlaceholder} />
      )}

      <View style={styles.overlayTop}>
        <View style={styles.statusPill}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: canCapture && !isCapturing ? "#34d399" : "#fbbf24" },
            ]}
          />
          <Text style={styles.statusText}>
            {isCapturing ? "Capturing..." : "Ready"}
          </Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{captureCount} captured</Text>
          {uploadingPageIndex ? (
            <Text style={styles.statusText}> · ↑{uploadingPageIndex}</Text>
          ) : uploadedCount > 0 ? (
            <Text style={styles.statusText}> · {uploadedCount} sent</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.overlayBottom}>
        <Text style={styles.overlayTitle}>{currentBookTitle ?? "Scanning"}</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable
          style={({ pressed }) => [
            styles.captureButton,
            !canCapture && styles.captureButtonDisabled,
            pressed && canCapture ? styles.captureButtonPressed : null,
          ]}
          onPress={handleCapture}
          disabled={!canCapture || isCapturing}
        >
          <View style={styles.captureInner} />
        </Pressable>
      </View>

      {lastCaptureUri ? (
        <Image source={{ uri: lastCaptureUri }} style={styles.capturePreview} />
      ) : null}
    </View>
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
  centeredText: {
    marginTop: 8,
    color: "#6b7280",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 140,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 120,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  resumeInfo: {
    fontSize: 16,
    color: "#2563eb",
    marginTop: 8,
  },
  resumeSecondary: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  camera: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: "#000000",
  },
  overlayTop: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: "#f8fafc",
    fontSize: 12,
  },
  overlayBottom: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: "center",
    gap: 12,
  },
  overlayTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
  captureButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  captureInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffffff",
  },
  capturePreview: {
    position: "absolute",
    right: 20,
    top: 120,
    width: 80,
    height: 120,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#22c55e",
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
    textAlign: "center",
  },
});
