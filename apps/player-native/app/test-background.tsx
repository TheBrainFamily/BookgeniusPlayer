import { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEventListener } from "expo";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

const VIDEOS = [
  "https://odyssey-cdn.lgandecki.net/bookgenius/js799fmgkxxgdemt47ph2121qx7y53m1/openai-medium-11-0.mp4",
  "https://odyssey-cdn.lgandecki.net/bookgenius/js77xh82tc00mrwgx0n8cgajbx7y5d08/openai-medium-12-0.mp4",
  "https://odyssey-cdn.lgandecki.net/bookgenius/js70y2x78mcszjva6t4q4qwdv57y5zpg/openai-medium-10-0.mp4",
];

function Video({ uri, onReady }: { uri: string; onReady: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEventListener(player, "statusChange", ({ status }) => {
    console.log("[Video]", uri.slice(-20), "status:", status);
    if (status === "readyToPlay") {
      onReady();
    }
  });

  return (
    <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
  );
}

export default function TestBackground() {
  const [index, setIndex] = useState(0);
  const [showA, setShowA] = useState(true);
  const [uriA, setUriA] = useState(VIDEOS[0]);
  const [uriB, setUriB] = useState<string | null>(null);

  const opacityA = useSharedValue(1);
  const opacityB = useSharedValue(0);

  const animA = useAnimatedStyle(() => ({ opacity: opacityA.value }));
  const animB = useAnimatedStyle(() => ({ opacity: opacityB.value }));

  const pendingRef = useRef<"a" | "b" | null>(null);

  const crossfade = (to: "a" | "b") => {
    console.log("[Test] crossfade to", to);
    if (to === "a") {
      opacityA.value = withTiming(1, { duration: 1500 });
      opacityB.value = withTiming(0, { duration: 1500 });
    } else {
      opacityB.value = withTiming(1, { duration: 1500 });
      opacityA.value = withTiming(0, { duration: 1500 });
    }
    setShowA(to === "a");
  };

  const nextVideo = () => {
    const nextIndex = (index + 1) % VIDEOS.length;
    const nextUri = VIDEOS[nextIndex];
    console.log("[Test] loading next:", nextUri.slice(-20), "into", showA ? "B" : "A");

    setIndex(nextIndex);

    if (showA) {
      setUriB(nextUri);
      pendingRef.current = "b";
    } else {
      setUriA(nextUri);
      pendingRef.current = "a";
    }
  };

  const onReadyA = () => {
    console.log("[Test] onReadyA, pending:", pendingRef.current);
    if (pendingRef.current === "a") {
      pendingRef.current = null;
      crossfade("a");
    }
  };

  const onReadyB = () => {
    console.log("[Test] onReadyB, pending:", pendingRef.current);
    if (pendingRef.current === "b") {
      pendingRef.current = null;
      crossfade("b");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      nextVideo();
    }, 4000);
    return () => clearInterval(timer);
  }, [index, showA]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.layer, animA]}>
        <Video key={uriA} uri={uriA} onReady={onReadyA} />
      </Animated.View>

      {uriB && (
        <Animated.View style={[styles.layer, animB]}>
          <Video key={uriB} uri={uriB} onReady={onReadyB} />
        </Animated.View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.text}>Index: {index}</Text>
        <Text style={styles.text}>Showing: {showA ? "A" : "B"}</Text>
        <TouchableOpacity style={styles.button} onPress={nextVideo}>
          <Text style={styles.buttonText}>Next Video</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  layer: { ...StyleSheet.absoluteFillObject },
  video: { width: "100%", height: "100%" },
  overlay: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 20,
    borderRadius: 10,
  },
  text: { color: "#fff", fontSize: 16, marginBottom: 8 },
  button: {
    backgroundColor: "#3b82f6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});
