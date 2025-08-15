import React from "react";
import { createPortal } from "react-dom";
import { useApiKeyModal } from "@player/stores/modals/apiKeyModal.store";
import ApiKeyModal from "@player/components/modals/ApiKeyModal";
import { useEscapeKey } from "@player/hooks/useEscapeKey";

export const ApiKeyModalRenderer: React.FC = () => {
  const { isOpen, onSuccess, closeModal } = useApiKeyModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<ApiKeyModal onClose={closeModal} onSuccess={onSuccess} />, document.body);
};
