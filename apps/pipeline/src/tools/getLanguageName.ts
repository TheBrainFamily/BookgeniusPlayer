export const getLanguageName = (language: string) => {
  switch (language) {
    case "eng":
      return "English";
    case "pol":
      return "Polish";
    default:
      return "English";
  }
};
