import React, { useState, useEffect } from "react";
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

type SnapplifyJwtData = { sub: string; user_id: number; given_name: string; family_name: string; name: string; email: string; iat: number; exp: number };
function getSnapplifyDataFromJwt(): SnapplifyJwtData | null {
  const sessionCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith("__session="))
    ?.split("=")[1];

  if (sessionCookie) {
    const parts = sessionCookie.split(".");
    if (parts.length === 3) {
      return JSON.parse(atob(parts[1]));
    }
  } else {
    console.log("__session cookie not found");
  }

  return null;
}

function initiateCall() {
  snapplifyChatInitializer(document, "Freshdesk Messaging-js-sdk");
}

function SnapplifyChatSafe() {
  const auth = useAuth();
  const [fcReady, setFcReady] = useState(typeof window !== "undefined" && !!window.fcWidget);

  useEffect(() => {
    const handleFcReady = () => setFcReady(true);
    window.addEventListener(FC_READY_EVENT, handleFcReady);

    if (window.fcWidget) {
      setFcReady(true);
    } else {
      initiateCall();
    }

    return () => {
      window.removeEventListener(FC_READY_EVENT, handleFcReady);
    };
  }, []);

  useEffect(() => {
    if (!auth.ready || !fcReady) return;

    if (auth.isSignedIn) {
      const snapplifyData = getSnapplifyDataFromJwt();
      if (!snapplifyData) return;

      window.fcWidget.user.setProperties({
        user_isAuthenticated: "True",
        firstName: snapplifyData.given_name,
        lastName: snapplifyData.family_name,
        email: snapplifyData.email,
        user_username: snapplifyData.sub,
        // customer_name: "Snapplify High School",
        // customer_country: "South Africa",
        // customer_URL: "snapplifyhighschool.snapplify.com",
        // user_grade: "12",
      });
    } else {
      window.fcWidget.user.setProperties({ user_isAuthenticated: "False" });
    }
  }, [auth.ready, auth.isSignedIn, fcReady]);

  return null;
}

export function SnapplifyChat() {
  if (!import.meta.env.SSR && import.meta.env.VITE_AUTH_PROVIDER === "snapplify") {
    return <SnapplifyChatSafe />;
  }

  return <></>;
}
