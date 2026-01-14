import type React from "react";
import { useEffect } from "react";

/**
 * Minimal placeholder for the OAuth callback route.
 * Renders nothing visible to avoid 404 flashes while the auth provider completes the flow.
 */
const AuthCallback: React.FC = () => {
  // No UI; provider effect in snapplify.tsx handles the flow.
  useEffect(() => {
    // Intentionally empty. Keeping a component helps router avoid NotFound.
  }, []);
  return null;
};

export default AuthCallback;
