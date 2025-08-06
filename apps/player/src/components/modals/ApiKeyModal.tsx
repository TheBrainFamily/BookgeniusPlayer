import React, { useState, useRef, useEffect } from "react";
import { BrainCircuit, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ModalUI from "./ModalUI";
import { setApiKey } from "@/utils/apiKeyManager";

interface ApiKeyModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose, onSuccess }) => {
  const [apiKey, setApiKeyValue] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    // Focus the input when modal opens
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!apiKey.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Set the API key using our utility
      setApiKey(apiKey.trim());

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }

      // Close the modal
      onClose();
    } catch (error) {
      console.error("Error setting API key:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <ModalUI title={t("set_openai_api_key")} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit className="h-5 w-5 text-blue-400" />
          <p className="text-sm text-gray-300">{t("api_key_required_message", "Please enter your OpenAI API key to use voice features.")}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-key-input" className="text-sm font-medium text-white">
            {t("openai_api_key", "OpenAI API Key")}
          </Label>
          <div className="relative">
            <Input
              ref={inputRef}
              id="api-key-input"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKeyValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-..."
              className="bg-black/50 border-white/20 text-white placeholder:text-gray-400 pr-10"
              disabled={isSubmitting}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white transition-colors"
              tabIndex={-1}
            >
              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-xs text-gray-500">{t("api_key_storage_note", "Your API key is stored locally in your browser and never sent to our servers.")}</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1 text-white hover:bg-white/10 border-white/20" disabled={isSubmitting}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" disabled={!apiKey.trim() || isSubmitting}>
            {isSubmitting ? t("saving", "Saving...") : t("save")}
          </Button>
        </div>
      </form>
    </ModalUI>
  );
};

export default ApiKeyModal;
