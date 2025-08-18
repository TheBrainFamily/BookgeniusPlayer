import React, { useEffect, useState, createContext, useContext } from "react";

const ClerkReadyContext = createContext(false);
export const useClerkReady = () => useContext(ClerkReadyContext);

const ClerkProviderSafeClient: React.FC<{ publishableKey: string; children: React.ReactNode }> = ({ publishableKey, children }) => {
  const [ClerkProvider, setClerkProvider] = useState<React.ComponentType<{ publishableKey: string; children: React.ReactNode }> | null>(null);

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

  return (
    <ClerkReadyContext.Provider value={true}>
      <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
    </ClerkReadyContext.Provider>
  );
};

const ClerkProviderSafeServer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // On the server: render children without Clerk (no window access)
  return <ClerkReadyContext.Provider value={false}>{children}</ClerkReadyContext.Provider>;
};

export const ClerkProviderSafe: React.FC<{ publishableKey: string; children: React.ReactNode }> = ({ publishableKey, children }) => {
  return import.meta.env.SSR ? (
    <ClerkProviderSafeServer>{children}</ClerkProviderSafeServer>
  ) : (
    <ClerkProviderSafeClient publishableKey={publishableKey}>{children}</ClerkProviderSafeClient>
  );
};
