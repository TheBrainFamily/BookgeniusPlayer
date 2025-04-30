import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

/* Tailwind / global styles – exactly the same imports you already had */
import "./styles.css";
import "./styles-narrow.css";
import "./globals.css";
import "./main.css";
import "./modals.css";
import "./mobile.css";
import "./styles/inline-avatars.css";

const container = document.getElementById("root")!;
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
