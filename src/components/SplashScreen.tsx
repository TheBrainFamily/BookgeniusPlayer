import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Variants, Transition } from "motion/react";
import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { initAudioContext } from "../audio-crossfader";
import { getCurrentLocation } from "../helpers/paragraphsNavigation";
import { dealWithBackgroundSongs } from "../deal-with-background-songs";
import { playAudiobook } from "../hooks/useAudiobookTracks";

const target = document.getElementById("splash-screen");

const loadingPhrases = [
  "Kreowanie wirtualnej biblioteki...",
  "Przywoływanie fikcyjnych postaci...",
  "Warzenie literackich eliksirów...",
  "Odkurzanie starożytnych ksiąg...",
  "Stawianie ostatnich kropek...",
  "Przewracanie cyfrowych stron...",
  "Łączenie wyobraźni z rzeczywistością...",
  "Odszyfrowywanie intencji autora...",
  "Układanie słów w idealnym porządku...",
  "Uwalnianie narracyjnej magii...",
  "Otwieranie bram do świata książek...",
  "Rozpalanie ognia wyobraźni...",
  "Szlifowanie literackich klejnotów...",
  "Nanoszenie ostatnich poprawek...",
  "Splatanie wątków opowieści...",
  "Przebudzanie uśpionych bohaterów...",
];

const useLoadingPhrases = () => {
  const [currentPhrase, setCurrentPhrase] = useState("");
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const previousPhrases = useRef<Set<string>>(new Set());

  useEffect(() => {
    const getRandomPhrase = () => {
      // Always have at least 5 phrases available to choose from
      if (previousPhrases.current.size > loadingPhrases.length - 5) {
        previousPhrases.current.clear();
      }

      let phrase: string;
      let attempts = 0;
      const maxAttempts = 10; // Prevent infinite loop

      do {
        const randomIndex = Math.floor(Math.random() * loadingPhrases.length);
        phrase = loadingPhrases[randomIndex];
        attempts++;
      } while (previousPhrases.current.has(phrase) && attempts < maxAttempts && loadingPhrases.length > 1);

      // Track this phrase so we don't repeat it soon
      previousPhrases.current.add(phrase);
      return phrase;
    };

    const updatePhraseCycle = () => {
      setCurrentPhrase(getRandomPhrase());
    };
    updatePhraseCycle();

    const PHRASE_DURATION_MS = 3000;
    intervalIdRef.current = setInterval(updatePhraseCycle, PHRASE_DURATION_MS);

    return () => {
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
    };
  }, []);

  return currentPhrase;
};

const useVideoReadiness = (videoTimeoutMs = 5000) => {
  const [videoAReady, setVideoAReady] = useState(false);
  const [videoBReady, setVideoBReady] = useState(false);
  const [showStartButton, setShowStartButton] = useState(false);

  const videoTimeoutIdRef = useRef<number | undefined>(undefined);
  const buttonTimeoutIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const bgVideoA = document.getElementById("bg-video-a") as HTMLVideoElement | null;
    const bgVideoB = document.getElementById("bg-video-b") as HTMLVideoElement | null;

    const handleVideoAReadyEvent = () => setVideoAReady(true);
    const handleVideoBReadyEvent = () => setVideoBReady(true);

    // Check if videos are already ready
    if (bgVideoA) {
      if (bgVideoA.readyState >= 3) {
        setVideoAReady(true);
      } else {
        bgVideoA.addEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.addEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.addEventListener("playing", handleVideoAReadyEvent);
      }
    } else {
      // No video A found, consider it ready
      setVideoAReady(true);
    }

    // Setup video B readiness detection
    if (bgVideoB) {
      if (bgVideoB.readyState >= 3) {
        setVideoBReady(true);
      } else {
        bgVideoB.addEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.addEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.addEventListener("playing", handleVideoBReadyEvent);
      }
    } else {
      // No video B found, consider it ready
      setVideoBReady(true);
    }

    // Fallback timeout to consider videos ready after a delay
    videoTimeoutIdRef.current = window.setTimeout(() => {
      console.log("Video readiness timeout reached, forcing ready state");
      setVideoAReady(true);
      setVideoBReady(true);
    }, videoTimeoutMs);

    // Show start button with a slight delay after videos are ready
    // This gives animations time to complete before the button appears
    const MIN_SPLASH_DISPLAY_TIME = 1500; // Show splash for at least 1.5s

    buttonTimeoutIdRef.current = window.setTimeout(() => {
      setShowStartButton(true);
    }, MIN_SPLASH_DISPLAY_TIME);

    return () => {
      if (videoTimeoutIdRef.current) clearTimeout(videoTimeoutIdRef.current);
      if (buttonTimeoutIdRef.current) clearTimeout(buttonTimeoutIdRef.current);

      if (bgVideoA) {
        bgVideoA.removeEventListener("canplay", handleVideoAReadyEvent);
        bgVideoA.removeEventListener("canplaythrough", handleVideoAReadyEvent);
        bgVideoA.removeEventListener("playing", handleVideoAReadyEvent);
      }

      if (bgVideoB) {
        bgVideoB.removeEventListener("canplay", handleVideoBReadyEvent);
        bgVideoB.removeEventListener("canplaythrough", handleVideoBReadyEvent);
        bgVideoB.removeEventListener("playing", handleVideoBReadyEvent);
      }
    };
  }, [videoTimeoutMs]);

  // Effect to show start button when videos are ready
  useEffect(() => {
    const videoReady = videoAReady || videoBReady;

    if (videoReady && !showStartButton && buttonTimeoutIdRef.current) {
      // If videos are ready but we're still waiting on the minimum display time,
      // keep the timeout in place
      console.log("Videos ready, waiting for minimum display time");
    }
  }, [videoAReady, videoBReady, showStartButton]);

  return { showStartButton };
};

