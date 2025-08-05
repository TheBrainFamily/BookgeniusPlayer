import { useLocation } from "@/state/LocationContext";
import { useCurrentSpeakers } from "./useCurrentSpeakers";
import { useEffect, useMemo } from "react";
import { getCharactersData } from "@/genericBookDataGetters/getCharactersData";
import { getBookData } from "@/genericBookDataGetters/getBookData";
import { getListeningMediaFilePathForName, getTalkingMediaFilePathForName } from "@/utils/getFilePathsForName";

function swapVideo(container: HTMLElement, newSrc: string) {
  // find the current visible <video>
  const current = container.querySelector<HTMLVideoElement>("video.visible");
  if (!current || current.src.endsWith(newSrc)) return;

  // prepare the incoming clone
  const clone = current.cloneNode(true) as HTMLVideoElement;
  clone.src = newSrc;
  clone.preload = "auto";
  clone.classList.remove("visible");
  clone.classList.add("hidden");
  container.appendChild(clone);

  // once it's buffered...
  clone.addEventListener(
    "canplaythrough",
    () => {
      // cross-fade
      current.classList.replace("visible", "hidden");
      clone.classList.replace("hidden", "visible");

      // remove old after transition
      setTimeout(() => {
        container.removeChild(current);
      }, 400);
    },
    { once: true },
  );
}

export function usePlayCharacterSelect() {
  const { location } = useLocation();
  const bookData = useMemo(() => getBookData(), []);
  const allCharacters = useMemo(() => getCharactersData(), []);
  const isPlayFormat = useMemo(() => bookData.metadata.bookForm === "play", [bookData]);
  const bookSlug = useMemo(() => bookData.slug, [bookData]);

  const currentSpeakers = useCurrentSpeakers(location, allCharacters, isPlayFormat);
  console.log("currentSpeakers", currentSpeakers);
  useEffect(() => {
    console.log("usePlayCharacterSelect", currentSpeakers);
    // Get all elements with inline-avatar class
    const avatars = document.querySelectorAll<HTMLElement>(".avatar-container");
    avatars.forEach((container) => {
      const child = container.querySelector<HTMLElement>(".inline-avatar");
      if (!child) return;

      const slug = child.dataset.character;
      if (!slug) return;

      const isSpeaking = currentSpeakers.includes(slug);
      const targetSrc = isSpeaking ? getTalkingMediaFilePathForName(slug, bookSlug) : getListeningMediaFilePathForName(slug, bookSlug);

      swapVideo(container, targetSrc);
    });
  }, [currentSpeakers, allCharacters, bookSlug]);
}
