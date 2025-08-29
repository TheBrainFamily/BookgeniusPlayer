import i18next, { i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";

const i18n: I18nInstance = i18next.createInstance();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use(resourcesToBackend((lng, ns) => import(`./locales/${lng}/${ns}.json`)))
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "pl"],
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    detection: { order: ["querystring", "localStorage", "navigator", "htmlTag"], lookupQuerystring: "lng", caches: ["localStorage"] },
  });

export default i18n;
