import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Image, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { useNativeBackground } from "@player-native/contexts/NativeShellContext";

const CROSSFADE_MS = 1500;

function isVideoUrl(url: string): boolean {
  const ext = url.split(".").pop()?.toLowerCase() || "";
  return ["mp4", "webm", "mov", "m4v"].includes(ext);
}

function Video({ uri, onReady }: { uri: string; onReady: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEventListener(player, "statusChange", ({ status }) => {
    console.log("[Video]", uri.slice(-25), "status:", status);
    if (status === "readyToPlay") {
      onReady();
    }
  });

  return (
    <VideoView player={player} style={styles.media} contentFit="cover" nativeControls={false} />
  );
}

export function BackgroundLayer() {
  const background = useNativeBackground();

  const [showA, setShowA] = useState(true);
  const [uriA, setUriA] = useState<string | null>(null);
  const [uriB, setUriB] = useState<string | null>(null);

  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);

  const animA = useAnimatedStyle(() => ({ opacity: opacityA.value }));
  const animB = useAnimatedStyle(() => ({ opacity: opacityB.value }));

  const pendingRef = useRef<"a" | "b" | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const crossfade = (to: "a" | "b") => {
    console.log("[BG] crossfade to", to);
    if (to === "a") {
      opacityA.value = withTiming(1, { duration: CROSSFADE_MS });
      opacityB.value = withTiming(0, { duration: CROSSFADE_MS });
    } else {
      opacityB.value = withTiming(1, { duration: CROSSFADE_MS });
      opacityA.value = withTiming(0, { duration: CROSSFADE_MS });
    }
    setShowA(to === "a");
  };

  const onReadyA = () => {
    console.log("[BG] onReadyA, pending:", pendingRef.current);
    if (pendingRef.current === "a") {
      pendingRef.current = null;
      crossfade("a");
    }
  };

  const onReadyB = () => {
    console.log("[BG] onReadyB, pending:", pendingRef.current);
    if (pendingRef.current === "b") {
      pendingRef.current = null;
      crossfade("b");
    }
  };

  useEffect(() => {
    const url = background?.url;
    if (!url) return;
    if (url === currentUrlRef.current) return;

    currentUrlRef.current = url;
    const isVideo = isVideoUrl(url);

    console.log("[BG] new url:", url.slice(-25), "showA:", showA, "isVideo:", isVideo);

    if (showA) {
      setUriB(url);
      pendingRef.current = "b";
      if (!isVideo) {
        setTimeout(() => {
          if (pendingRef.current === "b") {
            pendingRef.current = null;
            crossfade("b");
          }
        }, 50);
      }
    } else {
      setUriA(url);
      pendingRef.current = "a";
      if (!isVideo) {
        setTimeout(() => {
          if (pendingRef.current === "a") {
            pendingRef.current = null;
            crossfade("a");
          }
        }, 50);
      }
    }
  }, [background?.url]);

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.layer, animA]}>
        {uriA ? (
          isVideoUrl(uriA) ? (
            <Video key={uriA} uri={uriA} onReady={onReadyA} />
          ) : (
            <Image key={uriA} source={{ uri: uriA }} style={styles.media} resizeMode="cover" />
          )
        ) : (
          <View style={[styles.media, styles.black]} />
        )}
      </Animated.View>

      <Animated.View style={[styles.layer, animB]}>
        {uriB ? (
          isVideoUrl(uriB) ? (
            <Video key={uriB} uri={uriB} onReady={onReadyB} />
          ) : (
            <Image key={uriB} source={{ uri: uriB }} style={styles.media} resizeMode="cover" />
          )
        ) : (
          <View style={[styles.media, styles.black]} />
        )}
      </Animated.View>

      <View style={styles.debug}>
        <Text style={styles.debugText}>A: {uriA?.slice(-20) ?? "none"}</Text>
        <Text style={styles.debugText}>B: {uriB?.slice(-20) ?? "none"}</Text>
        <Text style={styles.debugText}>Show: {showA ? "A" : "B"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000" },
  layer: { ...StyleSheet.absoluteFillObject },
  media: { width: "100%", height: "100%" },
  black: { backgroundColor: "#000" },
  debug: {
    position: "absolute",
    top: 100,
    left: 10,
    backgroundColor: "rgba(255,0,0,0.8)",
    padding: 10,
    borderRadius: 5,
    zIndex: 9999,
  },
  debugText: { color: "#fff", fontSize: 12 },
});
