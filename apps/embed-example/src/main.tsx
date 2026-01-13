import { createRoot } from "react-dom/client";
import { App } from "./App";

// Import Tailwind CSS with player source scanning
import "./styles/index.css";

// Note: StrictMode removed temporarily - PlayerDOMProvider's cleanup
// removes DOM elements on StrictMode's simulated unmount, breaking the player.
// TODO: Fix PlayerDOMProvider to handle StrictMode properly.
createRoot(document.getElementById("root")!).render(<App />);
