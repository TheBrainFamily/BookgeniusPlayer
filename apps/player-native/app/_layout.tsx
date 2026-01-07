import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StyleSheet } from "react-native";

import { BookProvider } from "@player-native/contexts/BookContext";
import { LocationProvider } from "@player-native/contexts/LocationContext";
import { NativeShellProvider } from "@player-native/contexts/NativeShellContext";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl);

// Hardcoded book slug for now - will be dynamic later
const BOOK_SLUG = "Lalka";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ConvexProvider client={convex}>
          <BookProvider bookPath={`books/${BOOK_SLUG}`}>
            <LocationProvider>
              <NativeShellProvider>
                <StatusBar style="light" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: "#000000" },
                  }}
                />
              </NativeShellProvider>
            </LocationProvider>
          </BookProvider>
        </ConvexProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
