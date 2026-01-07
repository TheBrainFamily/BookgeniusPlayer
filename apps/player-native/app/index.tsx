import { useRef, useCallback, useState, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBook } from "@player-native/contexts/BookContext";
import { useNativeShell } from "@player-native/contexts/NativeShellContext";
import { BackgroundLayer } from "@player-native/components/BackgroundLayer";
import { BookWebView, type BookWebViewRef } from "@player-native/components/BookWebView";
import { BottomInput } from "@player-native/components/BottomInput";
import { SearchModal } from "@player-native/components/SearchModal";
import { NativeMusicPlayer } from "@player-native/components/NativeMusicPlayer";

export default function PlayerScreen() {
  const { isLoading, isReady, error, book } = useBook();
  const { isWebPlayerReady } = useNativeShell();
  const webViewRef = useRef<BookWebViewRef>(null);
  const insets = useSafeAreaInsets();

  const [webModalOpen, setWebModalOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleNavigate = useCallback((chapter: number, paragraph: number) => {
    webViewRef.current?.scrollToParagraph(chapter, paragraph);
  }, []);

  const handleWebModalChange = useCallback((isOpen: boolean) => {
    setWebModalOpen(isOpen);
  }, []);

  const handleBlurWebView = useCallback(() => {
    webViewRef.current?.blurWebView();
  }, []);

  if (error) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (isLoading || !isReady) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Loading {book?.title || "book"}...</Text>
      </View>
    );
  }

  const showNativeOverlay = !isWebPlayerReady;

  return (
    <View style={styles.container}>
      <BackgroundLayer />

      <View style={styles.fullScreen} pointerEvents="box-none">
        <BookWebView
          ref={webViewRef}
          bookSlug="Othello"
          onModalChange={handleWebModalChange}
          bottomPadding={insets.bottom + 70}
        />
      </View>

      {showNativeOverlay && (
        <View style={[styles.loadingOverlay, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Initializing...</Text>
        </View>
      )}

      {webModalOpen && <View style={styles.modalBackdrop} />}

      {!webModalOpen && !keyboardVisible && (
        <View
          style={[
            styles.bottomInputContainer,
            { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 },
          ]}
        >
          <BottomInput onFocus={handleBlurWebView} />
        </View>
      )}

      <SearchModal onNavigate={handleNavigate} />

      <NativeMusicPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000" },
  centerContainer: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  fullScreen: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 5,
  },
  bottomInputContainer: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20 },
  errorText: { color: "#ef4444", fontSize: 18 },
  loadingText: { color: "#ffffff", marginTop: 16 },
});
