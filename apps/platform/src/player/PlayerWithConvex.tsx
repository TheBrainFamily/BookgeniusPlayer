/**
 * PlayerWithConvex - Convex-aware player wrapper for platform
 *
 * This wrapper provides the appropriate Convex context based on the auth provider:
 * - Clerk: Uses ConvexProviderWithClerk for authenticated Convex operations
 * - Snapplify/Default: Uses bare ConvexProvider (anonymous/read-only)
 */
import React from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useIntegrations } from "@platform/integrations";
import { LiveModeAppCore } from "../../../player/src/LiveModeApp";
import { getBookFromUrl } from "../../../player/src/getBookFromUrl";

// Import player styles
import "../../../player/src/styles/imports.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
const authProvider = import.meta.env.VITE_AUTH_PROVIDER as string | undefined;

if (!convexUrl) {
  console.error("[PlayerWithConvex] VITE_CONVEX_URL is not set");
}

const convex = new ConvexReactClient(convexUrl || "");

/**
 * Inner component that renders with Clerk-authenticated Convex context.
 * Must be rendered inside ClerkProvider tree.
 * Gets useAuth from platform's integrations context (dynamically loaded) to avoid
 * static import issues with Clerk hooks outside ClerkProvider.
 */
const PlayerWithClerkAuth: React.FC<{ bookPath: string }> = ({ bookPath }) => {
  const { authMod } = useIntegrations();
  const clerkUseAuth = authMod?.clerkUseAuth?.();

  // Wait for Clerk's useAuth to be available
  if (!clerkUseAuth) {
    return null;
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={clerkUseAuth}>
      <LiveModeAppCore bookPath={bookPath} />
    </ConvexProviderWithClerk>
  );
};

/**
 * Inner component that renders with anonymous Convex context.
 * Used for Snapplify (read-only) or default auth providers.
 */
const PlayerWithAnonymousConvex: React.FC<{ bookPath: string }> = ({ bookPath }) => {
  return (
    <ConvexProvider client={convex}>
      <LiveModeAppCore bookPath={bookPath} />
    </ConvexProvider>
  );
};

/**
 * Main component that selects the appropriate Convex provider based on auth provider.
 */
const PlayerWithConvex: React.FC = () => {
  const book = getBookFromUrl();
  const bookPath = book ? `books/${book}` : "books/1984-English";

  if (!convexUrl) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          backgroundColor: "#1a1a1a",
          color: "#ff6b6b",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "16px" }}>Configuration Error</div>
          <div style={{ fontSize: "14px", color: "#888" }}>
            VITE_CONVEX_URL environment variable is not set
          </div>
        </div>
      </div>
    );
  }

  // Use authenticated Convex for Clerk, anonymous for others (Snapplify = read-only)
  if (authProvider === "clerk") {
    return <PlayerWithClerkAuth bookPath={bookPath} />;
  }

  return <PlayerWithAnonymousConvex bookPath={bookPath} />;
};

export default PlayerWithConvex;