const SplashScreen = () => {
  const currentPhrase = useLoadingPhrases();
  const { showStartButton } = useVideoReadiness(5000);

  const [showSplash, setShowSplash] = useState(true);
  const exitingRef = useRef(false);

  const handleStartClick = async () => {
    // Prevent multiple clicks during exit animation
    if (exitingRef.current) return;
    exitingRef.current = true;

    try {
      const result = await initAudioContext();

      if (result) {
        const { currentChapter, currentParagraph } = getCurrentLocation();
        dealWithBackgroundSongs({ currentChapter, currentParagraph });
      } else {
        console.error("Failed to initialize audio context");
      }

      // Ensure the html splash screen is hidden
      if (target) {
        target.classList.add("splash-screen--hide");
      }

      // Start the exit animation
      const ANIMATION_DURATION_MS = 1000; // Match animation duration to exit animation (1s)

      // Trigger the exit animation - this will activate AnimatePresence exit animation
      setShowSplash(false);

      // Wait for animation to complete before dispatching events and playing audio
      setTimeout(() => {
        // Dispatch the event only once with a clear timing after animation completes
        window.dispatchEvent(new CustomEvent("splashHidden"));
        playAudiobook(true);
      }, ANIMATION_DURATION_MS);
    } catch (error) {
      console.error("Error during splash screen exit:", error);
      // Fallback: force exit even if there was an error
      setShowSplash(false);

      // Still add the hide class for consistent animation
      if (target) {
        target.classList.add("splash-screen--hide");
      }

      // Dispatch the event for other components and play audio after a short delay
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("splashHidden"));
        playAudiobook(true);
      }, 100);
    }
  };

  useEffect(() => {
    const handleSplashHidden = () => {
      if (!exitingRef.current) {
        exitingRef.current = true;

        // Add class to support any additional CSS transitions
        if (target) {
          target.classList.add("splash-screen--hide");
        }

        // Trigger the exit animation - this will activate AnimatePresence exit animation
        setShowSplash(false);

        // Only call playAudiobook() if this wasn't triggered by the Start button
        // (handleStartClick already calls playAudiobook() in its own setTimeout)
        const ANIMATION_DURATION_MS = 1000;
        setTimeout(() => {
          // Check if the event was dispatched externally (not from handleStartClick)
          if (!document.querySelector(".splash-screen--hide")) {
            playAudiobook(true);
          }
        }, ANIMATION_DURATION_MS);
      }
    };

    window.addEventListener("splashHidden", handleSplashHidden);

    return () => {
      window.removeEventListener("splashHidden", handleSplashHidden);
    };
  }, []);

  if (!target) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {showSplash && (
        <motion.div
          className={`
              fixed inset-0 h-screen flex flex-col items-center justify-center 
              text-white
              text-xl font-sans z-[9999] overflow-hidden
            `}
          variants={variants.mainContainer}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div className="relative z-10 flex flex-col items-center w-full w-max-lg" variants={variants.container} initial="hidden" animate="visible">
            <motion.div className="mb-20" variants={variants.titleContainer} animate="visible" initial="hidden">
              <motion.div className="text-white text-5xl font-bold mb-3 tracking-wider text-center" variants={variants.title}>
                BookGenius
              </motion.div>
              <motion.div className="text-sm uppercase tracking-widest text-center text-white/80" variants={variants.subtitle}>
                Twoja wirtualna biblioteka
              </motion.div>
            </motion.div>

            <motion.div className="relative w-40 h-40 flex items-center justify-center mb-16 rounded-full overflow-visible" variants={variants.imageContainer} id="book-container">
              <motion.div
                className="absolute top-2 -bottom-2 inset-x-0 rounded-full bg-gradient-to-br from-white/10 to-transparent"
                variants={variants.glowRing}
                animate="animate"
              />
              <motion.img src="/loading.gif" alt="Loading..." className="w-28 h-28 relative z-10" variants={variants.image} animate={["visible", "pulse"]} />
            </motion.div>

            <motion.div className="h-16 flex items-center justify-center overflow-hidden mb-6 w-full" variants={variants.textContainer}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  className="text-center italic text-lg text-white/90"
                  key={currentPhrase}
                  variants={variants.text}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  style={{ willChange: "opacity, transform", position: "absolute" }}
                >
                  {currentPhrase}
                </motion.p>
              </AnimatePresence>
            </motion.div>

            <motion.button
              className={cn(
                "bg-black/20 rounded-full border border-white/20 shadow-xl text-white font-semibold text-lg",
                "mt-6 px-10 py-4 flex items-center justify-center gap-5 backdrop-blur-sm",
                showStartButton ? "cursor-pointer" : "pointer-events-none",
              )}
              onClick={handleStartClick}
              variants={variants.button}
              initial="invisible"
              animate={showStartButton ? "visible" : "invisible"}
              whileHover={showStartButton ? "hover" : undefined}
              whileTap={showStartButton ? "tap" : undefined}
              style={{ willChange: "transform, opacity, box-shadow" }}
            >
              <div className="relative">
                <Play size={32} />
              </div>
              <span>Start</span>
              {showStartButton && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{
                    boxShadow: ["0 0 0px rgba(255,255,255,0.0)", "0 0 15px rgba(255,255,255,0.3)", "0 0 0px rgba(255,255,255,0.0)"],
                    borderColor: ["rgba(255,255,255,0.2)", "rgba(255,255,255,0.4)", "rgba(255,255,255,0.2)"],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  );
};

export default SplashScreen;

const transitions = {
  ease: (options?: { duration?: number; ease?: string | string[]; delay?: number }): Transition => ({
    duration: options?.duration ?? 0.25,
    ease: options?.ease ?? "easeInOut",
    delay: options?.delay ?? 0,
  }),
  spring: (options?: { stiffness?: number; damping?: number; duration?: number; delay?: number }): Transition => ({
    type: "spring",
    stiffness: options?.stiffness ?? 350,
    damping: options?.damping ?? 30,
    duration: options?.duration ?? 0.25,
    delay: options?.delay ?? 0,
  }),
};

const variants: Record<string, Variants> = {
  mainContainer: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5 } },
    exit: { opacity: 0, scale: 1.1, filter: "brightness(1.5)", transition: { duration: 1, ease: "easeInOut", opacity: { duration: 1 } } },
  },
  glowRing: {
    animate: {
      boxShadow: ["0 0 20px 5px rgba(255,255,255,0.15)", "0 0 40px 15px rgba(255,255,255,0.25)", "0 0 20px 5px rgba(255,255,255,0.15)"],
      rotate: [0, 360],
      transition: { boxShadow: { duration: 3, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 20, repeat: Infinity, ease: "linear" } },
    },
  },
  container: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.3, staggerChildren: 0.1, delayChildren: 0.1, when: "beforeChildren" } } },
  titleContainer: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.3, staggerChildren: 0.08, delayChildren: 0.2, when: "afterChildren" } } },
  title: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 0.8, y: 0, transition: { type: "spring", stiffness: 400, damping: 25, delay: 0.2 } } },
  subtitle: { hidden: { opacity: 0, y: 10 }, visible: { opacity: 0.8, y: 0, transition: { type: "spring", stiffness: 400, damping: 25, delay: 0.3 } } },
  imageContainer: { hidden: { opacity: 0, scale: 0.8 }, visible: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 300, damping: 15, delay: 0.3 } } },
  image: {
    hidden: { opacity: 0, y: 20, scale: 0.8 },
    visible: { opacity: 1, y: 0, scale: 1, transition: transitions.spring({ stiffness: 400, damping: 25 }) },
    pulse: {
      opacity: [1, 0.95, 1],
      filter: [
        "brightness(1) drop-shadow(0px 0px 5px rgba(255,255,255,0.3))",
        "brightness(1.1) drop-shadow(0px 0px 20px rgba(255,255,255,0.5))",
        "brightness(1) drop-shadow(0px 0px 5px rgba(255,255,255,0.3))",
      ],
      transform: ["scale(1) rotate(0.1deg)", "scale(1.1) rotate(0.1deg)", "scale(1) rotate(0.1deg)"],
      transition: { duration: 3, repeat: Infinity, ease: "easeInOut", times: [0, 0.5, 1], repeatDelay: 0.25 },
    },
  },
  textContainer: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { delay: 0.8 } } },
  text: {
    hidden: { opacity: 0, y: 20, filter: "blur(3px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: transitions.spring({ stiffness: 400, damping: 25 }) },
    exit: { opacity: 0, y: -20, filter: "blur(3px)", transition: { duration: 0.2, ease: "easeOut" } },
  },
  button: {
    hidden: { opacity: 0, scale: 0.95, y: 15 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 20, delay: 0.1, duration: 0.4 } },
    invisible: { opacity: 0, scale: 0.95, y: 15, transition: { duration: 0.2 } },
    hover: { scale: 1.05, boxShadow: "0 5px 25px rgba(255,255,255,0.25)", transition: { duration: 0.3, ease: "easeOut" } },
    tap: { scale: 1, boxShadow: "0 2px 10px rgba(255,255,255,0.15)", transition: { duration: 0.1, ease: "easeOut" } },
  },
};
