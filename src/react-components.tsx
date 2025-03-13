import React from "react";
import { createRoot } from "react-dom/client";
import BookChaptersModal from "./book-chapters-modal";

const MyFirstComponent = () => {
  return <BookChaptersModal />;
};

const root = createRoot(document.getElementById("chapters-root"));
root.render(<MyFirstComponent />);
