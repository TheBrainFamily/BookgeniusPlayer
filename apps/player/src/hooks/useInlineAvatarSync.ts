import { useEffect, useRef } from "react";
import { useAvatarGenerationStore } from "@player/stores/avatarGeneration.store";
import { useBookConvex } from "@player/context/BookConvexContext";
import { getAvatarSource } from "@player/helpers/svgAvatars";

export function useInlineAvatarSync() {
  const { optimisticAvatars } = useAvatarGenerationStore();
  const { characters, charactersData } = useBookConvex();
  const previousAvatarUrlsRef = useRef<Map<string, string>>(new Map());
  const knownSlugsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentAvatarUrls = new Map<string, string>();
    const currentSlugs = new Set<string>();

    characters.forEach((char) => {
      const slug = char.slug.toLowerCase();
      currentSlugs.add(slug);
      const optimisticUrl = optimisticAvatars[slug];
      const serverUrl = char.avatar?.url || char.listens?.url;
      const url = optimisticUrl || serverUrl;

      if (url) {
        currentAvatarUrls.set(slug, url);
      }
    });

    const changedSlugs: string[] = [];
    const newSlugs: string[] = [];

    currentAvatarUrls.forEach((url, slug) => {
      const previousUrl = previousAvatarUrlsRef.current.get(slug);
      if (previousUrl !== url) {
        changedSlugs.push(slug);
      }
    });

    currentSlugs.forEach((slug) => {
      if (!knownSlugsRef.current.has(slug)) {
        newSlugs.push(slug);
      }
    });

    previousAvatarUrlsRef.current.forEach((_, slug) => {
      if (!currentAvatarUrls.has(slug)) {
        changedSlugs.push(slug);
      }
    });

    const emptyShellSlugs: string[] = [];
    document.querySelectorAll<HTMLElement>(".inline-avatar:not(:has(img))").forEach((shell) => {
      const slug = shell.dataset.character?.toLowerCase();
      if (slug && currentSlugs.has(slug)) {
        emptyShellSlugs.push(slug);
      }
    });

    const slugsToUpdate = [...new Set([...changedSlugs, ...newSlugs, ...emptyShellSlugs])];

    if (slugsToUpdate.length === 0) {
      previousAvatarUrlsRef.current = currentAvatarUrls;
      knownSlugsRef.current = currentSlugs;
      return;
    }

    slugsToUpdate.forEach((slugLower) => {
      const char = characters.find((c) => c.slug.toLowerCase() === slugLower);
      const charData = charactersData.find((c) => c.slug.toLowerCase() === slugLower);
      const originalSlug = char?.slug || charData?.slug || slugLower;
      const optimisticUrl = optimisticAvatars[slugLower];
      const serverUrl = char?.avatar?.url || char?.listens?.url;
      const displayName = charData?.characterName;

      let newUrl = optimisticUrl || serverUrl;
      if (!newUrl && displayName) {
        newUrl = getAvatarSource({ slug: originalSlug, characterName: displayName, bookSlug: "", infoPerChapter: [] });
      }

      if (!newUrl) return;

      const emptyShells = document.querySelectorAll<HTMLElement>(`.inline-avatar[data-character="${originalSlug}"]:not(:has(img))`);
      emptyShells.forEach((shell) => {
        const img = document.createElement("img");
        img.src = newUrl;
        img.alt = displayName || originalSlug;
        img.classList.add("absolute", "top-0", "left-0", "w-full", "h-full", "object-cover", "rounded-full");
        shell.title = displayName || originalSlug;
        shell.appendChild(img);
      });

      const inlineAvatars = document.querySelectorAll<HTMLImageElement>(`.inline-avatar[data-character="${originalSlug}"] img`);
      inlineAvatars.forEach((img) => {
        if (img.src !== newUrl) {
          img.src = newUrl;
        }
      });
    });

    previousAvatarUrlsRef.current = currentAvatarUrls;
    knownSlugsRef.current = currentSlugs;
  }, [optimisticAvatars, characters, charactersData]);
}
