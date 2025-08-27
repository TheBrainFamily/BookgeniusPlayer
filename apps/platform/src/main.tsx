import { ViteReactSSG } from "vite-react-ssg/single-page";
import App from "./App.tsx";

import "./styles/index.css";

export const createRoot = ViteReactSSG(<App />);
