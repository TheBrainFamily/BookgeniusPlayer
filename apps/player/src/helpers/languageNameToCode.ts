const languageMap: Record<string, string> = { polish: "pl", english: "en" };

export const languageNameToCode = (langName: string) => {
  return languageMap[langName.toLowerCase()] ?? "en";
};
