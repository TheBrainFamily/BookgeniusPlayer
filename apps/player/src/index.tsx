import React from "react";
import { createRoot } from "react-dom/client";

import "./styles/index.css";

import { AppWithResolve } from "@player/AppWithResolve";
import { SplashScreenController } from "@player/components/SplashScreen";

// Try to find container immediately, or wait for DOMContentLoaded if DOM isn't ready yet
function mountApp() {
  const container = document.getElementById("root-player");
  if (!container) {
    throw new Error("Root element #root-player not found. Ensure the HTML includes this element.");
  }
  createRoot(container).render(
    <React.StrictMode>
      {/* Controls the existing HTML splash screen */}
      <SplashScreenController autoStart={false} />
      <AppWithResolve />
    </React.StrictMode>,
  );
}

// If DOM is already ready, mount immediately. Otherwise wait for DOMContentLoaded.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountApp);
} else {
  mountApp();
}
