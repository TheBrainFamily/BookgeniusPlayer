import { useEffect, useRef, useCallback } from "react";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useNativeMusic } from "@player-native/contexts/NativeShellContext";

const FADE_IN_MS = 2500;
const FADE_OUT_MS = 2000;
const FADE_STEPS = 50;

export function NativeMusicPlayer() {
  const music = useNativeMusic();

  const currentPlayerRef = useRef<AudioPlayer | null>(null);
  const outgoingPlayerRef = useRef<AudioPlayer | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const fadeIntervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);

  const clearAllFadeIntervals = useCallback(() => {
    fadeIntervalsRef.current.forEach((interval) => clearInterval(interval));
    fadeIntervalsRef.current = [];
  }, []);

  const fadeVolume = useCallback(
    (
      player: AudioPlayer,
      fromVolume: number,
      toVolume: number,
      durationMs: number,
      onComplete?: () => void,
    ) => {
      const volumeDiff = toVolume - fromVolume;
      if (Math.abs(volumeDiff) < 0.01) {
        player.volume = toVolume;
        onComplete?.();
        return;
      }

      const stepDuration = durationMs / FADE_STEPS;
      let currentStep = 0;

      const interval = setInterval(() => {
        currentStep++;
        const progress = currentStep / FADE_STEPS;
        const eased = 1 - Math.pow(1 - progress, 2);
        const newVolume = fromVolume + volumeDiff * eased;

        try {
          player.volume = Math.max(0, Math.min(1, newVolume));
        } catch {
          clearInterval(interval);
          fadeIntervalsRef.current = fadeIntervalsRef.current.filter((i) => i !== interval);
          return;
        }

        if (currentStep >= FADE_STEPS) {
          clearInterval(interval);
          fadeIntervalsRef.current = fadeIntervalsRef.current.filter((i) => i !== interval);
          onComplete?.();
        }
      }, stepDuration);

      fadeIntervalsRef.current.push(interval);
    },
    [],
  );

  const loadAndPlayTrack = useCallback(
    async (url: string, targetVolume: number) => {
      console.log("[NativeMusicPlayer] Loading new track:", url);

      try {
        const newPlayer = createAudioPlayer(url);
        newPlayer.loop = true;
        newPlayer.volume = 0;

        if (currentPlayerRef.current) {
          const oldPlayer = currentPlayerRef.current;

          if (outgoingPlayerRef.current) {
            try {
              outgoingPlayerRef.current.pause();
              outgoingPlayerRef.current.release();
            } catch {}
          }

          outgoingPlayerRef.current = oldPlayer;

          fadeVolume(oldPlayer, oldPlayer.volume, 0, FADE_OUT_MS, () => {
            try {
              oldPlayer.pause();
              oldPlayer.release();
            } catch {}
            if (outgoingPlayerRef.current === oldPlayer) {
              outgoingPlayerRef.current = null;
            }
          });
        }

        currentPlayerRef.current = newPlayer;
        currentUrlRef.current = url;

        newPlayer.play();
        fadeVolume(newPlayer, 0, targetVolume, FADE_IN_MS);

        console.log("[NativeMusicPlayer] Track started, fading in:", url);
      } catch (error) {
        console.error("[NativeMusicPlayer] Failed to load track:", error);
      }
    },
    [fadeVolume],
  );

  const stopPlayback = useCallback(() => {
    if (currentPlayerRef.current) {
      const player = currentPlayerRef.current;
      fadeVolume(player, player.volume, 0, FADE_OUT_MS, () => {
        try {
          player.pause();
          player.release();
        } catch {}
        if (currentPlayerRef.current === player) {
          currentPlayerRef.current = null;
          currentUrlRef.current = null;
        }
      });
    }
  }, [fadeVolume]);

  useEffect(() => {
    const newUrl = music?.url ?? null;
    const isPlaying = music?.isPlaying ?? false;
    const targetVolume = music?.volume ?? 0.7;

    if (newUrl && isPlaying && newUrl !== currentUrlRef.current) {
      loadAndPlayTrack(newUrl, targetVolume);
    } else if (!isPlaying && currentPlayerRef.current) {
      stopPlayback();
    } else if (isPlaying && currentPlayerRef.current && newUrl === currentUrlRef.current) {
      const player = currentPlayerRef.current;
      if (Math.abs(player.volume - targetVolume) > 0.05) {
        fadeVolume(player, player.volume, targetVolume, 500);
      }
    }
  }, [music?.url, music?.isPlaying, music?.volume, loadAndPlayTrack, stopPlayback, fadeVolume]);

  useEffect(() => {
    return () => {
      clearAllFadeIntervals();
      try {
        currentPlayerRef.current?.release();
        outgoingPlayerRef.current?.release();
      } catch {}
    };
  }, [clearAllFadeIntervals]);

  return null;
}
