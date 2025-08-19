import { ViteReactSSG } from "vite-react-ssg/single-page";
import App from "./App.tsx";

import "./tailwind.css";
import "./index.css";

export const createRoot = ViteReactSSG(<App />);
