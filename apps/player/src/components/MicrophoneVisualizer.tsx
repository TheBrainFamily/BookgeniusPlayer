import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic } from "lucide-react";

interface MicrophoneVisualizerProps {
  isActive: boolean;
  onMicReady?: (ready: boolean) => void;
}

export const MicrophoneVisualizer: React.FC<MicrophoneVisualizerProps> = ({ isActive, onMicReady }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [volume, setVolume] = useState(0);
  const framesWithDataRef = useRef<number>(0);
  const micReadyRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isActive) {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      streamRef.current = null;
      setVolume(0);
      framesWithDataRef.current = 0;
      if (micReadyRef.current) {
        micReadyRef.current = false;
        onMicReady?.(false);
      }
      return;
    }

    // Setup audio visualization
    const setupAudioVisualization = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
          if (!analyserRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);

          // Calculate average volume
          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const average = sum / bufferLength;
          const normalizedVolume = Math.min(average / 128, 1); // Normalize to 0-1

          setVolume(normalizedVolume);

          // Detect microphone readiness - check if we're getting consistent data
          // Even silence produces data (noise floor), so any non-zero values mean the mic is working
          const hasData = dataArray.some((val) => val > 0);
          if (hasData) {
            framesWithDataRef.current += 1;
            // Wait for 5 consecutive frames with data to ensure mic is truly ready
            if (framesWithDataRef.current >= 5 && !micReadyRef.current) {
              micReadyRef.current = true;
              console.log("Microphone ready after", framesWithDataRef.current, "frames");
              onMicReady?.(true);
            }
          }

          // Draw waveform on canvas
          if (canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const width = canvas.width;
            const height = canvas.height;

            ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
            ctx.fillRect(0, 0, width, height);

            const barWidth = (width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
              barHeight = (dataArray[i] / 255) * height;

              const hue = (i / bufferLength) * 60 + 180; // Blue to cyan
              ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.8)`;
              ctx.fillRect(x, height - barHeight, barWidth, barHeight);

              x += barWidth + 1;
            }
          }

          animationFrameRef.current = requestAnimationFrame(draw);
        };

        draw();
      } catch (error) {
        console.error("Error setting up audio visualization:", error);
      }
    };

    setupAudioVisualization();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [isActive]);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          className="fixed bottom-24 right-4 z-50 bg-black/90 border border-white/30 rounded-xl p-4 shadow-2xl"
          style={{ width: "280px" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Mic size={16} className="text-red-400" />
            <span className="text-white text-sm font-medium">Microphone Input</span>
          </div>

          {/* Canvas for waveform */}
          <canvas ref={canvasRef} width={248} height={60} className="w-full rounded bg-black/50" />

          {/* Volume meter */}
          <div className="mt-2">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400"
                style={{ width: `${volume * 100}%` }}
                initial={{ width: 0 }}
                animate={{ width: `${volume * 100}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            <div className="text-xs text-white/60 mt-1">
              {volume === 0 ? "No audio detected" : volume < 0.1 ? "Very quiet" : volume < 0.3 ? "Quiet" : volume < 0.6 ? "Normal" : "Loud"}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};