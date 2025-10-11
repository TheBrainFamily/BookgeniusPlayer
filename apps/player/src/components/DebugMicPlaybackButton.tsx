import React, { useMemo, useRef, useState } from "react";
import { Play, Pause, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useRealtime } from "@player/context/RealtimeContext";

const DebugMicPlaybackButton: React.FC = () => {
  const { debugClipUrl, clearDebugClip } = useRealtime();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const visible = useMemo(() => !!debugClipUrl, [debugClipUrl]);

  const handleToggle = async () => {
    if (!audioRef.current || !debugClipUrl) return;
    const el = audioRef.current;
    try {
      if (el.paused) {
        el.currentTime = 0;
        await el.play();
        setPlaying(true);
      } else {
        el.pause();
        setPlaying(false);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleClose = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } catch {}
    clearDebugClip();
    setPlaying(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed bottom-40 right-4 z-50 flex items-center gap-2 bg-black/85 border border-white/30 rounded-full px-3 py-2 shadow-xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <button
            onClick={handleToggle}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            title={playing ? "Pause debug clip" : "Play debug clip"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="text-xs text-white/80 select-none">Last mic clip</span>
          <button onClick={handleClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white" title="Close">
            <X size={14} />
          </button>
          {/* Hidden audio element for playback */}
          <audio ref={audioRef} src={debugClipUrl ?? undefined} onEnded={() => setPlaying(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default DebugMicPlaybackButton;
