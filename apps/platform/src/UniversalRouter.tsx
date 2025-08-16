// src/UniversalRouter.tsx
import React from "react";
import { BrowserRouter, StaticRouter } from "react-router-dom";

export function UniversalRouter({ children }: { children: React.ReactNode }) {
  // On the server, react-router needs StaticRouter.
  if (import.meta.env.SSR) {
    return <StaticRouter location="/">{children}</StaticRouter>;
  }
  return <BrowserRouter>{children}</BrowserRouter>;
}
