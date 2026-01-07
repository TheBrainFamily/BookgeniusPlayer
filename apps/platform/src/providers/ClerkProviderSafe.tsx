import React, { useEffect, useState, createContext, useContext } from "react";
import type { ClerkProviderProps } from "@clerk/react-router";

const ClerkReadyContext = createContext(false);
// eslint-disable-next-line react-refresh/only-export-components
export const useClerkReady = () => useContext(ClerkReadyContext);

const ClerkProviderSafeClient: React.FC<{ publishableKey: string; children: React.ReactNode }> = ({
  publishableKey,
  children,
}) => {
  const [ClerkProvider, setClerkProvider] =
    useState<React.ComponentType<ClerkProviderProps> | null>(null);

  useEffect(() => {
    let mounted = true;
    import("@clerk/react-router")
      .then((m) => mounted && setClerkProvider(() => m.ClerkProvider))
      .catch((e) => {
        console.error("Failed to load ClerkProvider", e);
        setClerkProvider(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!ClerkProvider) {
    // Provider not ready yet; render app without Clerk (we'll gate Clerk UI elsewhere)
    return <ClerkReadyContext.Provider value={false}>{children}</ClerkReadyContext.Provider>;
  }
  console.log("DWER#4sdffs isSatellite:", import.meta.env.VITE_CLERK_IS_SATELLITE);
  console.log("domain:", import.meta.env.VITE_CLERK_DOMAIN);
  console.log("signInUrl:", import.meta.env.VITE_CLERK_SIGN_IN_URL);
  console.log("signUpUrl:", import.meta.env.VITE_CLERK_SIGN_UP_URL);

  return (
    <ClerkReadyContext.Provider value={true}>
      <ClerkProvider
        publishableKey={publishableKey}
        domain={import.meta.env.VITE_CLERK_DOMAIN}
        signInUrl={import.meta.env.VITE_CLERK_SIGN_IN_URL}
        signUpUrl={import.meta.env.VITE_CLERK_SIGN_UP_URL}
        isSatellite={import.meta.env.VITE_CLERK_IS_SATELLITE}
        allowedRedirectOrigins={
          !import.meta.env.VITE_CLERK_IS_SATELLITE ? ["https://bookgeniusz.pl"] : undefined
        }
      >
        {children}
      </ClerkProvider>
    </ClerkReadyContext.Provider>
  );
};

const ClerkProviderSafeServer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // On the server: render children without Clerk (no window access)
  return <ClerkReadyContext.Provider value={false}>{children}</ClerkReadyContext.Provider>;
};

export const ClerkProviderSafe: React.FC<{ publishableKey: string; children: React.ReactNode }> = ({
  publishableKey,
  children,
}) => {
  return import.meta.env.SSR ? (
    <ClerkProviderSafeServer>{children}</ClerkProviderSafeServer>
  ) : (
    <ClerkProviderSafeClient publishableKey={publishableKey}>{children}</ClerkProviderSafeClient>
  );
};
