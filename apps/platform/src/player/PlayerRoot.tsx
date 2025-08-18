import { useEffect, useState } from "react";
import App from "../../../player/src/App";

export default function PlayerRoot() {
  const [cssReady, setCssReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Load styles only when the user navigates to /reader/
      try {
        await Promise.all([
          import("../../../player/src/styles/globals.css"),
          import("../../../player/src/styles/styles.css"),
          import("../../../player/src/styles/modals.css"),
          import("../../../player/src/styles/inline-avatars.css"),
          import("../../../player/src/i18n"),
        ]);

        if (!cancelled) setCssReady(true);
      } catch (error) {
        console.error("Failed to load player styles:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!cssReady) return null;

  return <App />;
}
