import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { detectLanguageFromDomain } from "@platform/utils/languageDetection";

// Import translation resources
import enTranslations from "./locales/en.json";
import plTranslations from "./locales/pl.json";

const resources = { en: { translation: enTranslations }, pl: { translation: plTranslations } };

// Initialize immediately with resources
const initialLanguage = typeof window !== "undefined" ? detectLanguageFromDomain() : "en";

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  debug: process.env.NODE_ENV === "development",

  interpolation: { escapeValue: false },

  react: { useSuspense: false },

  // Since we have bundled resources, we can initialize immediately
  initImmediate: false,
});

// Update language when window becomes available (client-side hydration)
if (typeof window !== "undefined") {
  // Handle client-side language detection
  const detectedLang = detectLanguageFromDomain();
  if (i18n.language !== detectedLang && i18n.isInitialized) {
    i18n.changeLanguage(detectedLang);
  }
}

export default i18n;
