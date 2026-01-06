import React, { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  detectLanguageFromDomain,
  type SupportedLanguage,
} from "@platform/utils/languageDetection";

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

interface LanguageProviderProps {
  children: React.ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const { i18n, ready } = useTranslation();
  const [language, setLanguageState] = useState<SupportedLanguage>(() =>
    detectLanguageFromDomain(),
  );
  const [isLoading, setIsLoading] = useState(true);

  const setLanguage = (newLanguage: SupportedLanguage) => {
    setLanguageState(newLanguage);
    if (i18n.isInitialized) {
      i18n.changeLanguage(newLanguage);
    }
  };

  useEffect(() => {
    if (ready) {
      const detectedLanguage = detectLanguageFromDomain();
      if (detectedLanguage !== language) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing with external domain detection
        setLanguage(detectedLanguage);
      }
       
      setIsLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    // Update i18n language when context language changes
    if (ready && i18n.language !== language && i18n.isInitialized) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n, ready]);

  const value: LanguageContextType = { language, setLanguage, isLoading };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};
