import React, { useState, useEffect } from "react";
import { Play, Pause, SkipForward, SkipBack, ListMusic, BookHeadphones, Volume2, VolumeX, Download } from "lucide-react";
import { motion, AnimatePresence, Variants, Transition } from "motion/react";

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
  loadTrack,
} from "@/audio-crossfader";
import { stopAudiobook, playAudiobook } from "@/hooks/useAudiobookTracks";
import { dealWithBackgroundSongs } from "@/deal-with-background-songs";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { CURRENT_BOOK } from "@/consts";

const AudioPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isPlayingAudioBook, setIsPlayingAudiobook] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(getMasterVolume() ?? 0.5);
  const [balance, setBalance] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(true);
  const [isBigPlayerHovered, setIsBigPlayerHovered] = useState(false);
  const [currentTrackData, setCurrentTrackData] = useState<TrackState | null>(null);
  const [showSongNotification, setShowSongNotification] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1920);
  const [playlistTracks, setPlaylistTracks] = useState<{ id: string; title: string; duration: number }[]>([]);
  const [currentTrackIdFromState, setCurrentTrackIdFromState] = useState<string | null>(null);

  useEffect(() => {
    const updatePlaylist = async () => {
      const sectionTrackIds = getCurrentSectionTracks();

      if (sectionTrackIds && sectionTrackIds.length > 0) {
        const loadPromises = sectionTrackIds.map((id) => {
          if (!getTrackDetailsById(id)) {
            console.log(`Details for track ${id} missing in playlist, attempting to load...`);
            return loadTrack(id);
          }
          return Promise.resolve(true);
        });

        await Promise.all(loadPromises);

        const detailedTracks = sectionTrackIds
          .map((id) => {
            const details = getTrackDetailsById(id);
            if (details) {
              const title = details.title || id;
              const duration = typeof details.trackLength === "number" && !isNaN(details.trackLength) ? details.trackLength : 0;
              return { id, title, duration };
            }
            return null;
          })
          .filter((track): track is { id: string; title: string; duration: number } => track !== null);

        setPlaylistTracks(detailedTracks);
      } else {
        setPlaylistTracks([]);
      }
    };

    updatePlaylist();
  }, [currentTrackData]);

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
    if (isNaN(time) || time === null || typeof time === "undefined") {
      return "0:00";
    }

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  useEffect(() => {
    // Update the current time periodically based on the actual playback position
    if (!isPlaying) return;

    // Create a timer that updates the current time every 250ms
    const timer = setInterval(() => {
      const position = getCurrentTrackPosition();
      if (position !== null) {
        setCurrentTime(position);
      }
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [isPlaying]);

  useEffect(() => {
    let notificationTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSongTransition = () => {
      console.log("Song transition event received");
      const newCurrentTrack = getCurrentTrackData();
      console.log("Current track data:", newCurrentTrack);

      setCurrentTrackData(newCurrentTrack);
      setIsPlaying(true);
      setCurrentTrackIdFromState(getCurrentTrackId());

      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }

      setShowSongNotification(true);

      notificationTimer = setTimeout(() => {
        setShowSongNotification(false);
      }, 6000);
    };

    setCurrentTrackIdFromState(getCurrentTrackId());

    window.addEventListener("songTransition", handleSongTransition);

    return () => {
      window.removeEventListener("songTransition", handleSongTransition);

      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    setMasterVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
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
      const { currentChapter, currentParagraph } = getCurrentLocation();
      dealWithBackgroundSongs({ currentChapter, currentParagraph });
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

  const handleDownloadTrack = (trackId: string) => {
    if (!trackId) return;
    const trackUrl = `/${CURRENT_BOOK}/${trackId}.mp3`;
    const link = document.createElement("a");
    link.href = trackUrl;
    link.download = `${trackId}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="absolute top-[1rem] left-20 z-10">
        <div className="relative origin-top-left">
          <motion.div className="bg-black/60 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30 px-2 flex items-center gap-1">
            {/* Volume Control Button */}
            <div onClick={toggleMute} onMouseEnter={() => setIsVolumeHovered(true)} onMouseLeave={() => setIsVolumeHovered(false)} className="relative">
              <motion.button
                onClick={toggleMute}
                className="p-2 my-1 hover:text-white rounded-full cursor-pointer"
                whileHover="hover"
                whileTap="tap"
                variants={variants.buttonHover}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isMuted ? (
                    <motion.div key="muted" variants={variants.iconFadeScale}>
                      <VolumeX className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <motion.div key="unmuted" variants={variants.iconFadeScale}>
                      <Volume2 className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>

            {/* Audiobook Toggle Button */}
            <motion.button
              onClick={toggleAudiobookState}
              className="p-2 hover:text-white relative rounded-full cursor-pointer"
              whileHover="hover"
              whileTap="tap"
              variants={variants.buttonHover}
            >
              <BookHeadphones className="w-5 h-5" />
              <motion.div className="absolute bottom-0 right-0">{isPlayingAudioBook ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}</motion.div>
            </motion.button>

            {/* Big Player Button */}
            <div onClick={() => setIsBigPlayerHovered((prev) => !prev)} onMouseEnter={() => setIsBigPlayerHovered(true)} onMouseLeave={() => setIsBigPlayerHovered(false)}>
              <motion.button className="p-2 my-1 hover:text-white rounded-full cursor-pointer" whileHover="hover" whileTap="tap" variants={variants.buttonHover}>
                <ListMusic className="w-5 h-5" />
              </motion.button>
            </div>
          </motion.div>

          {/* Volume Control Dropdown */}
          <AnimatePresence>
            {isVolumeHovered && (
              <>
                {/* Invisible bridge element to ensure smooth hover transition */}
                <div className="absolute w-48 h-4 top-full left-0 z-10 -mt-1" onMouseEnter={() => setIsVolumeHovered(true)} />
                <div
                  className="bg-black/60 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30 absolute top-full left-0 mt-2 z-10 px-4 pt-2 pb-3 w-48 flex gap-3 flex-col"
                  onMouseEnter={() => setIsVolumeHovered(true)}
                  onMouseLeave={() => setIsVolumeHovered(false)}
                >
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: isVolumeHovered ? 1 : 0, y: isVolumeHovered ? 0 : 10 }} transition={{ delay: 0.05 }}>
                    <div className="flex justify-between text-xs my-2">Głośność</div>
                    <Slider value={[isMuted ? 0 : volume]} min={0} max={1} step={0.01} onValueChange={handleVolumeChange} />
                    <div className="flex justify-between text-xs mt-2">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </motion.div>

                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: isVolumeHovered ? 1 : 0, y: isVolumeHovered ? 0 : 10 }} transition={{ delay: 0.1 }}>
                    <div className="flex justify-between text-xs my-2">Balans</div>
                    <Slider value={[balance]} min={0} max={1} step={0.01} onValueChange={handleBalanceChange} />
                    <div className="flex justify-between text-xs mt-2">
                      <span>Audiobook</span>
                      <span>Muzyka</span>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>

          {/* Big Player Dropdown */}
          <AnimatePresence>
            {isBigPlayerHovered && (
              <>
                {/* Invisible bridge element */}
                <div className="absolute w-80 h-4 top-full left-0 z-10 -mt-1" onMouseEnter={() => setIsBigPlayerHovered(true)} />
                <div
                  className="bg-black/60 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30 px-4 py-2 absolute top-full left-0 mt-2 z-10 min-w-xs"
                  onClick={() => setIsBigPlayerHovered((prev) => !prev)}
                  onMouseEnter={() => setIsBigPlayerHovered(true)}
                  onMouseLeave={() => setIsBigPlayerHovered(false)}
                >
                  <motion.div className="flex justify-center pt-4 mb-4" variants={variants.popUpItem} initial="closed" animate="open">
                    <div className="w-32 h-32 bg-white/15 rounded-lg overflow-hidden flex items-center justify-center border border-white/40 shadow-lg">
                      {currentTrackData?.coverArtUrl && (
                        <motion.img
                          key={currentTrackData?.coverArtUrl}
                          src={currentTrackData?.coverArtUrl}
                          alt="Music album art"
                          className="w-full h-full object-cover"
                          variants={variants.iconFadeScale}
                          initial="initial"
                          animate="animate"
                        />
                      )}
                    </div>
                  </motion.div>

                  <motion.div className="text-lg mb-4 text-center" variants={variants.popUpItem} initial="closed" animate="open">
                    {currentTrackData?.title}
                  </motion.div>

                  <motion.div className="mb-2" variants={variants.popUpItem} initial="closed" animate="open">
                    <div className="w-full group hover:opacity-100">
                      <Slider value={[currentTime]} min={0} max={currentTrackData?.duration || 100} step={0.1} onValueChange={handleProgressChange} />
                    </div>
                  </motion.div>

                  <motion.div className="flex justify-between text-xs mb-4" variants={variants.popUpItem} initial="closed" animate="open">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(currentTrackData?.duration)}</span>
                  </motion.div>

                  <motion.div className="flex justify-center items-center gap-8 mb-4 relative" variants={variants.popUpItem} initial="closed" animate="open">
                    <motion.button
                      onClick={skipToPrevious}
                      className="hover:text-white/80 p-2 rounded-full cursor-pointer"
                      whileHover="hover"
                      whileTap="tap"
                      variants={variants.navButtonHover}
                      title="Previous track"
                    >
                      <SkipBack className="w-5 h-5" />
                    </motion.button>

                    <motion.div whileTap={{ scale: 0.95 }}>
                      <motion.button
                        onClick={togglePlay}
                        className="hover:text-white bg-white/40 rounded-full p-3 relative z-10 cursor-pointer"
                        whileHover="hover"
                        whileTap="tap"
                        variants={variants.playButtonHover}
                        initial={{ scale: 0.9 }}
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
                      onClick={skipToNext}
                      className="hover:text-white/80 p-2 rounded-full cursor-pointer"
                      whileHover="hover"
                      whileTap="tap"
                      variants={variants.navButtonHover}
                      title="Next track"
                    >
                      <SkipForward className="w-5 h-5" />
                    </motion.button>
                  </motion.div>

                  <motion.div className="space-y-2 pb-3" variants={variants.popUpItem} initial="closed" animate="open">
                    <div className="text-sm font-medium mb-2">Playlist:</div>
                    {playlistTracks.map((track) => (
                      <motion.div
                        key={track.id}
                        className={cn(
                          "flex items-center justify-between px-2 py-1 rounded-md cursor-pointer",
                          currentTrackIdFromState === track.id ? "bg-white/20" : "hover:bg-white/10",
                        )}
                        variants={variants.trackItemHover}
                        whileHover="hover"
                        onClick={() => transitionToTrack(track.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={"text-white/70"}>{track.title || track.id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white/70">{formatTime(track.duration)}</span>
                          <button
                            className="text-white/70 hover:text-white p-1 rounded-full hover:bg-white/20"
                            title="Download track"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadTrack(track.id);
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Song Notification */}
      <AnimatePresence>
        {showSongNotification && !isBigPlayerHovered && !isVolumeHovered && currentTrackData && (
          <motion.div
            className={cn(
              "bg-black/60 backdrop-blur-md rounded-3xl border shadow-xl text-white border-white/30",
              "px-4 py-3 flex items-center gap-4 absolute z-20 max-w-full overflow-hidden",
              windowWidth < 1400 ? "w-80 bottom-4 left-4" : "w-100 top-4 right-4",
            )}
            variants={variants.songNotification}
            initial="initial"
            animate="animate"
            exit="exit"
            key="song-notification"
            style={{ willChange: "opacity, transform" }}
          >
            <div className={`bg-white/10 rounded-lg overflow-hidden flex-shrink-0 ${windowWidth < 1400 ? "w-24 h-24" : "w-36 h-36"}`}>
              {currentTrackData.coverArtUrl && <img src={currentTrackData.coverArtUrl} alt="Now playing" className="w-full h-full object-cover" />}
            </div>

            <div className="flex flex-col flex-1 min-w-0">
              <div className="text-sm font-medium">Now Playing</div>
              <div className="text-base font-medium truncate">{currentTrackData.title || "Unknown Track"}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const springTransition = (stiffness = 350, damping = 30, duration?: number): Transition => {
  const trans: Transition = { type: "spring", stiffness, damping };
  if (duration) trans.duration = duration;
  return trans;
};

const easeTransition = (duration = 0.25, ease: string | string[] = "easeIn"): Transition => ({ duration, ease });

const commonItemStates = {
  open: (customY = 0, customScale = 1) => ({ opacity: 1, y: customY, scale: customScale }),
  closed: (customY = 10, customScale = 0.95) => ({ opacity: 0, y: customY, scale: customScale }),
};

const variants: Record<string, Variants> = {
  popUp: {
    open: { ...commonItemStates.open(0, 1), boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)", transition: { ...springTransition(), when: "beforeChildren", staggerChildren: 0.05 } },
    closed: {
      ...commonItemStates.closed(-10, 0.95),
      boxShadow: "0 0 0 rgba(0, 0, 0, 0)",
      transition: { ...easeTransition(0.25, "easeIn"), when: "afterChildren", staggerChildren: 0.03, staggerDirection: -1 },
    },
  },
  popUpItem: {
    open: { ...commonItemStates.open(), transition: springTransition(350, 15, 0.4) },
    closed: { ...commonItemStates.closed(10, 0.95), transition: easeTransition(0.25, "easeIn") },
  },
  iconFadeScale: {
    initial: { opacity: 0, scale: 1 },
    animate: { opacity: 1, scale: 1.05, transition: easeTransition(0.15, "linear") },
    exit: { opacity: 0, scale: 1, transition: easeTransition(0.15, "linear") },
  },
  iconRotatePause: {
    initial: { opacity: 0, scale: 0.8, rotateZ: 10 },
    animate: { opacity: 1, scale: 1, rotateZ: 0, transition: easeTransition(0.2, "linear") },
    exit: { opacity: 0, scale: 0.8, rotateZ: -10, transition: easeTransition(0.2, "linear") },
  },
  iconRotatePlay: {
    initial: { opacity: 0, scale: 0.8, rotateZ: -10 },
    animate: { opacity: 1, scale: 1, rotateZ: 0, transition: easeTransition(0.2, "linear") },
    exit: { opacity: 0, scale: 0.8, rotateZ: 10, transition: easeTransition(0.2, "linear") },
  },
  songNotification: {
    initial: { opacity: 0, y: -5, scale: 0.98, filter: "blur(1px)" },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 100, damping: 30, duration: 3.5 } },
    exit: { opacity: 0, y: 5, scale: 0.98, filter: "blur(1px)" },
  },
  buttonHover: { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.2)", boxShadow: "0px 0px 8px rgba(255,255,255,0.5)" }, tap: { scale: 0.9 } },
  playButtonHover: { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.6)", boxShadow: "0 0 18px rgba(255, 255, 255, 0.5)" }, tap: { scale: 0.95 } },
  navButtonHover: { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.1)" }, tap: { scale: 0.95 } },
  trackItemHover: { initial: {}, hover: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "6px", boxShadow: "0 0 5px rgba(255, 255, 255, 0.2)" } },
};

export default AudioPlayer;
