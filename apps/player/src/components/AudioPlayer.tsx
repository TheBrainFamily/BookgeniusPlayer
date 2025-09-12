import { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, SkipBack, ListMusic, BookHeadphones, Volume2, VolumeX, Download } from "lucide-react";
import { motion, AnimatePresence, Variants, Transition, Easing } from "motion/react";
import useLocalStorageState from "use-local-storage-state";
import { useTranslation } from "react-i18next";

import {
  getMasterVolume,
  setMasterVolume,
  setBackgroundVolume,
  initAudioContext,
  TrackState,
  getCurrentTrackPosition,
  pauseCurrentTrack,
  resumeCurrentTrack,
  getCurrentSectionTracks,
  setCurrentTrackPosition,
  getCurrentTrackId,
  getCurrentTrackIndexInSection,
  transitionToTrack,
} from "@player/audio-crossfader";
import { stopAudiobook, playAudiobook } from "@player/hooks/useAudiobookTracks";
import { Slider } from "@player/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@player/components/ui/tooltip";
import { cn } from "@player/lib/utils";
import { OptionalElement } from "./OptionalElement";
import { getBookData } from "@player/genericBookDataGetters/getBookData";
import { CoverArt } from "./CoverArt";
import { useOptionalElementVisibility } from "@player/stores/elementVisibility.store";
import { getBackgroundSongsForBook } from "@player/genericBookDataGetters/getBackgroundSongsForBook";

