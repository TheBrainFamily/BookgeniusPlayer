import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { ClerkProviderProps } from "@clerk/react-router";
import type { LoadedClerk, UseUserReturn, UseAuthReturn } from "@clerk/types";
import type { AuthCtx, AuthModule } from "./types";
import { Button } from "@platform/components/ui/button";
import { useTranslation } from "react-i18next";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection.ts";
import { enUS, plPL } from "@clerk/localizations";

const Ctx = createContext<AuthCtx>({ ready: false, isSignedIn: false, openSignIn: () => {} });

const WidgetCtx = createContext<React.ComponentType | undefined>(undefined);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ClerkProvider, setClerkProvider] = useState<React.ComponentType<ClerkProviderProps> | null>(null);
  const [SignInComponent, setSignInComponent] = useState<React.ComponentType | undefined>(undefined);
  const [SignUpComponent, setSignUpComponent] = useState<React.ComponentType | undefined>(undefined);
  const [hooks, setHooks] = useState<{ useUser: () => UseUserReturn; useClerk: () => LoadedClerk; UserButton?: React.ComponentType; useClerkAuth: () => UseAuthReturn } | null>(
    null,
  );
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
        setSignInComponent(() => router.SignIn);
        setSignUpComponent(() => router.SignUp);

        setHooks({ useUser: react.useUser, useClerk: react.useClerk, UserButton: react.UserButton, useClerkAuth: react.useAuth });
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

  const isSatellite = import.meta.env.VITE_CLERK_IS_SATELLITE === "true";
  const clerkDomain = import.meta.env.VITE_CLERK_DOMAIN || undefined;
  const shouldUseRedirect = isSatellite || clerkDomain;
  const clerkDomainUrl = `https://${clerkDomain}`;

  let signInUrl = "/sign-in";
  let signUpUrl = "/sign-up";

  const signInUrlEnv = import.meta.env.VITE_PUBLIC_CLERK_SIGN_IN_URL;
  const signUpUrlEnv = import.meta.env.VITE_PUBLIC_CLERK_SIGN_UP_URL;
  if (shouldUseRedirect && signInUrlEnv && signUpUrlEnv && clerkDomain) {
    const signInUrlObj = new URL(signInUrlEnv);
    signInUrlObj.searchParams.append("redirect_url", clerkDomainUrl);
    signInUrl = signInUrlObj.toString();

    const signUpUrlObj = new URL(signUpUrlEnv);
    signUpUrlObj.searchParams.append("redirect_url", clerkDomainUrl);
    signUpUrl = signUpUrlObj.toString();
  }

  const Inner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, isSignedIn, isLoaded } = hooks.useUser();
    const { openSignIn } = hooks.useClerk();
    const clerkAuth = hooks.useClerkAuth();

    const ctx = useMemo<AuthCtx>(
      () => ({
        ready: isLoaded !== false, // Clerk's isLoaded tells us when it's ready
        isSignedIn: !!isSignedIn,
        components: { SignIn: SignInComponent, SignUp: SignUpComponent },
        openSignIn: () => {
          console.log("[CLERK] openSignIn");
          if (!shouldUseRedirect) {
            openSignIn();
          } else {
            window.location.href = signInUrl;
          }
        },
        userId: user?.id,
        email: user?.emailAddresses?.[0]?.emailAddress ?? null,
        refreshToken: () => clerkAuth.getToken({ skipCache: true }),
      }),
      [isLoaded, isSignedIn, openSignIn, user?.id, user?.emailAddresses, clerkAuth],
    );

    return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
  };

  const mainClerkDomain = "bookgenius.net";
  const allowedRedirectOrigins = [
    `https://${mainClerkDomain}`,
    `https://accounts.${mainClerkDomain}`,
    "https://bookgeniusz.pl",
    `https://accounts.bookgeniusz.pl`,
    "https://wukong.bookgenius.net",
  ];

  return (
    <WidgetCtx.Provider value={hooks.UserButton}>
      <ClerkProvider
        localization={detectLanguageFromDomain() === "pl" ? plPL : enUS}
        publishableKey={publishableKey}
        domain={shouldUseRedirect ? clerkDomain : undefined}
        signInUrl={signInUrl}
        signUpUrl={signUpUrl}
        isSatellite={isSatellite}
        allowedRedirectOrigins={allowedRedirectOrigins}
      >
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
const SignInWidget: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation();

  return (
    <Button variant="secondary" onClick={onClick}>
      {t("navigation.signIn")}
    </Button>
  );
};
const mod: AuthModule = { AuthProvider: AuthProviderSafe, useAuth, useUserWidget, useSignInWidget: () => SignInWidget };

export default mod;
