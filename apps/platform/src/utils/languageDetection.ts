import { isRunningOnLocalhost } from "@platform/utils/isRunningOnLocalhost.ts";

export type SupportedLanguage = "en" | "pl";

export const detectLanguageFromDomain = (): SupportedLanguage => {
  if (typeof window === "undefined") {
    return "en";
  }

  const hostname = window.location.hostname;

  if (hostname.endsWith(".pl") || isRunningOnLocalhost()) {
    return "pl";
  }

  return "en";
};
