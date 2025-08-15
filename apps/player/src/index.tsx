import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "./styles/globals.css";
import "./styles/styles.css";
import "./styles/modals.css";
import "./styles/inline-avatars.css";
import "./styles/book-theme.css";
import "./i18n";

let container = document.getElementById("root");

if (!container) {
  console.log("Root element not found, waiting for 1 second");
  setTimeout(() => {
    container = document.getElementById("root");
    if (container) {
      createRoot(container).render(
        <React.StrictMode>
          <App />
        </React.StrictMode>,
      );
    } else {
      console.log("Root element not found again, waiting for 5 second");
      setTimeout(() => {
        container = document.getElementById("root");
        if (container) {
          createRoot(container).render(
            <React.StrictMode>
              <App />
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
      <App />
    </React.StrictMode>,
  );
}
