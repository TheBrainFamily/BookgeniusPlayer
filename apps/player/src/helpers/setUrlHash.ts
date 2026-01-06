export const setUrlHash = (
  chapter: number,
  paragraph: number,
  mode: "push" | "replace" = "replace",
) => {
  const url = new URL(window.location.href);
  url.hash = `${chapter}-${paragraph}`;
  if (mode === "push") {
    window.history.pushState(window.history.state, "", url.toString());
  } else {
    window.history.replaceState(window.history.state, "", url.toString());
  }
};
