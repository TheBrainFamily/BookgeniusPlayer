/**
 * NativeShellBridge
 *
 * Bridges the web player state to React Native via postMessage.
 * Sends updates for:
 * - Background video URLs (so native can play them)
 * - Music URLs and playback state (so native can use expo-audio)
 * - Character state (speaking/listening for native sidebar)
 */

import { useEffect, useRef } from "react";
import { useLocation } from "@player/state/LocationContext";
import { useBookConvex } from "@player/context/BookConvexContext";
import {
  useNativeShell,
  sendToNativeShell,
  sendModalState,
  type BackgroundUpdatePayload,
  type MusicUpdatePayload,
  type CharacterStatePayload,
} from "@player/context/NativeShellContext";
import { getBookAssetUrl } from "@player/utils/assetUrls";
import { useModalCoordinator } from "@player/stores/modalCoordinator.store";

export function NativeShellBridge() {
  const isNativeShell = useNativeShell();
  const { location } = useLocation();
  const { backgroundsForBook, backgroundSongsForBook, charactersData } = useBookConvex();

  // Track last sent values to avoid redundant messages
  const lastBackgroundRef = useRef<string | null>(null);
  const lastMusicRef = useRef<string | null>(null);
  const lastCharacterStateRef = useRef<string | null>(null);

  // Send background updates to native
  useEffect(() => {
    if (!isNativeShell) return;

    // Find the current background based on location
    // Backgrounds are sorted by chapter/paragraph, find the last one that starts before current location
    const currentBackground = backgroundsForBook
      .filter((bg) => {
        return (
          bg.chapter < location.currentChapter ||
          (bg.chapter === location.currentChapter && bg.paragraph <= location.currentParagraph)
        );
      })
      .sort((a, b) => {
        if (a.chapter !== b.chapter) return b.chapter - a.chapter;
        return b.paragraph - a.paragraph;
      })[0];

    if (!currentBackground) return;

    const url = getBookAssetUrl(currentBackground.file) || currentBackground.file;

    const payload: BackgroundUpdatePayload = {
      url,
      chapterStart: currentBackground.chapter,
      paragraphStart: currentBackground.paragraph,
      // End is the next background's start or infinity
      chapterEnd: currentBackground.chapter,
      paragraphEnd: 999,
    };

    const payloadStr = JSON.stringify(payload);
    if (payloadStr !== lastBackgroundRef.current) {
      lastBackgroundRef.current = payloadStr;
      sendToNativeShell("BACKGROUND_UPDATE", payload);
    }
  }, [isNativeShell, location.currentChapter, location.currentParagraph, backgroundsForBook]);

  // Send music updates to native
  useEffect(() => {
    if (!isNativeShell) return;

    // Find the current song based on location
    const currentSong = backgroundSongsForBook
      .filter((song) => {
        return (
          song.chapter < location.currentChapter ||
          (song.chapter === location.currentChapter && song.paragraph <= location.currentParagraph)
        );
      })
      .sort((a, b) => {
        if (a.chapter !== b.chapter) return b.chapter - a.chapter;
        return b.paragraph - a.paragraph;
      })[0];

    const songUrl = currentSong?.files?.[0] || null;
    const resolvedUrl = songUrl ? getBookAssetUrl(songUrl) || songUrl : null;

    const payload: MusicUpdatePayload = {
      url: resolvedUrl,
      isPlaying: !!resolvedUrl,
      volume: 1.0,
      chapterStart: currentSong?.chapter ?? 0,
      paragraphStart: currentSong?.paragraph ?? 0,
      chapterEnd: currentSong?.chapter ?? 0,
      paragraphEnd: 999,
    };

    const payloadStr = JSON.stringify(payload);
    if (payloadStr !== lastMusicRef.current) {
      lastMusicRef.current = payloadStr;
      sendToNativeShell("MUSIC_UPDATE", payload);
    }
  }, [isNativeShell, location.currentChapter, location.currentParagraph, backgroundSongsForBook]);

  // Send character state updates to native
  useEffect(() => {
    if (!isNativeShell) return;

    // Get characters visible at current location
    const visibleCharacters = charactersData
      .filter((char) => {
        // Check if character has appeared by this point
        return char.infoPerChapter.some((info) => {
          if (info.chapter < location.currentChapter) return true;
          if (info.chapter === location.currentChapter) {
            const allParagraphs = [
              ...info.paragraphsWhereSpotted,
              ...info.paragraphsWhereTalking,
              ...(info.paragraphsWhereEnters ?? []),
            ];
            return allParagraphs.some((p) => p <= location.currentParagraph);
          }
          return false;
        });
      })
      .map((char) => {
        // Find if character is speaking or listening at current location
        const currentChapterInfo = char.infoPerChapter.find(
          (info) => info.chapter === location.currentChapter,
        );

        const isSpeaking =
          currentChapterInfo?.paragraphsWhereTalking.includes(location.currentParagraph) ?? false;
        const isListening =
          currentChapterInfo?.paragraphsWhereSpotted.includes(location.currentParagraph) ?? false;

        // Get avatar URL for current state
        const avatarUrl = isSpeaking
          ? char.media?.speaksUrl || char.media?.listensUrl || ""
          : char.media?.listensUrl || "";

        return { slug: char.slug, name: char.characterName, avatarUrl, isSpeaking, isListening };
      });

    const payload: CharacterStatePayload = {
      characters: visibleCharacters,
      currentChapter: location.currentChapter,
      currentParagraph: location.currentParagraph,
    };

    const payloadStr = JSON.stringify(payload);
    if (payloadStr !== lastCharacterStateRef.current) {
      lastCharacterStateRef.current = payloadStr;
      sendToNativeShell("CHARACTER_STATE_UPDATE", payload);
    }
  }, [isNativeShell, location.currentChapter, location.currentParagraph, charactersData]);

  const { activeModalIds } = useModalCoordinator();
  const lastModalStateRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isNativeShell) return;

    const hasOpenModal = activeModalIds.size > 0;
    if (hasOpenModal !== lastModalStateRef.current) {
      lastModalStateRef.current = hasOpenModal;
      sendModalState(hasOpenModal);
    }
  }, [isNativeShell, activeModalIds]);

  return null;
}
