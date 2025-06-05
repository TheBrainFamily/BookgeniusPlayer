import { CURRENT_BOOK } from "./consts";
import { getCutScenesForBook } from "./getCutScenesForBook";
import "./styles/cutscene-video.css";

export const dealWithCutScenes = ({ currentChapter, currentParagraph }) => {
  const cutscenesDefined = getCutScenesForBook();
  console.log("cut scenes got", cutscenesDefined);
  // const cutScenes = document.querySelectorAll<HTMLElement>(".cut-scene");
  // cutScenes.forEach((cutScene) => {
  //   cutScene.style.display = "none";
  // });
  const cutSceneToApply = cutscenesDefined.find((cutscene) => {
    return cutscene.chapter === currentChapter && cutscene.paragraph === currentParagraph;
  });
  console.log("cut scene to apply", cutSceneToApply);
  if (cutSceneToApply) {
    const cutsceneVideo = document.getElementById("cutscene-video") as HTMLVideoElement;
    const cutsceneText = document.getElementById("cutscene-text") as HTMLElement; // Get the text element

    // Ensure video and text are reset if function is called again while playing/fading
    cutsceneVideo.style.visibility = "hidden";
    cutsceneVideo.style.opacity = "0";
    cutsceneVideo.style.transition = "opacity 4s ease-in-out";
    cutsceneVideo.onended = null; // Remove previous video listener
    cutsceneText.style.transition = "opacity 4s ease-in-out";
    cutsceneText.style.visibility = "hidden"; // Reset text visibility
    cutsceneText.style.opacity = "0"; // Reset text opacity
    cutsceneText.textContent = ""; // Clear text content

    // --- Escape Key Handler (Declare before use) ---
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        fadeOutVideo();
      }
    };

    document.removeEventListener("keydown", handleEscape); // Now the declaration is before this line

    // --- Fade Out Logic ---
    const fadeOutVideo = () => {
      cutsceneVideo.style.transition = "opacity 2s ease-in-out";
      cutsceneVideo.style.opacity = "0";
      cutsceneText.style.transition = "opacity 2s ease-in-out";
      cutsceneText.style.opacity = "0"; // Fade out text too

      // Use transitionend event to set visibility hidden *after* fade
      // We only need one listener, video transition is sufficient
      cutsceneVideo.addEventListener(
        "transitionend",
        () => {
          cutsceneVideo.style.visibility = "hidden";
          cutsceneText.style.visibility = "hidden"; // Hide text after fade
          cutsceneVideo.pause(); // Stop video playback if escaped
          cutsceneVideo.currentTime = 0; // Optional: Reset video time
        },
        { once: true }, // Ensure listener runs only once
      );
      document.removeEventListener("keydown", handleEscape); // Clean up listener
    };

    // --- Setup and Play ---
    cutsceneText.textContent = cutSceneToApply.text; // Set the text content
    cutsceneVideo.src = `/${CURRENT_BOOK}/${cutSceneToApply.file}`;
    cutsceneVideo.load();

    // Add a listener to schedule the fade out 4 seconds before the end
    const scheduleFadeOut = () => {
      if (cutsceneVideo.duration && cutsceneVideo.duration > 2) {
        const fadeStartTime = cutsceneVideo.duration - 2;
        const checkTime = () => {
          if (cutsceneVideo.currentTime >= fadeStartTime) {
            fadeOutVideo();
            cutsceneVideo.removeEventListener("timeupdate", checkTime);
          }
        };
        cutsceneVideo.addEventListener("timeupdate", checkTime);
      }
    };

    cutsceneVideo.addEventListener("loadedmetadata", scheduleFadeOut);

    if (cutSceneToApply.delayInMs) {
      setTimeout(() => {
        cutsceneVideo
          .play()
          .then(() => {
            // Start fade-in *after* play begins successfully
            cutsceneVideo.style.visibility = "visible";
            if (cutSceneToApply.text.trim() !== "") {
              cutsceneText.style.visibility = "visible"; // Make text visible
            }

            // Use requestAnimationFrame to ensure visibility change is applied before opacity transition
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // Double RAF for robustness in some browsers
                cutsceneVideo.style.opacity = "1";
                if (cutSceneToApply.text.trim() !== "") {
                  cutsceneText.style.opacity = "1"; // Fade in text
                }
              });
            });

            // Add listeners
            cutsceneVideo.onended = fadeOutVideo; // Fade out when naturally finished
            document.addEventListener("keydown", handleEscape); // Listen for Escape key
          })
          .catch((error) => {
            console.error("Video play failed:", error);
            // Handle error - maybe hide video and text immediately
            cutsceneVideo.style.visibility = "hidden";
            cutsceneVideo.style.opacity = "0";
            cutsceneText.style.visibility = "hidden"; // Hide text on error
            cutsceneText.style.opacity = "0";
          });
      }, cutSceneToApply.delayInMs);
    } else {
      cutsceneVideo
        .play()
        .then(() => {
          // Start fade-in *after* play begins successfully
          cutsceneVideo.style.visibility = "visible";
          if (cutSceneToApply.text.trim() !== "") {
            cutsceneText.style.visibility = "visible"; // Make text visible
          }

          // Use requestAnimationFrame to ensure visibility change is applied before opacity transition
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Double RAF for robustness in some browsers
              cutsceneVideo.style.opacity = "1";
              if (cutSceneToApply.text.trim() !== "") {
                cutsceneText.style.opacity = "1"; // Fade in text
              }
            });
          });

          // Add listeners
          cutsceneVideo.onended = fadeOutVideo; // Fade out when naturally finished
          document.addEventListener("keydown", handleEscape); // Listen for Escape key
        })
        .catch((error) => {
          console.error("Video play failed:", error);
          // Handle error - maybe hide video and text immediately
          cutsceneVideo.style.visibility = "hidden";
          cutsceneVideo.style.opacity = "0";
          cutsceneText.style.visibility = "hidden"; // Hide text on error
          cutsceneText.style.opacity = "0";
        });
    }
  }
};
