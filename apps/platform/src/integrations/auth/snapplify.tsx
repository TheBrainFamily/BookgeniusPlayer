// Cookie-based shortcut: if __session cookie exists, treat its value as our JWT/id_token

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "@platform/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import type { AuthCtx, AuthModule } from "./types";
import { Button } from "@platform/components/ui/button";

const OIDC_ISSUER = import.meta.env.VITE_SNAPPLIFY_ISSUER as string;
const CLIENT_ID = import.meta.env.VITE_SNAPPLIFY_CLIENT_ID as string | undefined;
const REDIRECT_URI = import.meta.env.VITE_SNAPPLIFY_REDIRECT_URI as string;
const AUTHORIZATION_ENDPOINT = `${OIDC_ISSUER.replace(/\/$/, "")}/oauth/authorize`;

// Storage keys
const KEY_STATE = "snap.auth.state";
const KEY_VERIFIER = "snap.auth.pkce";
const KEY_NONCE = "snap.auth.nonce";
const KEY_ID_TOKEN = "snap.auth.id_token";
const COOKIE_ID = "__session";

const _LOGIN_TOAST = "Hi there! You've successfully signed in.";
const _LOGIN_ERR = "We could not sign you in, please try again!";
const _LOGOUT_TOAST = "You've successfully signed out.";
const _REDIRECT_ROUTE = "/";

// Utils
const base64UrlEncode = (arrayBuffer: ArrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const randomString = (len = 43) => {
  const array = new Uint8Array(len);
  window.crypto.getRandomValues(array);
  return Array.from(array, (b) => (b % 16).toString(16)).join("");
};

const sha256 = async (str: string) => {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
};

const Ctx = createContext<AuthCtx>({ ready: false, isSignedIn: false, openSignIn: () => {} });

const AuthProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(KEY_ID_TOKEN) : null,
  );
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      try {
        const url = new URL(window.location.href);
        if (url.pathname === new URL(REDIRECT_URI, url.origin).pathname) {
          try {
            const returnedState = url.searchParams.get("state");
            const expectedState = sessionStorage.getItem(KEY_STATE);
            if (returnedState && expectedState && returnedState !== expectedState) {
              console.error("[SNAP] State mismatch", { returnedState, expectedState });
              toast({ description: "Sign-in failed. Please try again." });
              navigate(_REDIRECT_ROUTE, { replace: true });
              return;
            }

            // not very efficient
            const cookies = document.cookie
              .split("; ")
              .reduce<Record<string, string>>((acc, pair) => {
                const [k, ...rest] = pair.split("=");
                acc[decodeURIComponent(k)] = decodeURIComponent(rest.join("="));
                return acc;
              }, {});

            const sessionCookie = cookies[COOKIE_ID];
            if (sessionCookie && sessionCookie.length > 0) {
              sessionStorage.setItem(KEY_ID_TOKEN, sessionCookie);
              setIdToken(sessionCookie);
              toast({ description: _LOGIN_TOAST });
            } else {
              toast({ description: _LOGIN_ERR });
            }
          } catch (e) {
            console.error("Failed to handle login", e);
            toast({ description: _LOGIN_ERR });
          } finally {
            navigate(_REDIRECT_ROUTE, { replace: true });
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, [navigate]);

  const openSignIn = useMemo(() => {
    console.log("OPEN SIGN IN CLICKED");
    return async () => {
      console.log("OPEN SIGN IN CLICKED 2");
      if (!CLIENT_ID) {
        console.log("CLIENT ID IS NOT SET");
        if (import.meta.env.DEV) console.error("client id is not set");
        return;
      }

      try {
        const state = randomString(24);
        const verifier = randomString(64);
        const challenge = await sha256(verifier);
        const nonce = randomString(24);

        sessionStorage.setItem(KEY_STATE, state);
        sessionStorage.setItem(KEY_VERIFIER, verifier);
        sessionStorage.setItem(KEY_NONCE, nonce);

        const params = new URLSearchParams({
          response_type: "code",
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          scope: "identity",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          nonce,
        });
        console.log("ATTEMPTING TO WINDOW ASSIGN");
        window.location.assign(`${AUTHORIZATION_ENDPOINT}?${params.toString()}`);
      } catch (e) {
        console.log("FAILED TO OPEN SIGN IN", e);
        if (import.meta.env.DEV) console.error("Failed to open sign in", e);
      }
    };
  }, []);

  // Private signOut function (not exposed via context)
  const signOut = useMemo(() => {
    return () => {
      try {
        sessionStorage.removeItem(KEY_ID_TOKEN);
      } catch {
        if (import.meta.env.DEV) console.error("Failed to remove id_token from sessionStorage");
      }
      try {
        document.cookie = "__session=; Max-Age=0; path=/; SameSite=Lax";
      } catch {
        if (import.meta.env.DEV) console.error("Failed to remove session cookie");
      }
      setIdToken(null);
      navigate(_REDIRECT_ROUTE, { replace: true });
      toast({ description: _LOGOUT_TOAST });
    };
  }, [navigate]);

  const ctx = useMemo<AuthCtx>(
    () => ({
      ready,
      isSignedIn: !!idToken,
      openSignIn,
      signOut,
      userId: undefined,
      email: undefined,
      getToken: async () => idToken ?? null,
    }),
    [ready, idToken, openSignIn, signOut],
  );

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
};

const AuthProviderSafe: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (import.meta.env.SSR) {
    return (
      <Ctx.Provider
        value={{ ready: false, isSignedIn: false, openSignIn: () => {}, signOut: () => {} }}
      >
        {children}
      </Ctx.Provider>
    );
  }
  return <AuthProviderInner>{children}</AuthProviderInner>;
};

const useAuth = () => useContext(Ctx);

const SignInWidget: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <Button onClick={onClick} title="Sign in with Snapplify" variant="secondary">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 225 245"
      width="18"
      height="18"
      className="mr-2"
    >
      <path
        fill="#B7CF3A"
        d="M210.899 118.486c3.7-3.4 7.6-6.7 11.6-9.7-26.8-2.8-53.5-8.4-73.8-30.2-19.3-20.6-28.2-47.7-32.4-76.3-4.5 8.4-9.5 16.5-14.9 24.2-11.8 16.6-26.3 32.6-43.1 42.7-15.5 9.3-36.4 17.2-55.9 16.7 13.2 21.6 20.7 48.7 21.8 73.3.7 14.8-.2 31.5-3.5 47.5 5.6-2.8 11.5-5 17.4-6.6 21.1-5.5 42.9-2.7 63.5 3.5 20.3 6.2 40.4 15.5 57.9 28.8 4.1 3 8.1 6.4 12 9.9-2.4-27.3.9-55.3 10.8-80.2 6.4-16.8 16.1-32 28.6-43.6z"
      />
    </svg>
    Sign In
  </Button>
);

const mod: AuthModule = {
  AuthProvider: AuthProviderSafe,
  useAuth,
  useSignInWidget: () => SignInWidget,
};
export default mod;
