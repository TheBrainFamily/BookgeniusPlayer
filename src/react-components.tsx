import React from "react";
import { createRoot } from "react-dom/client";
import BookChaptersModal from "./book-chapters-modal";

export const startReactComponents = () => {
  const root = createRoot(document.getElementById("chapters-root"));
  root.render(<BookChaptersModal />);
};
