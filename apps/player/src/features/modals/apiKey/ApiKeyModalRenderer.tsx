import React from "react";
import { createPortal } from "react-dom";
import { useApiKeyModal } from "@/stores/modals/apiKeyModal.store";
import ApiKeyModal from "@/components/modals/ApiKeyModal";
import { useEscapeKey } from "@/hooks/useEscapeKey";

export const ApiKeyModalRenderer: React.FC = () => {
  const { isOpen, onSuccess, closeModal } = useApiKeyModal();

  useEscapeKey(isOpen, closeModal);

  if (!isOpen) return null;

  return createPortal(<ApiKeyModal onClose={closeModal} onSuccess={onSuccess} />, document.body);
};
