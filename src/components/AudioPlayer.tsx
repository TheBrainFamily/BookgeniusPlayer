import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, SkipForward, SkipBack, ListMusic, X, Music, Book, BookHeadphones, Volume2, VolumeX, Download, Check, Square } from "lucide-react";
import { motion, AnimatePresence, Variants } from "motion/react";

import { getMasterVolume, setMasterVolume, setBackgroundVolume, initAudioContext } from "@/audio-crossfader";
import { stopAudiobook, playAudiobook } from "@/hooks/useAudiobookTracks";
import { dealWithBackgroundSongs } from "@/deal-with-background-songs";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";

const variants: Record<string, Variants> = {
  player: {
    expanded: { scale: 1, opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25, when: "beforeChildren", staggerChildren: 0.05 } },
    collapsed: { scale: 0.95, opacity: 0, y: -10, transition: { duration: 0.2, when: "afterChildren", staggerChildren: 0.05, staggerDirection: -1 } },
  },
  miniPlayer: {
    expanded: { scale: 0.95, opacity: 0, y: 10, transition: { duration: 0.2 } },
    collapsed: { scale: 1, opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25, delay: 0.1 } },
  },
  playerChildren: { expanded: { opacity: 1, y: 0, transition: { duration: 0.3 } }, collapsed: { opacity: 0, y: 10, transition: { duration: 0.2 } } },
  modeSwitch: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 25 } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
  },
};

const musicTracks = [
  { name: "Audio name", duration: "3:15", src: "/sample-audio.mp3" },
  { name: "Another audio here", duration: "4:29", src: "/sample-audio.mp3" },
];

const audiobooks = [
  {
    title: "The Great Adventure",
    author: "J. Smith",
    chapters: [
      { name: "Chapter 1: The Beginning", duration: "12:30", src: "/audiobook-sample.mp3" },
      { name: "Chapter 2: The Journey", duration: "15:45", src: "/audiobook-sample.mp3" },
      { name: "Chapter 3: Lorem Ipsum", duration: "10:20", src: "/audiobook-sample.mp3" },
    ],
    currentChapter: 0,
  },
];

