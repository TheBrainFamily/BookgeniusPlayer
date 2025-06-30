import { useState, useEffect } from "react";
import { Play, Pause, SkipForward, SkipBack, ListMusic, BookHeadphones, Volume2, VolumeX, Download } from "lucide-react";
import { motion, AnimatePresence, Variants, Transition } from "motion/react";
import useLocalStorageState from "use-local-storage-state";
import { useTranslation } from "react-i18next";

import {
  getMasterVolume,
  setMasterVolume,
  setBackgroundVolume,
  initAudioContext,
  getCurrentTrackData,
  TrackState,
  getCurrentTrackPosition,
  pauseCurrentTrack,
  resumeCurrentTrack,
  getCurrentSectionTracks,
  setCurrentTrackPosition,
  getCurrentTrackId,
  getCurrentTrackIndexInSection,
  transitionToTrack,
  getTrackDetailsById,
} from "@/audio-crossfader";
import { stopAudiobook, playAudiobook } from "@/hooks/useAudiobookTracks";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { OptionalElement } from "./OptionalElement";
import { getBookData } from "@/genericBookDataGetters/getBookData";

const AudioPlayer = () => {
  const { t } = useTranslation();
  const { hasAudiobook, slug } = getBookData();

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
  const [windowWidth, setWindowWidth] = useState<number | undefined>(undefined);
  const [playlistTracks, setPlaylistTracks] = useState<{ id: string; title: string; duration: number }[]>([]);
  const [currentTrackIdFromState, setCurrentTrackIdFromState] = useState<string | null>(null);

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
    const updatePlaylist = async (sectionTrackIds?: string[] | null) => {
      // Use provided sectionTrackIds or get current ones
      const trackIds = sectionTrackIds !== undefined ? sectionTrackIds : getCurrentSectionTracks();

      if (trackIds && trackIds.length > 0) {
        const detailedTracks = trackIds
          .map((id) => {
            const details = getTrackDetailsById(id);
            if (details) {
              const title = details.title || id;
              const duration = typeof details.trackLength === "number" && !isNaN(details.trackLength) ? details.trackLength : 0;
              return { id, title, duration };
            }

            return { id, title: id, duration: 0 };
          })
          .filter((track): track is { id: string; title: string; duration: number } => track !== null);

        setPlaylistTracks(detailedTracks);
      } else {
        setPlaylistTracks([]);
      }
    };

    updatePlaylist();

    const handlePlaylistChange = (event: CustomEvent<string[] | null>) => {
      console.log("AudioPlayer: Received playlist change event", event.detail);
      updatePlaylist(event.detail);
    };

    window.addEventListener("playlistChange", handlePlaylistChange as EventListener);

    const setInitialWindowWidth = () => {
      setWindowWidth(window?.innerWidth || 1920);
    };
    setInitialWindowWidth();

    const initializeTrackState = () => {
      setCurrentTrackIdFromState(getCurrentTrackId());

      const initialTrack = getCurrentTrackData();
      if (initialTrack) {
        setCurrentTrackData(initialTrack);
        setShowSongNotification(true);

        // Hide initial notification after 10 seconds
        const initialNotificationTimer = setTimeout(() => {
          setShowSongNotification(false);
        }, 10000);

        return initialNotificationTimer;
      }
      return null;
    };
    const initialNotificationTimer = initializeTrackState();

    let notificationTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSongTransition = () => {
      console.log("Song transition event received");
      const newCurrentTrack = getCurrentTrackData();
      console.log("Current track data:", newCurrentTrack);

      setCurrentTrackData(newCurrentTrack);
      setIsPlaying(true);
      setCurrentTrackIdFromState(getCurrentTrackId());

      setCurrentTime(0);

      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }

      setShowSongNotification(true);

      notificationTimer = setTimeout(() => {
        setShowSongNotification(false);
      }, 6000);
    };

    const handleResize = () => {
      setWindowWidth(window?.innerWidth || 1920);
    };

    window.addEventListener("songTransition", handleSongTransition);
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("songTransition", handleSongTransition);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("playlistChange", handlePlaylistChange as EventListener);

      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }
      if (initialNotificationTimer) {
        clearTimeout(initialNotificationTimer);
      }
    };
  }, []);

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];

    setVolume(newVolume);
    setMasterVolume(newVolume);

    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
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
    } else {
      setMasterVolume(0);
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

    await transitionToTrack(nextTrackId);
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

    await transitionToTrack(prevTrackId);
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
                    <VolumeX className="w-4 h-4 lg:w-5 lg:h-5" />
                  </motion.div>
                ) : (
                  <motion.div key="unmuted" variants={variants.iconFadeScale}>
                    <Volume2 className="w-4 h-4 lg:w-5 lg:h-5" />
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
                  <BookHeadphones className="w-4 h-4 lg:w-5 lg:h-5" />
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
                setCurrentTime(getCurrentTrackPosition());
                setIsVolumeOpen(false);
                setIsBigPlayerOpen(true);
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
                setCurrentTime(getCurrentTrackPosition());
                setIsVolumeOpen(false);
                setIsBigPlayerOpen((prev) => !prev);
              }}
              onMouseDown={(e) => {
                // Only handle if not a touch device
                if (e.detail > 0) {
                  setCurrentTime(getCurrentTrackPosition());
                  setIsVolumeOpen(false);
                  setIsBigPlayerOpen((prev) => !prev);
                }
              }}
              className="p-2 my-1 hover:text-white rounded-full cursor-pointer"
              whileHover="hover"
              whileTap="tap"
              variants={variants.buttonHover}
            >
              <ListMusic className="w-4 h-4 lg:w-5 lg:h-5" />
            </motion.button>
            {/* Invisible bridge to cover the gap */}
            {isBigPlayerOpen && <div className="absolute top-full left-0 w-full min-w-xs h-2 z-5" />}
            <AnimatePresence>
              {isBigPlayerOpen && (
                <motion.div
                  className="player-controls bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 px-4 py-2 absolute top-full left-0 mt-2 z-10 min-w-xs"
                  variants={variants.dropdownContainer}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <motion.div className="flex justify-center pt-4 mb-4" variants={variants.popUpItem} initial="closed" animate="open">
                    <div className="relative group w-32 h-32">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/25 to-white/10 rounded-2xl blur-sm opacity-70 group-hover:opacity-90 transition-opacity duration-300" />
                      <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-white/40 shadow-2xl backdrop-blur-sm bg-white/15">
                        {currentTrackData?.coverArtUrl ? (
                          <motion.img
                            key={currentTrackData?.coverArtUrl}
                            src={currentTrackData?.coverArtUrl}
                            alt="Album artwork"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            variants={variants.iconFadeScale}
                            initial="initial"
                            animate="animate"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/25 to-white/10">
                            <ListMusic className="w-12 h-12 text-white/70" />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>

                  <motion.div className="text-lg mb-4 text-center" variants={variants.popUpItem} initial="closed" animate="open">
                    {currentTrackData?.title}
                  </motion.div>

                  <motion.div className="mb-2" variants={variants.popUpItem} initial="closed" animate="open">
                    <div className="w-full group hover:opacity-100">
                      <Slider value={[currentTime]} min={0} max={currentTrackData?.duration || 100} step={0.1} onValueChange={handleProgressChange} variant="secondary" />
                    </div>
                  </motion.div>

                  <motion.div className="flex justify-between text-xs mb-4" variants={variants.popUpItem} initial="closed" animate="open">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(currentTrackData?.duration)}</span>
                  </motion.div>

                  <motion.div className="flex justify-center items-center gap-8 mb-4 relative" variants={variants.popUpItem} initial="closed" animate="open">
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        skipToPrevious();
                      }}
                      className="hover:text-white/80 p-2 rounded-full cursor-pointer"
                      whileHover="hover"
                      whileTap="tap"
                      variants={variants.navButtonHover}
                      title="Previous track"
                    >
                      <SkipBack className="w-4 h-4 lg:w-5 lg:h-5" />
                    </motion.button>

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

                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        skipToNext();
                      }}
                      className="hover:text-white/80 p-2 rounded-full cursor-pointer"
                      whileHover="hover"
                      whileTap="tap"
                      variants={variants.navButtonHover}
                      title="Next track"
                    >
                      <SkipForward className="w-4 h-4 lg:w-5 lg:h-5" />
                    </motion.button>
                  </motion.div>

                  {playlistTracks.length > 0 && (
                    <motion.div className="space-y-2 pb-3" variants={variants.popUpItem} initial="closed" animate="open">
                      <div className="text-sm font-medium mb-2">Playlist:</div>
                      {playlistTracks.map((track) => (
                        <motion.div
                          key={track.id}
                          className={cn("flex items-center justify-between px-2 py-1 rounded-md cursor-pointer gap-2", currentTrackIdFromState === track.id && "bg-white/10")}
                          variants={variants.trackItemHover}
                          whileHover="hover"
                          onClick={(e) => {
                            e.stopPropagation();
                            transitionToTrack(track.id);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span className={"text-white/70"}>{track.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-white/70">{formatTime(track.duration)}</span>
                            <button
                              className="text-white/70 hover:text-white p-2 rounded-full transition hover:bg-black/40 cursor-pointer"
                              title="Download track"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadTrack(track.id, track.title);
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </OptionalElement>

      {/* Song Notification */}
      <AnimatePresence>
        {showSongNotification && currentTrackData && windowWidth && (
          <motion.div
            className={cn(windowWidth >= 965 && "absolute w-100 top-5 right-5", windowWidth < 965 && "fixed w-80 bottom-20 left-5")}
            variants={variants.songNotification}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div
              className={cn(
                "bg-black/70 textured-bg rounded-3xl border shadow-xl text-white border-white/30 p-4",
                "flex items-center gap-4 z-20 max-w-full overflow-hidden",
                "cursor-pointer",
                "audio-player",
              )}
              onClick={() => setShowSongNotification(false)}
            >
              <div className={cn("relative group", windowWidth < 965 ? "w-20 h-20" : "w-26 h-26")}>
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-white/5 rounded-xl blur-sm opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
                <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-white/30 shadow-2xl backdrop-blur-sm bg-white/10">
                  {currentTrackData.coverArtUrl ? (
                    <img src={currentTrackData.coverArtUrl} alt="Now playing" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-white/20 to-white/5">
                      <ListMusic className="w-8 h-8 text-white/70" />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <div className="text-sm font-medium">{t("now_playing")}</div>
                <div className="text-base font-medium truncate">{currentTrackData.title || t("unknown_track")}</div>
              </div>
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
  ease: (options?: { duration?: number; ease?: string | string[] }): Transition => ({ duration: options?.duration ?? 0.25, ease: options?.ease ?? "easeInOut" }),
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
  songNotification: {
    initial: { opacity: 0, y: -5, scale: 0.98, filter: "blur(1px)" },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: transitions.spring({ stiffness: 100, damping: 30, duration: 3.5 }) },
    exit: { opacity: 0, y: 5, scale: 0.98, filter: "blur(1px)" },
  },
};

export default AudioPlayer;
