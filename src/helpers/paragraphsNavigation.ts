let _currentLocation = { chapter: 0, paragraph: 0 };

export const getSavedLocation = () => {
  const savedLocation = localStorage.getItem("furthestLocation");
  return savedLocation ? JSON.parse(savedLocation) : { chapter: 0, paragraph: 0 };
};

export const setSavedLocation = (location: { chapter: number; paragraph: number }) => {
  console.log("setSavedLocation", location);
  localStorage.setItem("furthestLocation", JSON.stringify(location));
};

export const getCurrentLocation = () => {
  return _currentLocation;
};

export const setCurrentLocation = (location: { chapter: number; paragraph: number }) => {
  console.log("setCurrentLocation", location);
  _currentLocation = location;
  if (
    _currentLocation.chapter > getSavedLocation().chapter ||
    (_currentLocation.chapter === getSavedLocation().chapter && _currentLocation.paragraph > getSavedLocation().paragraph)
  ) {
    setSavedLocation(_currentLocation);
  } else {
    updateGoBackButton();
  }
};

export const goToParagraph = (chapter: number, paragraph: number) => {
  setCurrentLocation({ chapter, paragraph });
  // Select the paragraph based on data-chapter and data-index attributes
  const selector = `section[data-chapter="${chapter}"] p[data-index="${paragraph}"]`;
  const targetParagraph = document.querySelector(selector);
  targetParagraph?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const returnButton = document.getElementById("return-to-location-button");
if (returnButton) {
  returnButton.addEventListener("click", () => {
    goToParagraph(getSavedLocation().chapter, getSavedLocation().paragraph);
    returnButton.style.display = "none";
  });
} else {
  console.warn("returnButton not found");
  setTimeout(() => {
    returnButton.addEventListener("click", () => {
      goToParagraph(getSavedLocation().chapter, getSavedLocation().paragraph);
      returnButton.style.display = "none";
    });
  }, 500);
}

const updateGoBackButton = () => {
  // Show the button if we have a valid pre-search location
  setTimeout(() => {
    const currentLocation = getCurrentLocation();
    if (
      getSavedLocation().chapter > currentLocation.chapter ||
      (getSavedLocation().chapter === currentLocation.chapter && getSavedLocation().paragraph - 5 > currentLocation.paragraph)
    ) {
      returnButton.style.display = "block";
    } else {
      returnButton.style.display = "none";
    }
  }, 100);
};
