import { isRunningOnLocalhost } from "@platform/utils/isRunningOnLocalhost.ts";

export type SupportedLanguage = "en" | "pl";

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  value === "en" || value === "pl";

export const detectLanguageFromDomain = (): SupportedLanguage => {
  const envLocale = import.meta.env.VITE_LOCALE;
  if (envLocale && isSupportedLanguage(envLocale)) {
    return envLocale;
  }

  if (typeof window === "undefined") {
    return "en";
  }

  const hostname = window.location.hostname;

  if (hostname.endsWith(".pl") || isRunningOnLocalhost()) {
    return "pl";
  }

  return "en";
};
