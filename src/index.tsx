import React from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "./styles/globals.css";
import "./styles/styles.css";
import "./styles/main.css";
import "./styles/modals.css";
import "./styles/inline-avatars.css";
import "./styles/book-theme.css";
import "./i18n";

const container = document.getElementById("root")!;
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
