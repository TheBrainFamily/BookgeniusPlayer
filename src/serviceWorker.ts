// Service worker registration and handling

export const dealWithSW = () => {
  const splash = document.getElementById("splash")!;

  splash.classList.add("hide");
  // register ASAP, but don't hide splash until the SW tells us it's ready
  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.register("/sw.js", { type: "module" });
    } catch (e) {
      console.error("Service worker registration failed:", e);
    }
  } else {
    splash.classList.add("hide");
    console.log("Service worker not supported");
  }

  navigator.serviceWorker?.addEventListener("message", (evt) => {
    if (evt.data?.type === "CACHE_COMPLETE") {
      splash.classList.add("hide"); // triggers your CSS transition
    }
  });
};
