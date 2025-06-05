import React, { useState, useEffect } from "react";
import { getApiKey, createApiKeyListener } from "@/utils/apiKeyManager";

/**
 * A simple component to display the current API key status
 * This demonstrates that the API key management system works correctly
 */
export const ApiKeyStatus: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    const loadApiKey = () => {
      const currentApiKey = getApiKey();
      setApiKey(currentApiKey);
      setLastUpdated(new Date().toLocaleTimeString());
    };

    // Load initial API key
    loadApiKey();

    // Set up listeners for API key changes
    const { addListeners, removeListeners } = createApiKeyListener(loadApiKey);
    addListeners();

    return removeListeners;
  }, []);

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs max-w-xs">
      <div className="font-semibold mb-1">API Key Status</div>
      <div className="space-y-1">
        <div>Status: {apiKey ? "✅ Set" : "❌ Not Set"}</div>
        {apiKey && (
          <div>
            Key: {apiKey.substring(0, 8)}...{apiKey.substring(apiKey.length - 4)}
          </div>
        )}
        {lastUpdated && <div className="text-gray-400">Last updated: {lastUpdated}</div>}
      </div>
    </div>
  );
};

export default ApiKeyStatus;
