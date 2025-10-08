import "./sentry";
import { ViteReactSSG } from "vite-react-ssg/single-page";
import App from "./App.tsx";

import "./styles/index.css";
import "./i18n/index.ts";

export const createRoot = ViteReactSSG(<App />);
