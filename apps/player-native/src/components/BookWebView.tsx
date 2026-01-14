import { useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { View, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { useLocation } from "@player-native/contexts/LocationContext";
import { useNativeShell } from "@player-native/contexts/NativeShellContext";
import type { Location } from "@player-native/types/location";

interface WebViewMessage {
  type: string;
  location?: Location;
  payload?: unknown;
}

interface BackgroundPayload {
  url: string;
  chapterStart: number;
  paragraphStart: number;
  chapterEnd: number;
  paragraphEnd: number;
}

interface MusicPayload {
  url: string | null;
  isPlaying: boolean;
  volume: number;
  chapterStart: number;
  paragraphStart: number;
  chapterEnd: number;
  paragraphEnd: number;
}

interface CharacterPayload {
  characters: Array<{
    slug: string;
    name: string;
    avatarUrl: string;
    isSpeaking: boolean;
    isListening: boolean;
  }>;
  currentChapter: number;
  currentParagraph: number;
}

export interface BookWebViewRef {
  scrollToParagraph: (chapter: number, paragraph: number) => void;
  blurWebView: () => void;
}

export interface BookWebViewProps {
  bookSlug: string;
  onModalChange?: (isOpen: boolean) => void;
  bottomPadding?: number;
}

const WEB_PLAYER_BASE_URL = __DEV__ ? "http://localhost:5173" : "https://player.bookgenius.io";

export const BookWebView = forwardRef<BookWebViewRef, BookWebViewProps>(function BookWebView(
  { bookSlug, onModalChange, bottomPadding = 80 },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  const { setLocation } = useLocation();
  const { setBackground, setMusic, setCharacterState, setWebPlayerReady } = useNativeShell();

  const webPlayerUrl = `${WEB_PLAYER_BASE_URL}/?book=${encodeURIComponent(bookSlug)}&nativeShell=true`;
  console.log("[BookWebView] Loading URL:", webPlayerUrl);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data: WebViewMessage = JSON.parse(event.nativeEvent.data);

        switch (data.type) {
          case "READY":
            console.log("[BookWebView] Web player ready");
            setWebPlayerReady(true);
            break;

          case "LOCATION_UPDATE":
            if (data.location) {
              setLocation(data.location);
            }
            break;

          case "BACKGROUND_UPDATE":
            if (data.payload) {
              const payload = data.payload as BackgroundPayload;
              console.log("[BookWebView] Background:", payload.url);
              setBackground(payload);
            }
            break;

          case "MUSIC_UPDATE":
            if (data.payload) {
              const payload = data.payload as MusicPayload;
              console.log("[BookWebView] Music:", payload.url, "playing:", payload.isPlaying);
              setMusic(payload);
            }
            break;

          case "CHARACTER_STATE_UPDATE":
            if (data.payload) {
              const payload = data.payload as CharacterPayload;
              setCharacterState(payload);
            }
            break;

          case "MODAL_OPEN":
            onModalChange?.(true);
            break;

          case "MODAL_CLOSE":
            onModalChange?.(false);
            break;

          case "JS_ERROR":
            console.warn("[BookWebView] JS Error:", data);
            break;
        }
      } catch (error) {
        console.warn("[BookWebView] Failed to parse message:", error);
      }
    },
    [setLocation, setBackground, setMusic, setCharacterState, setWebPlayerReady, onModalChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToParagraph: (chapter: number, paragraph: number) => {
        if (!webViewRef.current) return;

        const script = `
          if (window.scrollToParagraph) {
            window.scrollToParagraph(${chapter}, ${paragraph});
          }
          true;
        `;
        webViewRef.current.injectJavaScript(script);
      },
      blurWebView: () => {
        if (!webViewRef.current) return;
        webViewRef.current.injectJavaScript(`
          if (document.activeElement) {
            document.activeElement.blur();
          }
          true;
        `);
      },
    }),
    [],
  );

  const hasLoggedLoad = useRef(false);

  const handleLoadEnd = useCallback(() => {
    if (!hasLoggedLoad.current) {
      console.log("[BookWebView] WebView loaded:", webPlayerUrl);
      hasLoggedLoad.current = true;
    }

    if (webViewRef.current && bottomPadding > 0) {
      const paddingScript = `
        document.body.style.paddingBottom = '${bottomPadding}px';
        true;
      `;
      webViewRef.current.injectJavaScript(paddingScript);
    }
  }, [webPlayerUrl, bottomPadding]);

  const handleError = useCallback((syntheticEvent: { nativeEvent: { description: string } }) => {
    console.error("[BookWebView] WebView error:", syntheticEvent.nativeEvent.description);
  }, []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: webPlayerUrl }}
        style={styles.webview}
        originWhitelist={["*"]}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        containerStyle={styles.transparentContainer}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsBackForwardNavigationGestures={false}
        scalesPageToFit={false}
        cacheEnabled
        mixedContentMode="compatibility"
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView={true}
        injectedJavaScriptBeforeContentLoaded={`
          window.onerror = function(message, source, lineno, colno, error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'JS_ERROR',
              message: message,
              source: source,
              lineno: lineno
            }));
            return false;
          };
          true;
        `}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: "transparent" },
  transparentContainer: { backgroundColor: "transparent" },
});