export default function AudioPlayer() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingAudioBook, setIsPlayingAudiobook] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [mode, setMode] = useState<"music" | "audiobook">("music");
  // const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [volume, setVolume] = useState(getMasterVolume());
  const [balance, setBalance] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volumeSliderRef = useRef<HTMLDivElement | null>(null);
  const volumeButtonRef = useRef<HTMLButtonElement | null>(null);

  const [currentAudiobook, setCurrentAudiobook] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(0);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.addEventListener("timeupdate", updateProgress);
      audioRef.current.addEventListener("loadedmetadata", () => {
        setDuration(audioRef.current?.duration || 0);
      });
      // audioRef.current.playbackRate = playbackSpeed

      return () => {
        audioRef.current?.removeEventListener("timeupdate", updateProgress);
      };
    }
    // }, [audioRef.current, playbackSpeed])
  }, [audioRef.current]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const updateProgress = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const skipToNext = () => {
    if (mode === "music") {
      setCurrentTrackIndex((prev) => (prev + 1) % musicTracks.length);
    } else {
      const book = audiobooks[currentAudiobook];
      if (currentChapter < book.chapters.length - 1) {
        setCurrentChapter(currentChapter + 1);
      } else if (currentAudiobook < audiobooks.length - 1) {
        setCurrentAudiobook(currentAudiobook + 1);
        setCurrentChapter(0);
      }
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  const skipToPrevious = () => {
    if (mode === "music") {
      setCurrentTrackIndex((prev) => (prev - 1 + musicTracks.length) % musicTracks.length);
    } else {
      if (currentChapter > 0) {
        setCurrentChapter(currentChapter - 1);
      } else if (currentAudiobook > 0) {
        setCurrentAudiobook(currentAudiobook - 1);
        setCurrentChapter(audiobooks[currentAudiobook - 1].chapters.length - 1);
      }
    }

    if (isPlaying && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number.parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const getCurrentAudioSrc = () => {
    if (mode === "music") {
      return musicTracks[currentTrackIndex].src;
    } else {
      return audiobooks[currentAudiobook].chapters[currentChapter].src;
    }
  };

  // const getCurrentTitle = () => {
  //   if (mode === "music") {
  //     return musicTracks[currentTrackIndex].name
  //   } else {
  //     return audiobooks[currentAudiobook].chapters[currentChapter].name
  //   }
  // }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number.parseFloat(e.target.value);
    setVolume(newVolume);
    setMasterVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = Number.parseFloat(e.target.value);
    setBalance(newVolume);
    setBackgroundVolume(newVolume);
  };

  const toggleMute = () => {
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

  const toggleTrackSelection = (index: number) => {
    if (selectedTracks.includes(index)) {
      setSelectedTracks(selectedTracks.filter((i) => i !== index));
    } else {
      setSelectedTracks([...selectedTracks, index]);
    }
  };

  const handleVolumeHover = (isHovering: boolean) => {
    setIsVolumeHovered(isHovering);
  };

  const VolumeSlider = () => (
    <div className="flex items-center gap-2 w-full">
      <button onClick={toggleMute} className="flex-shrink-0 hover:text-white/80 transition">
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={handleVolumeChange}
        className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
      />
    </div>
  );

  return (
    <div className="absolute top-[1rem] left-20 z-10 optional-element">
      <audio ref={audioRef} src={getCurrentAudioSrc()} />

      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={variants.player}
            className="bg-white/20 backdrop-blur-md rounded-3xl p-4 w-full max-w-sm text-white origin-top-left"
          >
            <motion.div className="flex justify-between items-center mb-4" variants={variants.playerChildren}>
              <div className="text-lg font-medium truncate pr-2">{mode === "music" ? "Audio name" : `Chapter 1: The Beg...`}</div>
              <div className="flex items-center gap-3">
                <button onClick={toggleMute} className="hover:text-white/80 transition">
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <div className="w-px h-5 bg-white/30"></div>
                <AnimatePresence mode="wait">
                  {mode === "music" ? (
                    <motion.button
                      key="music-icon"
                      onClick={() => setMode("audiobook")}
                      className="hover:text-white/80 transition"
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={variants.modeSwitch}
                    >
                      <Music className="w-5 h-5" />
                    </motion.button>
                  ) : (
                    <motion.button
                      key="book-icon"
                      onClick={() => setMode("music")}
                      className="hover:text-white/80 transition"
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      variants={variants.modeSwitch}
                    >
                      <Book className="w-5 h-5" />
                    </motion.button>
                  )}
                </AnimatePresence>
                <button onClick={() => setIsExpanded(false)} className="hover:text-white/80 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </motion.div>

            <motion.div className="flex justify-center mb-4" variants={variants.playerChildren}>
              <div className="w-32 h-32 bg-white/10 rounded-lg overflow-hidden flex items-center justify-center">
                <img src="/placeholder.svg?height=128&width=128" alt="Album art" className="w-full h-full object-cover" />
              </div>
            </motion.div>

            <motion.div className="mb-2" variants={variants.playerChildren}>
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleProgressChange}
                className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </motion.div>

            <motion.div className="flex justify-between text-xs mb-4" variants={variants.playerChildren}>
              <span>{formatTime(currentTime)}</span>
              <span>{mode === "music" ? musicTracks[currentTrackIndex].duration : audiobooks[currentAudiobook].chapters[currentChapter].duration}</span>
            </motion.div>

            <AnimatePresence mode="wait">
              {mode === "music" ? (
                <motion.div key="music-content" initial="initial" animate="animate" exit="exit" variants={variants.modeSwitch}>
                  <motion.div className="mb-6" variants={variants.playerChildren}>
                    <VolumeSlider />
                  </motion.div>
                  <motion.div className="space-y-3" variants={variants.playerChildren}>
                    <div className="text-sm font-medium mb-2">Playlist:</div>
                    {musicTracks.map((track, index) => (
                      <div key={index} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleTrackSelection(index)} className="text-white/80 hover:text-white">
                            {selectedTracks.includes(index) ? <Check className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                          <span
                            className={`${currentTrackIndex === index ? "text-white" : "text-white/70"}`}
                            onClick={() => {
                              setCurrentTrackIndex(index);
                              if (isPlaying && audioRef.current) {
                                audioRef.current.currentTime = 0;
                                audioRef.current.play();
                              }
                            }}
                          >
                            {track.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-white/70">{track.duration}</span>
                          <button className="text-white/70 hover:text-white">
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div key="audiobook-content" initial="initial" animate="animate" exit="exit" variants={variants.modeSwitch}>
                  <motion.div className="flex justify-center items-center gap-8 mb-4" variants={variants.playerChildren}>
                    <button onClick={skipToPrevious} className="hover:text-white/80 transition">
                      <SkipBack className="w-5 h-5" />
                    </button>
                    <button onClick={togglePlay} className="hover:text-white/80 transition bg-white/30 rounded-full p-3">
                      {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                    </button>
                    <button onClick={skipToNext} className="hover:text-white/80 transition">
                      <SkipForward className="w-5 h-5" />
                    </button>
                  </motion.div>

                  <motion.div className="mb-6" variants={variants.playerChildren}>
                    <VolumeSlider />
                  </motion.div>

                  <motion.div className="space-y-3" variants={variants.playerChildren}>
                    <div className="text-sm font-medium mb-2">Chapters:</div>
                    {audiobooks[currentAudiobook].chapters.map((chapter, index) => (
                      <div key={index} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleTrackSelection(index)} className="text-white/80 hover:text-white">
                            {selectedTracks.includes(index) ? <Check className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                          <span
                            className={`${currentChapter === index ? "text-white" : "text-white/70"} truncate pr-2`}
                            onClick={() => {
                              setCurrentChapter(index);
                              if (isPlaying && audioRef.current) {
                                audioRef.current.currentTime = 0;
                                audioRef.current.play();
                              }
                            }}
                          >
                            {chapter.name}
                          </span>
                        </div>
                        <span className="text-white/70 flex-shrink-0">{chapter.duration}</span>
                      </div>
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div key="collapsed" initial="expanded" animate="collapsed" exit="expanded" variants={variants.miniPlayer} className="relative origin-top-left">
            <motion.div
              className="bg-white/20 backdrop-blur-md rounded-3xl px-2 py-1 flex items-center gap-1 text-white"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <div className="relative" onMouseEnter={() => handleVolumeHover(true)} onMouseLeave={() => handleVolumeHover(false)}>
                <button ref={volumeButtonRef} onClick={toggleMute} className="p-2 hover:text-white/80 transition">
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <AnimatePresence>
                  {isVolumeHovered && (
                    <>
                      {/* This is an invisible bridge element to prevent hover state from being lost - taller with more distance */}
                      <div className="absolute w-30 h-5 bottom-0 left-0 transform translate-y-full z-10"></div>
                      <motion.div
                        ref={volumeSliderRef}
                        initial="collapsed"
                        animate="expanded"
                        exit="collapsed"
                        variants={variants.player}
                        className="absolute top-full -left-[5px] mt-2 bg-white/20 backdrop-blur-md rounded-3xl px-4 py-2 w-48 z-10 origin-top-left"
                      >
                        <motion.div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={volume}
                            onChange={handleVolumeChange}
                            className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                          />
                        </motion.div>
                        <motion.div className="flex justify-between text-xs text-white mb-1">
                          <span>0%</span>
                          <span>100%</span>
                        </motion.div>
                        <motion.div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={balance}
                            onChange={handleBalanceChange}
                            className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                          />
                        </motion.div>
                        <motion.div className="flex justify-between text-xs text-white mb-1">
                          <span>0%</span>
                          <span>100%</span>
                        </motion.div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
              <button onClick={toggleAudiobookState} className="p-2 hover:text-white/80 transition relative">
                <BookHeadphones className="w-5 h-5" />
                <div className="absolute bottom-0 right-0  rounded-full p-0.5">{isPlayingAudioBook ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}</div>
              </button>
              <button onClick={() => setIsExpanded(true)} className="p-2 hover:text-white/80 transition">
                <ListMusic className="w-5 h-5" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
