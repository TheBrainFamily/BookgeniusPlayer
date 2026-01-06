/**
 * DraftModeContext
 *
 * Provides a simple boolean flag for draft mode.
 * When true, queries prefer draft versions over published.
 * When false, queries only show published content.
 *
 * Usage:
 * - Set via URL param: ?draft=true
 * - Components use: const draftMode = useDraftMode();
 * - Pass to Convex queries: useQuery(api.bookQueries.listChapters, { bookPath, draftMode })
 */

import React, { createContext, useContext, useState, useEffect } from "react";

const DraftModeContext = createContext<boolean>(false);

interface DraftModeProviderProps {
  children: React.ReactNode;
  /** Override the URL-based detection */
  forceDraftMode?: boolean;
}

export function DraftModeProvider({ children, forceDraftMode }: DraftModeProviderProps) {
  const [draftMode, setDraftMode] = useState(forceDraftMode ?? false);

  useEffect(() => {
    // If forceDraftMode is provided, use it
    if (forceDraftMode !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing with prop on mount
      setDraftMode(forceDraftMode);
      return;
    }

    // Otherwise, detect from URL
    const urlParams = new URLSearchParams(window.location.search);
    const isDraft = urlParams.get("draft") === "true" || urlParams.get("editor") === "true";

    setDraftMode(isDraft);
  }, [forceDraftMode]);

  return <DraftModeContext.Provider value={draftMode}>{children}</DraftModeContext.Provider>;
}

/**
 * Hook to get the current draft mode setting.
 * Returns true if viewing draft content, false for published-only.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useDraftMode(): boolean {
  return useContext(DraftModeContext);
}
