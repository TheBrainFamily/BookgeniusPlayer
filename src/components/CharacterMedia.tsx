import React, { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type VideoState = "listens" | "speaks";

interface CharacterMediaProps {
  mediaSrc: string;
  commonAttrs: { "data-original-src": string; "data-character-name": string; "data-summary": string; className: string };
  isVideo: boolean;
  canonicalName: string;
  isTalking?: boolean;
}

const useVideoState = (mediaSrc: string, isVideo: boolean, isTalking?: boolean) => {
  const [videoListensSrc, setVideoListensSrc] = useState<string | null>(null);
  const [videoSpeaksSrc, setVideoSpeaksSrc] = useState<string | null>(null);
  const [videoListensLoaded, setVideoListensLoaded] = useState<boolean>(false);
  const [videoSpeaksLoaded, setVideoSpeaksLoaded] = useState<boolean>(false);
  const [isListeningMode, setIsListeningMode] = useState<boolean>(true);

  useEffect(() => {
    if (isVideo && videoListensSrc === null && videoSpeaksSrc === null && mediaSrc !== "") {
      // Set up idle state video (listening mode)
      setVideoListensLoaded(false);
      setVideoListensSrc(mediaSrc);

      // Create talking state video path if possible
      if (mediaSrc.includes(".mp4")) {
        const talkingSrc = mediaSrc.replace("listens.mp4", "speaks.mp4");
        setVideoSpeaksSrc(talkingSrc);
        setVideoSpeaksLoaded(false);
      }

      setIsListeningMode(true);
    } else if (!isVideo && mediaSrc) {
      // Reset to image state
      setVideoListensSrc(mediaSrc);
      setVideoListensLoaded(true);
      setVideoSpeaksSrc(null);
      setVideoSpeaksLoaded(false);
      setIsListeningMode(true);
    }
  }, [mediaSrc, isVideo]);

  // Handle video source and talking state changes
  useEffect(() => {
    if (!isVideo) {
      if (videoListensSrc !== mediaSrc) setVideoListensSrc(mediaSrc);
      if (!isListeningMode) setIsListeningMode(true);
      setVideoListensLoaded(true);
      if (videoSpeaksSrc !== null) setVideoSpeaksSrc(null);
      setVideoSpeaksLoaded(false);
      return;
    }

    if (isTalking !== undefined) {
      setIsListeningMode(!isTalking);
      return;
    }

    const currentVideoPlayerSrc = isListeningMode ? videoListensSrc : videoSpeaksSrc;
    const currentVideoPlayerLoaded = isListeningMode ? videoListensLoaded : videoSpeaksLoaded;

    if (currentVideoPlayerSrc === mediaSrc && currentVideoPlayerLoaded) {
      return;
    }

    if (videoListensSrc === mediaSrc && videoListensLoaded && !isListeningMode) {
      setIsListeningMode(true);
      return;
    }

    if (videoSpeaksSrc === mediaSrc && videoSpeaksLoaded && isListeningMode) {
      setIsListeningMode(false);
      return;
    }

    if (isListeningMode) {
      if (videoSpeaksSrc !== mediaSrc) {
        setVideoSpeaksLoaded(false);
        setVideoSpeaksSrc(mediaSrc);
      }
    } else {
      if (videoListensSrc !== mediaSrc) {
        setVideoListensLoaded(false);
        setVideoListensSrc(mediaSrc);
      }
    }
  }, [mediaSrc, isVideo, isListeningMode, videoListensSrc, videoSpeaksSrc, videoListensLoaded, videoSpeaksLoaded, isTalking]);

  const handleLoadedData = (videoState: VideoState) => {
    if (videoState === "listens") {
      setVideoListensLoaded(true);
      if (videoListensSrc === mediaSrc && !isListeningMode) {
        setIsListeningMode(true);
      }
    } else if (videoState === "speaks") {
      setVideoSpeaksLoaded(true);
      if (videoSpeaksSrc === mediaSrc && isListeningMode) {
        setIsListeningMode(false);
      }
    }
  };

  const handleVideoError = (videoState: VideoState) => {
    if (videoState === "listens") {
      // console.error(`Error loading listening video: ${videoListensSrc}`);
      setVideoListensLoaded(false);
    } else {
      // console.error(`Error loading speaking video: ${videoSpeaksSrc}`);
      setVideoSpeaksLoaded(false);
    }
  };

  return { videoListensSrc, videoSpeaksSrc, videoListensLoaded, videoSpeaksLoaded, isListeningMode, handleLoadedData, handleVideoError };
};

interface VideoPlayerProps {
  state: VideoState;
  src: string | null;
  isActive: boolean;
  commonAttrs: CharacterMediaProps["commonAttrs"];
  onLoaded: (state: VideoState) => void;
  onError: (state: VideoState) => void;
  isTalking?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ state, src, isActive, commonAttrs, onLoaded, onError, isTalking }) => {
  const stateValue = isTalking !== undefined ? (state === "listens" ? (isTalking ? "idle" : "talking") : isTalking ? "talking" : "idle") : "default";

  return (
    <video
      key={`video-${state}`}
      {...commonAttrs}
      src={src || null}
      className={cn("absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out rounded-full", isActive ? "opacity-100" : "opacity-0")}
      autoPlay
      loop
      muted
      playsInline
      onLoadedData={() => src && onLoaded(state)}
      onError={() => onError(state)}
      data-state={stateValue}
    />
  );
};

const CharacterMedia: React.FC<CharacterMediaProps> = ({ mediaSrc, commonAttrs, isVideo, canonicalName, isTalking }) => {
  const { videoListensSrc, videoSpeaksSrc, isListeningMode, handleLoadedData, handleVideoError } = useVideoState(mediaSrc, isVideo, isTalking);
  const _isVideo = mediaSrc.includes(".mp4");

  if (!_isVideo) {
    return <img {...commonAttrs} src={mediaSrc || videoListensSrc || ""} alt={canonicalName} className="rounded-full" />;
  }

  return (
    <div className="relative w-full h-full">
      <VideoPlayer
        state="listens"
        src={videoListensSrc}
        isActive={isListeningMode}
        commonAttrs={commonAttrs}
        onLoaded={handleLoadedData}
        onError={handleVideoError}
        isTalking={isTalking}
      />
      <VideoPlayer
        state="speaks"
        src={videoSpeaksSrc}
        isActive={!isListeningMode}
        commonAttrs={commonAttrs}
        onLoaded={handleLoadedData}
        onError={handleVideoError}
        isTalking={isTalking}
      />
    </div>
  );
};

export default CharacterMedia;
