import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

import { useBookConvex } from "@player/context/BookConvexContext";
import { useLocation } from "@player/state/LocationContext";
import {
  useEditorToolbar,
  type CurrentBackgroundCue,
  type CurrentMusicCue,
} from "@player/stores/editorToolbar.store";

export function useCurrentMediaCues() {
  const { book } = useBookConvex();
  const { location } = useLocation();
  const { setCurrentBackground, setCurrentMusic } = useEditorToolbar();

  const bookPath = book?.path ?? "";

  const backgroundCues = useQuery(api.backgroundCues.listByBook, bookPath ? { bookPath } : "skip");
  const musicCues = useQuery(api.musicCues.listByBook, bookPath ? { bookPath } : "skip");

  const { currentChapter, currentParagraph } = location;

  const currentBackground = useMemo<CurrentBackgroundCue | null>(() => {
    if (!backgroundCues || backgroundCues.length === 0) return null;

    const applicable = backgroundCues.filter(
      (cue) =>
        cue.chapter < currentChapter ||
        (cue.chapter === currentChapter && cue.paragraph <= currentParagraph),
    );

    if (applicable.length === 0) return null;

    const sorted = [...applicable].sort((a, b) => {
      if (b.chapter !== a.chapter) return b.chapter - a.chapter;
      return b.paragraph - a.paragraph;
    });

    const current = sorted[0];
    const currentIndex = backgroundCues.findIndex((c) => c._id === current._id);
    const nextCue = backgroundCues[currentIndex + 1];

    return {
      cueId: current._id,
      fileBasename: current.fileBasename,
      startChapter: current.chapter,
      startParagraph: current.paragraph,
      endChapter: nextCue?.chapter ?? 999,
      endParagraph: nextCue?.paragraph ?? 999,
      backgroundColor: current.backgroundColor,
      textColor: current.textColor,
      url: current.url,
      previewUrl: current.previewWebpUrl ?? current.previewMp4Url,
    };
  }, [backgroundCues, currentChapter, currentParagraph]);

  const currentMusic = useMemo<CurrentMusicCue | null>(() => {
    if (!musicCues || musicCues.length === 0) return null;

    const applicable = musicCues.filter(
      (cue) =>
        cue.chapter < currentChapter ||
        (cue.chapter === currentChapter && cue.paragraph <= currentParagraph),
    );

    if (applicable.length === 0) return null;

    const sorted = [...applicable].sort((a, b) => {
      if (b.chapter !== a.chapter) return b.chapter - a.chapter;
      return b.paragraph - a.paragraph;
    });

    const current = sorted[0];
    const currentIndex = musicCues.findIndex((c) => c._id === current._id);
    const nextCue = musicCues[currentIndex + 1];

    return {
      cueId: current._id,
      fileBasename: current.fileBasename,
      chapter: current.chapter,
      paragraph: current.paragraph,
      endChapter: nextCue?.chapter ?? 999,
      endParagraph: nextCue?.paragraph ?? 999,
      title: current.title,
      artist: current.artist,
      coverUrl: current.coverUrl,
      url: current.url,
    };
  }, [musicCues, currentChapter, currentParagraph]);

  useEffect(() => {
    setCurrentBackground(currentBackground);
  }, [currentBackground, setCurrentBackground]);

  useEffect(() => {
    setCurrentMusic(currentMusic);
  }, [currentMusic, setCurrentMusic]);

  return { currentBackground, currentMusic, currentChapter, currentParagraph };
}
