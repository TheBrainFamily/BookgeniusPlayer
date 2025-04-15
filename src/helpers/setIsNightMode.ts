let _isNightMode = localStorage.getItem("nightMode") === "true" || !localStorage.getItem("nightMode");
export const isNightMode = () => {
  return _isNightMode;
};
export const setIsNightMode = (isNightMode: boolean) => {
  _isNightMode = isNightMode;
  if (isNightMode) {
    document.getElementById("legacy")?.classList.add("night-mode");
  } else {
    document.getElementById("legacy")?.classList.remove("night-mode");
  }
  localStorage.setItem("nightMode", String(isNightMode));
};

export const toggleNightMode = () => {
  setIsNightMode(!isNightMode());
};
