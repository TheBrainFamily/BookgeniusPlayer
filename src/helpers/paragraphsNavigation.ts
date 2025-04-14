let _currentLocation = { chapter: 0, paragraph: 0 };
export const getCurrentLocation = () => {
  return _currentLocation;
};

export const setCurrentLocation = (location: { chapter: number; paragraph: number }) => {
  console.log("setCurrentLocation", location);
  _currentLocation = location;
};

export const goToParagraph = (chapter: number, paragraph: number) => {
  setCurrentLocation({ chapter, paragraph });
  // Select the paragraph based on data-chapter and data-index attributes
  const selector = `section[data-chapter="${chapter}"] p[data-index="${paragraph}"]`;
  const targetParagraph = document.querySelector(selector);
  targetParagraph?.scrollIntoView({ behavior: "smooth", block: "start" });
};
