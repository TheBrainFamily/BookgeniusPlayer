import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { LoadedClerk, UseUserReturn } from "@clerk/types";
import type { AuthCtx, AuthModule } from "./types";

const Ctx = createContext<AuthCtx>({ ready: false, isSignedIn: false, openSignIn: () => {} });

const WidgetCtx = createContext<React.ComponentType | undefined>(undefined);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ClerkProvider, setClerkProvider] = useState<React.ComponentType<{ publishableKey: string; children: React.ReactNode }> | null>(null);
  const [hooks, setHooks] = useState<{ useUser: () => UseUserReturn; useClerk: () => LoadedClerk; UserButton?: React.ComponentType } | null>(null);
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let mounted = true;
    Promise.all([import("@clerk/react-router"), import("@clerk/clerk-react")])
      .then(([router, react]) => {
        if (!mounted) {
          console.log("[CLERK] ClerkProvider not mounted");
          return;
        }
        console.log("[CLERK] ClerkProvider loaded, setting hooks");
        setClerkProvider(() => router.ClerkProvider);
        setHooks({ useUser: react.useUser, useClerk: react.useClerk, UserButton: react.UserButton });
        setLoadingState("ready");
      })
      .catch((e) => {
        console.error("Failed to load Clerk modules", e);
        setClerkProvider(null);
        setHooks(null);
        setLoadingState("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Wait for Clerk modules to load
  if (loadingState === "loading") {
    return (
      <WidgetCtx.Provider value={undefined}>
        <Ctx.Provider
          value={{
            ready: false,
            isSignedIn: false,
            openSignIn: () => {
              console.log("[CLERK] openSignIn before ready");
            },
          }}
        >
          {children}
        </Ctx.Provider>
      </WidgetCtx.Provider>
    );
  }

  // If loading failed, treat as ready with no auth
  if (loadingState === "error" || !ClerkProvider || !hooks) {
    return (
      <WidgetCtx.Provider value={undefined}>
        <Ctx.Provider
          value={{
            ready: true,
            isSignedIn: false,
            openSignIn: () => {
              console.log("[CLERK] openSignIn after error");
            },
          }}
        >
          {children}
        </Ctx.Provider>
      </WidgetCtx.Provider>
    );
  }

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

  if (!publishableKey) {
    console.error("VITE_CLERK_PUBLISHABLE_KEY is not set");
    return (
      <WidgetCtx.Provider value={undefined}>
        <Ctx.Provider
          value={{
            ready: true,
            isSignedIn: false,
            openSignIn: () => {
              console.log("[CLERK] openSignIn after key not set");
            },
          }}
        >
          {children}
        </Ctx.Provider>
      </WidgetCtx.Provider>
    );
  }

  const Inner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isSignedIn, isLoaded } = hooks.useUser();
    const { openSignIn } = hooks.useClerk();

    const ctx = useMemo<AuthCtx>(
      () => ({
        ready: isLoaded !== false, // Clerk's isLoaded tells us when it's ready
        isSignedIn: !!isSignedIn,
        openSignIn: () => {
          console.log("[CLERK] openSignIn");
          openSignIn();
        },
        userId: user?.id,
        email: user?.emailAddresses?.[0]?.emailAddress ?? null,
      }),
      [isLoaded, isSignedIn, openSignIn, user?.id, user?.emailAddresses],
    );

    return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
  };

  return (
    <WidgetCtx.Provider value={hooks.UserButton}>
      <ClerkProvider publishableKey={publishableKey}>
        <Inner>{children}</Inner>
      </ClerkProvider>
    </WidgetCtx.Provider>
  );
};

const AuthProviderSafe: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (import.meta.env.SSR) {
    return (
      <Ctx.Provider
        value={{
          ready: false,
          isSignedIn: false,
          openSignIn: () => {
            console.log("[CLERK] openSignIn in SSR");
          },
        }}
      >
        {children}
      </Ctx.Provider>
    );
  }

  return <AuthProvider>{children}</AuthProvider>;
};
const useAuth = () => useContext(Ctx);

const useUserWidget = () => useContext(WidgetCtx);

const mod: AuthModule = { AuthProvider: AuthProviderSafe, useAuth, useUserWidget };

export default mod;
