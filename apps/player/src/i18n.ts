import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";

const viteLang = import.meta.env.VITE_LANG as string | undefined;

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: viteLang?.toLowerCase() || "pl",
    fallbackLng: "en",
    debug: true,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
    detection: { order: ["querystring", "localStorage", "navigator", "htmlTag"], lookupQuerystring: "lng", lookupLocalStorage: "i18nextLng", caches: ["localStorage"] },
    supportedLngs: ["en", "pl"],
  });

// Expose i18n to the window object for access in index.html
if (typeof window !== "undefined") {
  (window as unknown as { i18n: typeof i18n }).i18n = i18n;
}

export default i18n;
