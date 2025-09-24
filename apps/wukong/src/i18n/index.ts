import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Import translation resources from platform app
import enTranslations from "../../../platform/src/i18n/locales/en.json";
import plTranslations from "../../../platform/src/i18n/locales/pl.json";

const resources = { en: { translation: enTranslations }, pl: { translation: plTranslations } };

// Initialize immediately with resources
i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  debug: process.env.NODE_ENV === "development",

  interpolation: { escapeValue: false },

  react: { useSuspense: false },
});

export default i18n;
