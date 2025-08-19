import React from "react";
import { createRoot } from "react-dom/client";

import "./styles/index.css";

import "./i18n";
import { AppWithResolve } from "@player/AppWithResolve";

let container = document.getElementById("root-player");

if (!container) {
  console.log("Root element not found, waiting for 1 second");
  setTimeout(() => {
    container = document.getElementById("root-player");
    if (container) {
      createRoot(container).render(
        <React.StrictMode>
          <AppWithResolve />
        </React.StrictMode>,
      );
    } else {
      console.log("Root element not found again, waiting for 5 second");
      setTimeout(() => {
        container = document.getElementById("root-player");
        if (container) {
          createRoot(container).render(
            <React.StrictMode>
              <AppWithResolve />
            </React.StrictMode>,
          );
        } else {
          throw new Error("Root element not found after 6 seconds and 3 attempts");
        }
      }, 5000);
    }
  }, 1000);
} else {
  createRoot(container).render(
    <React.StrictMode>
      <AppWithResolve />
    </React.StrictMode>,
  );
}
