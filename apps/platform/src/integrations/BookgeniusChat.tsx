import React, { useEffect } from "react";
import Intercom from "@intercom/messenger-js-sdk";
import { useAuth } from "@platform/hooks/useAuth";

function BookgeniusChatSafe() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.ready) return;

    if (auth.isSignedIn) {
      Intercom({ app_id: "zo3n2i5p", user_id: auth.userId, email: auth.email });
    } else {
      Intercom({ app_id: "zo3n2i5p" });
    }
  }, [auth.ready, auth.isSignedIn, auth.userId, auth.email]);
  return null;
}

export function BookgeniusChat() {
  if (!import.meta.env.SSR && import.meta.env.VITE_AUTH_PROVIDER !== "snapplify") {
    return <BookgeniusChatSafe />;
  }
  return <></>;
}
