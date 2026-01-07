import { useState, useEffect } from "react";
import { useAuth } from "@platform/hooks/useAuth";
import { snapplifyChatInitializer, FC_READY_EVENT } from "./SnapplifyChatFreshChatInitializer";

declare global {
  interface Window {
    fcWidget: {
      init: (config: {
        token: string;
        host: string;
        config: { content: { headers: { channel_response: { offline: string } } } };
        tags: string[];
        faqTags: { tags: string[]; filterType: string };
      }) => void;
      user: { setProperties: (properties: Record<string, string>) => void };
    };
  }
}

type SnapplifyJwtData = {
  sub: string;
  user_id: number;
  given_name: string;
  family_name: string;
  name: string;
  email: string;
  iat: number;
  exp: number;
};
function getSnapplifyDataFromJwt(): SnapplifyJwtData | null {
  console.log("[SnapplifyChat] Getting Snapplify data from JWT...");

  const sessionCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("__session="))
    ?.split("=")[1];

  console.log("[SnapplifyChat] Session cookie found:", !!sessionCookie);
  console.log("[SnapplifyChat] Available cookies:", document.cookie);

  if (sessionCookie) {
    console.log("[SnapplifyChat] Session cookie length:", sessionCookie.length);
    const parts = sessionCookie.split(".");
    console.log("[SnapplifyChat] JWT parts count:", parts.length);

    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1]));
        console.log("[SnapplifyChat] Successfully parsed JWT payload:", {
          sub: payload.sub,
          user_id: payload.user_id,
          given_name: payload.given_name,
          family_name: payload.family_name,
          name: payload.name,
          email: payload.email,
          iat: payload.iat,
          exp: payload.exp,
        });
        return payload;
      } catch (error) {
        console.error("[SnapplifyChat] Failed to parse JWT payload:", error);
      }
    }
  } else {
    console.log("[SnapplifyChat] __session cookie not found");
  }

  console.log("[SnapplifyChat] Returning null - no Snapplify data available");
  return null;
}

function initiateCall() {
  console.log("[SnapplifyChat] Initiating FreshChat widget...");
  snapplifyChatInitializer(document, "Freshdesk Messaging-js-sdk");
}

function SnapplifyChatSafe() {
  console.log("[SnapplifyChat] SnapplifyChatSafe component initializing...");
  const auth = useAuth();
  const [fcReady, setFcReady] = useState(typeof window !== "undefined" && !!window.fcWidget);

  console.log("[SnapplifyChat] Initial state:", {
    authReady: auth.ready,
    isSignedIn: auth.isSignedIn,
    fcReady,
    fcWidgetExists: typeof window !== "undefined" && !!window.fcWidget,
  });

  useEffect(() => {
    console.log("[SnapplifyChat] Setting up FreshChat initialization...");
    const handleFcReady = () => {
      console.log("[SnapplifyChat] FreshChat ready event received");
      setFcReady(true);
    };
    window.addEventListener(FC_READY_EVENT, handleFcReady);

    if (window.fcWidget) {
      console.log("[SnapplifyChat] FreshChat widget already exists, setting ready");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing with external widget state on mount
      setFcReady(true);
    } else {
      console.log("[SnapplifyChat] FreshChat widget not found, initiating...");
      initiateCall();
    }

    return () => {
      console.log("[SnapplifyChat] Cleaning up FreshChat event listeners");
      window.removeEventListener(FC_READY_EVENT, handleFcReady);
    };
  }, []);

  useEffect(() => {
    console.log("[SnapplifyChat] Auth/FC state change effect triggered:", {
      authReady: auth.ready,
      isSignedIn: auth.isSignedIn,
      fcReady,
    });

    if (!auth.ready || !fcReady) {
      console.log("[SnapplifyChat] Skipping user properties - not ready:", {
        authReady: auth.ready,
        fcReady,
      });
      return;
    }

    if (auth.isSignedIn) {
      console.log("[SnapplifyChat] User is signed in, setting authenticated properties...");
      const snapplifyData = getSnapplifyDataFromJwt();

      if (!snapplifyData) {
        console.log("[SnapplifyChat] No Snapplify data available, skipping user properties");
        return;
      }

      const userProperties = {
        user_isAuthenticated: "True",
        firstName: snapplifyData.given_name,
        lastName: snapplifyData.family_name,
        email: snapplifyData.email,
        user_username: snapplifyData.sub,
        // customer_name: "Snapplify High School",
        // customer_country: "South Africa",
        // customer_URL: "snapplifyhighschool.snapplify.com",
        // user_grade: "12",
      };

      console.log("[SnapplifyChat] Setting user properties:", userProperties);

      try {
        window.fcWidget.user.setProperties(userProperties);
        console.log("[SnapplifyChat] Successfully set user properties");
      } catch (error) {
        console.error("[SnapplifyChat] Failed to set user properties:", error);
      }
    } else {
      console.log("[SnapplifyChat] User is not signed in, setting unauthenticated property");
      try {
        window.fcWidget.user.setProperties({ user_isAuthenticated: "False" });
        console.log("[SnapplifyChat] Successfully set unauthenticated property");
      } catch (error) {
        console.error("[SnapplifyChat] Failed to set unauthenticated property:", error);
      }
    }
  }, [auth.ready, auth.isSignedIn, fcReady]);

  return null;
}

export function SnapplifyChat() {
  console.log("[SnapplifyChat] SnapplifyChat component rendering...");
  console.log("[SnapplifyChat] Environment checks:", {
    isSSR: import.meta.env.SSR,
    authProvider: import.meta.env.VITE_AUTH_PROVIDER,
  });

  if (!import.meta.env.SSR && import.meta.env.VITE_AUTH_PROVIDER === "snapplify") {
    console.log("[SnapplifyChat] Conditions met, rendering SnapplifyChatSafe");
    return <SnapplifyChatSafe />;
  }

  console.log("[SnapplifyChat] Conditions not met, rendering empty component");
  return <></>;
}
