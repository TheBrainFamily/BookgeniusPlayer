import React from "react";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useIntegrations } from "@platform/integrations";
import { convex } from "../convexClient";

const ConvexWithClerk: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authMod } = useIntegrations();
  const clerkUseAuth = authMod?.clerkUseAuth?.();

  if (!clerkUseAuth) {
    // Clerk hook not yet available — fall back to anonymous provider
    // so public queries (like listAvailableBookSlugs) still work immediately
    return <ConvexProvider client={convex!}>{children}</ConvexProvider>;
  }

  return (
    <ConvexProviderWithClerk client={convex!} useAuth={clerkUseAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
};

export const ConvexAppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!convex) {
    // VITE_CONVEX_URL not set — render children without Convex
    return <>{children}</>;
  }

  const authProvider = import.meta.env.VITE_AUTH_PROVIDER as string | undefined;

  if (authProvider === "clerk") {
    return <ConvexWithClerk>{children}</ConvexWithClerk>;
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
};
