interface Window {
  showCharacterDetailsModal: (characterName: string, imageUrl: string, summary?: string) => void;
}

// Custom event types for API key management
interface WindowEventMap {
  apiKeyUpdated: CustomEvent;
}
