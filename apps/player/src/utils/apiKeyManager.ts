/**
 * Utility functions for managing OpenAI API key in localStorage
 * and notifying components of changes
 */

const API_KEY_STORAGE_KEY = "tmp::voice_api_key";
const API_KEY_UPDATE_EVENT = "apiKeyUpdated";

/**
 * Sets the OpenAI API key in localStorage and notifies listeners
 */
export const setApiKey = (apiKey: string): void => {
  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  // Dispatch custom event to notify components in the same tab
  window.dispatchEvent(new CustomEvent(API_KEY_UPDATE_EVENT));
};

/**
 * Gets the OpenAI API key from localStorage
 */
export const getApiKey = (): string => {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
};

/**
 * Checks if an API key is currently set
 */
export const hasApiKey = (): boolean => {
  return getApiKey().trim().length > 0;
};

/**
 * Removes the OpenAI API key from localStorage and notifies listeners
 */
export const removeApiKey = (): void => {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(API_KEY_UPDATE_EVENT));
};

/**
 * Hook to listen for API key changes
 * Returns a function to add/remove listeners
 */
export const createApiKeyListener = (callback: () => void) => {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === API_KEY_STORAGE_KEY) {
      callback();
    }
  };

  const handleApiKeyUpdate = () => {
    callback();
  };

  const addListeners = () => {
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(API_KEY_UPDATE_EVENT, handleApiKeyUpdate);
  };

  const removeListeners = () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(API_KEY_UPDATE_EVENT, handleApiKeyUpdate);
  };

  return { addListeners, removeListeners };
};

// Export constants for consistency
export { API_KEY_STORAGE_KEY, API_KEY_UPDATE_EVENT };
