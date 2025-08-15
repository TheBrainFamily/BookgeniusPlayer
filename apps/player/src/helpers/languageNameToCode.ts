export const languageNameToCode = (langName: string) => {
  switch (langName.toLowerCase()) {
    case "polish":
      return "pl";
    case "english":
      return "en";
    default:
      return "en";
  }
};
