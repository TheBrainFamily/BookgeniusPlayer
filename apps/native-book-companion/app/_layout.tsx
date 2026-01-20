import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { ScanSessionProvider } from "@/contexts/scan-session-context";

const DEFAULT_CONVEX_URL = "https://limitless-manatee-952.convex.cloud";
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? DEFAULT_CONVEX_URL;
const convex = new ConvexReactClient(convexUrl);

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <SafeAreaProvider>
        <ConvexProvider client={convex}>
          <ScanSessionProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
            </Stack>
            <StatusBar style="auto" />
          </ScanSessionProvider>
        </ConvexProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
