import { createRoot } from "react-dom/client";
import App from "./App.tsx";

import "./tailwind.css";
import "./index.css";

import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";

createRoot(document.getElementById("root-platform")!).render(<App />);