const AudioPlayer = () => {
  const { t } = useTranslation();
  const { hasAudiobook, slug } = getBookData();

  const isInitialLoad = useRef(true);

  const [volume, setVolume] = useLocalStorageState("volume", { defaultValue: getMasterVolume() ?? 0.5 });
  const [balance, setBalance] = useLocalStorageState("balance", { defaultValue: 0.5 });
  const [isMuted, setIsMuted] = useLocalStorageState("isMuted", { defaultValue: false });

  const [isPlayingAudioBook, setIsPlayingAudiobook] = useState(hasAudiobook);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isBigPlayerOpen, setIsBigPlayerOpen] = useState(false);
  const [currentTrackData, setCurrentTrackData] = useState<TrackState | null>(null);
  const [showSongNotification, setShowSongNotification] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<{ id: string; title: string; duration: number }[]>([]);
  const [currentTrackIdFromState, setCurrentTrackIdFromState] = useState<string | null>(null);
  const areElementsVisible = useOptionalElementVisibility();
  const [hasBackgroundSongs, setHasBackgroundSongs] = useState(false);

  useEffect(() => {
    if (!areElementsVisible) {
      setIsBigPlayerOpen(false);
      setIsVolumeOpen(false);
    }
  }, [areElementsVisible]);

  useEffect(() => {
    try {
      const songs = getBackgroundSongsForBook();
      const available = Array.isArray(songs) && songs.some((s) => Array.isArray(s.files) && s.files.length > 0);
      setHasBackgroundSongs(available);
    } catch {
      // Not loaded or unavailable
      setHasBackgroundSongs(false);
    }
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      pauseCurrentTrack();
    } else {
      resumeCurrentTrack();
    }

    setIsPlaying(!isPlaying);
  };

  const handleProgressChange = (value: number[]) => {
    const newTime = value[0];
    setCurrentTime(newTime);
    setCurrentTrackPosition(newTime);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === null || typeof time === "undefined" || time < 0) {
      time = 0;
    }

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  useEffect(() => {
    if (!isPlaying || !isBigPlayerOpen) return;
    // Immediate update when player opens, using requestAnimationFrame to avoid blocking
    requestAnimationFrame(() => {
      const position = getCurrentTrackPosition();
      if (position !== null) {
        setCurrentTime(position);
      }
    });

    const timer = setInterval(() => {
      const position = getCurrentTrackPosition();
      if (position !== null) {
        setCurrentTime(position);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isPlaying, isBigPlayerOpen]);

  useEffect(() => {
    const handlePlaylistChange = (event: CustomEvent<{ id: string; title: string; duration: number }[] | null>) => {
      console.log("AudioPlayer: Received playlist change event", event.detail);
      setPlaylistTracks(event.detail || []);
      if (!event.detail || event.detail.length === 0) {
        setShowSongNotification(false);
        setIsBigPlayerOpen(false);
        setIsVolumeOpen(false);
      }
    };

    let notificationTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSongTransition = (event: CustomEvent<TrackState | null>) => {
      const newCurrentTrack = event.detail;
      console.log("AudioPlayer: Song transition event received", newCurrentTrack);

      setCurrentTrackData(newCurrentTrack);
      setCurrentTrackIdFromState(getCurrentTrackId());
      setCurrentTime(0);

      // Check if we should auto-play the new track
      // Don't auto-play if muted OR if music was paused
      if (isMuted || !isPlaying) {
        // Keep the track paused
        pauseCurrentTrack();
        setIsPlaying(false);
      } else {
        // Music was playing and not muted - start the new track
        setIsPlaying(true);
        resumeCurrentTrack();

        if (!isInitialLoad.current) {
          if (notificationTimer) {
            clearTimeout(notificationTimer);
          }

          setShowSongNotification(true);

          notificationTimer = setTimeout(() => {
            setShowSongNotification(false);
          }, 6000);
        }
      }

      if (isInitialLoad.current) {
        isInitialLoad.current = false;
        return;
      }
    };

    window.addEventListener("songTransition", handleSongTransition);
    window.addEventListener("playlistChange", handlePlaylistChange);

    return () => {
      window.removeEventListener("songTransition", handleSongTransition);
      window.removeEventListener("playlistChange", handlePlaylistChange);

      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }
    };
  }, [isMuted, isPlaying]);

  // Determine current track position within playlist to disable prev/next at boundaries
  const currentTrackIndexInPlaylist = playlistTracks.findIndex((track) => track.id === currentTrackIdFromState);
  const isFirstTrack = playlistTracks.length > 0 && currentTrackIndexInPlaylist === 0;
  const isLastTrack = playlistTracks.length > 0 && currentTrackIndexInPlaylist === playlistTracks.length - 1;

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];

    setVolume(newVolume);
    setMasterVolume(newVolume);

    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
      resumeCurrentTrack();
      setIsPlaying(true);
    } else if (newVolume === 0 && !isMuted) {
      setIsMuted(true);
      pauseCurrentTrack();
      setIsPlaying(false);
    }
  };

  const handleBalanceChange = (value: number[]) => {
    const newVolume = value[0];

    setBalance(newVolume);
    setBackgroundVolume(newVolume);
  };

  const toggleMute = () => {
    if (isMuted) {
      setMasterVolume(volume);
      setIsPlaying(true);
      resumeCurrentTrack();
    } else {
      setMasterVolume(0);
      pauseCurrentTrack();
      setIsPlaying(false);
    }

    setIsMuted(!isMuted);
  };

  const toggleAudiobookState = () => {
    if (isPlayingAudioBook) {
      setIsPlayingAudiobook(false);
      stopAudiobook();
    } else {
      initAudioContext();
      setIsPlayingAudiobook(true);
      playAudiobook();
    }
  };

  const skipToNext = async () => {
    const currentTracks = getCurrentSectionTracks();
    const currentIndex = getCurrentTrackIndexInSection();

    if (!currentTracks?.length) {
      console.log("Cannot go to next: no playlist");
      return;
    }

    const nextIndex = (currentIndex + 1) % currentTracks.length;
    const nextTrackId = currentTracks[nextIndex];

    setCurrentTrackIdFromState(nextTrackId);

    await transitionToTrack(nextTrackId, { manual: true });
  };

  const skipToPrevious = async () => {
    const currentTracks = getCurrentSectionTracks();
    const currentIndex = getCurrentTrackIndexInSection();

    if (!currentTracks?.length) {
      console.log("Cannot go to previous: no playlist");
      return;
    }

    const prevIndex = (currentIndex - 1 + currentTracks.length) % currentTracks.length;
    const prevTrackId = currentTracks[prevIndex];

    setCurrentTrackIdFromState(prevTrackId);

    await transitionToTrack(prevTrackId, { manual: true });
  };

  const handleDownloadTrack = (id: string, title: string) => {
    if (!id) return;

    const trackUrl = `/${slug}/${id}.mp3`;
    const link = document.createElement("a");
    link.href = trackUrl;
    link.download = `${title}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Hide the audio player UI entirely when the book has no background songs
  if (!hasBackgroundSongs) {
    return null;
  }

  return (
    <>
      <OptionalElement className="relative origin-top-left">
        <div className="audio-player bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 px-2 flex items-center gap-1 relative">
          {/* Volume Control Button with Dropdown */}
          <div
            onMouseEnter={() => {
              setIsVolumeOpen(true);
              setIsBigPlayerOpen(false);
            }}
            onMouseLeave={() => setIsVolumeOpen(false)}
          >
            <motion.button
              onTouchEnd={(e) => {
                e.preventDefault(); // Prevent mouse events from firing
                setIsVolumeOpen((prev) => !prev);
                setIsBigPlayerOpen(false);
              }}
              onMouseUp={(e) => {
                // Only handle mouse events if no touch capability or if it's actually a mouse click
                if (!("ontouchstart" in window) || e.detail > 0) {
                  toggleMute();
                }
              }}
              className="p-2 my-1 hover:text-white rounded-full cursor-pointer"
              whileHover="hover"
              whileTap="tap"
              variants={variants.buttonHover}
            >
              <AnimatePresence mode="wait" initial={false}>
                {isMuted ? (
                  <motion.div key="muted" variants={variants.iconFadeScale}>
                    <VolumeX className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                  </motion.div>
                ) : (
                  <motion.div key="unmuted" variants={variants.iconFadeScale}>
                    <Volume2 className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
            {/* Invisible bridge to cover the gap */}
            {isVolumeOpen && <div className="absolute top-full left-0 w-48 h-2 z-5" />}
            <AnimatePresence>
              {isVolumeOpen && (
                <motion.div
                  className="volume-control bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 absolute top-full left-0 mt-2 z-10 px-4 pt-2 pb-3 w-48 flex gap-3 flex-col"
                  variants={variants.dropdownContainer}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <motion.div variants={variants.volumeMenuItem} initial="initial" animate="animate" transition={{ delay: 0.05 }}>
                    <div className="flex justify-between text-xs my-2">{t("volume")}</div>
                    <Slider value={[isMuted ? 0 : volume]} min={0} max={1} step={0.01} onValueChange={handleVolumeChange} variant="secondary" />
                    <div className="flex justify-between text-xs mt-2">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </motion.div>

                  {hasAudiobook && (
                    <motion.div variants={variants.volumeMenuItem} initial="initial" animate="animate" transition={{ delay: 0.1 }}>
                      <div className="flex justify-between text-xs my-2">{t("balance")}</div>
                      <Slider value={[balance]} min={0} max={1} step={0.01} onValueChange={handleBalanceChange} variant="secondary" />
                      <div className="flex justify-between text-xs mt-2">
                        <span>{t("audiobook")}</span>
                        <span>{t("music")}</span>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Audiobook Toggle Button */}
          {hasAudiobook && (
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  onClick={toggleAudiobookState}
                  className="p-2 hover:text-white relative rounded-full cursor-pointer"
                  whileHover="hover"
                  whileTap="tap"
                  variants={variants.buttonHover}
                >
                  <BookHeadphones className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                  <motion.div className="absolute bottom-0 right-0">{isPlayingAudioBook ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}</motion.div>
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>{isPlayingAudioBook ? t("stop_audiobook") : t("play_audiobook")}</TooltipContent>
            </Tooltip>
          )}

          {/* Big Player Button with Dropdown */}
          <div
            onMouseEnter={() => {
              // Only on desktop
              if (window.matchMedia("(hover: hover)").matches) {
                setIsVolumeOpen(false);
                setIsBigPlayerOpen(true);
                // currentTime is already being updated by useEffect interval when player opens
              }
            }}
            onMouseLeave={() => {
              if (window.matchMedia("(hover: hover)").matches) {
                setIsBigPlayerOpen(false);
              }
            }}
          >
            <motion.button
              onTouchEnd={(e) => {
                e.preventDefault();
                setIsVolumeOpen(false);
                setIsBigPlayerOpen((prev) => !prev);
                // currentTime will be updated by useEffect interval when player opens
              }}
              onMouseDown={(e) => {
                // Only handle if not a touch device
                if (e.detail > 0) {
                  setIsVolumeOpen(false);
                  setIsBigPlayerOpen((prev) => !prev);
                  // currentTime will be updated by useEffect interval when player opens
                }
              }}
              className="p-2 my-1 hover:text-white rounded-full cursor-pointer"
              whileHover="hover"
              whileTap="tap"
              variants={variants.buttonHover}
            >
              <ListMusic className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
            </motion.button>
            {/* Invisible bridge to cover the gap */}
            {isBigPlayerOpen && <div className="absolute top-full left-0 w-full min-w-[240px] sm:min-w-2xs md:min-w-xs h-2 z-5" />}
            <AnimatePresence>
              {isBigPlayerOpen && (
                <motion.div
                  className="player-controls bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 px-4 py-2 absolute top-full left-0 mt-2 z-10 min-w-[240px] sm:min-w-xs player-controls-layout"
                  variants={variants.dropdownContainer}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <div className="player-left">
                    <motion.div className="flex justify-center pt-4 mb-4" variants={variants.popUpItem} initial="closed" animate="open">
                      <div className="relative group w-26 h-26 md:w-32 md:h-32">
                        <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-white/40 shadow-2xl backdrop-blur-sm bg-white/15">
                          <CoverArt src={currentTrackData?.coverArtUrl} />
                        </div>
                      </div>
                    </motion.div>

                    <motion.div className="text-md md:text-lg mb-4 text-center current-track-title" variants={variants.popUpItem} initial="closed" animate="open">
                      {currentTrackData?.title}
                    </motion.div>
                  </div>
                  <div className="player-right p-1">
                    <motion.div className="mb-2 music-progress-bar" variants={variants.popUpItem} initial="closed" animate="open">
                      <div className="w-full group hover:opacity-100">
                        <Slider value={[currentTime]} min={0} max={currentTrackData?.duration || 100} step={0.1} onValueChange={handleProgressChange} variant="secondary" />
                      </div>
                    </motion.div>

                    <motion.div className="flex justify-between text-xs mb-4 music-progress-bar-labels" variants={variants.popUpItem} initial="closed" animate="open">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(currentTrackData?.duration)}</span>
                    </motion.div>

                    <motion.div className="flex justify-center items-center gap-8 mb-4 relative" variants={variants.popUpItem} initial="closed" animate="open">
                      {playlistTracks.length > 1 && (
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isFirstTrack) return;
                            skipToPrevious();
                          }}
                          className={cn("hover:text-white/80 p-2 rounded-full", isFirstTrack ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}
                          whileHover="hover"
                          whileTap="tap"
                          variants={variants.navButtonHover}
                          title="Previous track"
                          disabled={isFirstTrack}
                        >
                          <SkipBack className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                        </motion.button>
                      )}

                      <motion.div variants={variants.playButtonHover} whileTap="tap">
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePlay();
                          }}
                          className="hover:text-white bg-white/40 rounded-full p-3 relative z-10 cursor-pointer"
                          whileHover="hover"
                          whileTap="tap"
                          variants={variants.playButtonHover}
                          initial="initial"
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            {isPlaying ? (
                              <motion.div key="pause" variants={variants.iconRotatePause} initial="initial" animate="animate" exit="exit">
                                <Pause className="w-6 h-6" />
                              </motion.div>
                            ) : (
                              <motion.div key="play" variants={variants.iconRotatePlay} initial="initial" animate="animate" exit="exit">
                                <Play className="w-6 h-6" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      </motion.div>

                      {playlistTracks.length > 1 && (
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isLastTrack) return;
                            skipToNext();
                          }}
                          className={cn("hover:text-white/80 p-2 rounded-full", isLastTrack ? "opacity-40 cursor-not-allowed" : "cursor-pointer")}
                          whileHover="hover"
                          whileTap="tap"
                          variants={variants.navButtonHover}
                          title="Next track"
                          disabled={isLastTrack}
                        >
                          <SkipForward className="w-[14px] h-[14px] md:w-4 md:h-4 lg:w-5 lg:h-5" />
                        </motion.button>
                      )}
                    </motion.div>

                    {playlistTracks.length > 0 && (
                      <motion.div className="space-y-2 pb-3" variants={variants.popUpItem} initial="closed" animate="open">
                        <div className="text-xs md:text-sm font-medium mb-2 playlist-header">Playlist:</div>
                        {playlistTracks.map((track) => (
                          <motion.div
                            key={track.id}
                            className={cn(
                              "flex items-center justify-between px-2 py-0 md:py-1 rounded-md cursor-pointer gap-2",
                              currentTrackIdFromState === track.id && "bg-white/10",
                            )}
                            variants={variants.trackItemHover}
                            whileHover="hover"
                            onClick={(e) => {
                              e.stopPropagation();
                              transitionToTrack(track.id, { manual: true });
                            }}
                          >
                            <span className={"text-sm md:text-md text-white/70 playlist-item-title"}>{track.title}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-white/70 playlist-item-duration">{formatTime(track.duration)}</span>
                              <button
                                className="text-white/70 hover:text-white p-2 rounded-full transition hover:bg-black/40 cursor-pointer"
                                title="Download track"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadTrack(track.id, track.title);
                                }}
                              >
                                <Download className="w-[14px] h-[14px] md:w-4 md:h-4" />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </OptionalElement>

      {/* Song Notification */}
      <AnimatePresence>
        {showSongNotification && currentTrackData && (
          <motion.div
            className={cn("song-notification absolute z-50 top-4 right-2 lg:right-4 w-60 md:w-70 lg:w-80 hidden sm:block")}
            variants={variants.songNotificationTop}
            initial="initial"
            animate="animate"
            exit="exit"
            title={currentTrackData.title || t("unknown_track")}
            aria-label={currentTrackData.title || t("unknown_track")}
          >
            <div
              className={cn(
                "bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 p-4 ",
                "flex items-center gap-3 lg:gap-4 z-20 max-w-full overflow-hidden",
                "cursor-pointer",
                "audio-player",
              )}
              onClick={() => setShowSongNotification(false)}
            >
              <motion.div variants={variants.notificationContent}>
                <div className={cn("relative group", "w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20")}>
                  <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-white/30 shadow-2xl backdrop-blur-sm bg-white/10">
                    <CoverArt src={currentTrackData.coverArtUrl} />
                  </div>
                </div>
              </motion.div>
              <motion.div variants={variants.notificationContent} className="flex flex-col flex-1 min-w-0">
                <div className="text-xs font-medium">{t("now_playing")}</div>
                <div className="text-xs lg:text-sm font-medium truncate ">{currentTrackData.title || t("unknown_track")}</div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const transitions = {
  spring: (options?: { stiffness?: number; damping?: number; duration?: number; delay?: number }): Transition => ({
    type: "spring",
    stiffness: options?.stiffness ?? 350,
    damping: options?.damping ?? 30,
    duration: options?.duration ?? 0.25,
    delay: options?.delay ?? 0,
  }),
  ease: (options?: { duration?: number; ease?: Easing | Easing[] }): Transition => ({ duration: options?.duration ?? 0.25, ease: options?.ease ?? "easeInOut" }),
};

const variants: Record<string, Variants> = {
  // Button hover animations
  buttonHover: { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)" }, tap: { scale: 0.9 } },
  playButtonHover: { initial: { scale: 0.9 }, hover: { backgroundColor: "rgba(255,255,255,0.6)", boxShadow: "0 0 18px rgba(255, 255, 255, 0.5)" }, tap: { scale: 0.95 } },
  navButtonHover: { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.1)" }, tap: { scale: 0.95 } },
  // Icon animations
  iconFadeScale: {
    initial: { opacity: 0, scale: 1 },
    animate: { opacity: 1, scale: 1.05, transition: transitions.ease({ duration: 0.15, ease: "linear" }) },
    exit: { opacity: 0, scale: 1, transition: transitions.ease({ duration: 0.15, ease: "linear" }) },
  },
  iconRotatePause: {
    initial: { opacity: 0, scale: 0.8, rotateZ: 10 },
    animate: { opacity: 1, scale: 1, rotateZ: 0, transition: transitions.ease({ duration: 0.2, ease: "linear" }) },
    exit: { opacity: 0, scale: 0.8, rotateZ: -10, transition: transitions.ease({ duration: 0.2, ease: "linear" }) },
  },
  iconRotatePlay: {
    initial: { opacity: 0, scale: 0.8, rotateZ: -10 },
    animate: { opacity: 1, scale: 1, rotateZ: 0, transition: transitions.ease({ duration: 0.2, ease: "linear" }) },
    exit: { opacity: 0, scale: 0.8, rotateZ: 10, transition: transitions.ease({ duration: 0.2, ease: "linear" }) },
  },
  // Container animations for dropdowns and panels
  dropdownContainer: {
    initial: { opacity: 0, y: -10, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1, transition: transitions.spring({ stiffness: 300, damping: 25, duration: 0.4 }) },
    exit: { opacity: 0, y: -5, scale: 0.98, transition: transitions.ease({ duration: 0.2, ease: "easeIn" }) },
  },
  popUpItem: {
    open: { opacity: 1, y: 0, scale: 1, transition: transitions.spring({ stiffness: 350, damping: 15, duration: 0.4 }) },
    closed: { opacity: 0, y: 10, scale: 0.95, transition: transitions.ease({ duration: 0.25, ease: "easeIn" }) },
  },
  volumeMenuItem: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0, transition: transitions.ease({ duration: 0.2 }) } },
  // Track item hover effect
  trackItemHover: { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "6px", boxShadow: "0 0 5px rgba(255, 255, 255, 0.2)" } },
  // Song notification animation
  notificationContent: { initial: { opacity: 0, y: -5, scale: 0.98 }, animate: { opacity: 1, y: -0, scale: 1 }, exit: { opacity: 0, y: -5, scale: 0.98 } },
  songNotificationTop: {
    initial: { opacity: 0, scale: 0.98, y: -5, filter: "blur(1px)" },
    animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transition: { when: "beforeChildren", duration: 0.25 } },
    exit: { opacity: 0, scale: 0.98, y: -5, filter: "blur(1px)" },
  },
  songNotificationRight: {
    initial: { opacity: 0, scale: 0.98, x: 5, filter: "blur(1px)" },
    animate: { opacity: 1, scale: 1, x: 0, filter: "blur(0px)", transition: { when: "beforeChildren", duration: 0.25 } },
    exit: { opacity: 0, scale: 0.98, x: 5, filter: "blur(1px)" },
  },
};

export default AudioPlayer;
