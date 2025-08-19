import { ViteReactSSG } from "vite-react-ssg/single-page";
import App from "./App.tsx";

import "./tailwind.css";
import "./index.css";

import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/playfair-display/700.css";

export const createRoot = ViteReactSSG(<App />);
