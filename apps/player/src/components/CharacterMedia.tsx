import React, { useEffect, useState } from "react";

import { cn } from "@player/lib/utils";
import { getPlaceholderFromVideoUrl } from "@player/utils/getPlaceholderFromVideoUrl";
import { getSpeaksUrlForListens } from "@player/utils/assetUrls";

type VideoState = "listens" | "speaks";

interface CharacterMediaProps {
  mediaSrc: string;
  commonAttrs: {
    "data-original-src": string;
    "data-character-name": string;
    "data-summary": string;
    className: string;
  };
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
    if (!mediaSrc) return;

    if (isVideo) {
      // Detect when mediaSrc changed to a new URL (initial load or reactive update)
      if (mediaSrc !== videoListensSrc) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing video state with prop changes
        setVideoListensLoaded(false);

        setVideoListensSrc(mediaSrc);

        // Look up the speaks URL from the registry
        const talkingSrc = getSpeaksUrlForListens(mediaSrc);
        setVideoSpeaksSrc(talkingSrc ?? mediaSrc);
        setVideoSpeaksLoaded(false);
        setIsListeningMode(true);
      }
    } else {
      // Image mode
      if (mediaSrc !== videoListensSrc) {
        setVideoListensSrc(mediaSrc);
        setVideoListensLoaded(true);
        setVideoSpeaksSrc(null);
        setVideoSpeaksLoaded(false);
        setIsListeningMode(true);
      }
    }
  }, [mediaSrc, isVideo, videoListensSrc]);

  // Handle video source and talking state changes
  useEffect(() => {
    if (!isVideo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing video state for image mode
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
  }, [
    mediaSrc,
    isVideo,
    isListeningMode,
    videoListensSrc,
    videoSpeaksSrc,
    videoListensLoaded,
    videoSpeaksLoaded,
    isTalking,
  ]);

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

  return {
    videoListensSrc,
    videoSpeaksSrc,
    videoListensLoaded,
    videoSpeaksLoaded,
    isListeningMode,
    handleLoadedData,
    handleVideoError,
  };
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

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  state,
  src,
  isActive,
  commonAttrs,
  onLoaded,
  onError,
  isTalking,
}) => {
  const stateValue =
    isTalking !== undefined
      ? state === "listens"
        ? isTalking
          ? "idle"
          : "talking"
        : isTalking
          ? "talking"
          : "idle"
      : "default";

  return (
    <video
      key={`video-${state}`}
      {...commonAttrs}
      src={src || undefined} //TODO: why would this ever be undefined?
      className={cn(
        "absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out rounded-full",
        isActive ? "opacity-100" : "opacity-0",
      )}
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

const CharacterMedia: React.FC<CharacterMediaProps> = ({
  mediaSrc,
  commonAttrs,
  isVideo,
  canonicalName,
  isTalking,
}) => {
  const {
    videoListensSrc,
    videoSpeaksSrc,
    isListeningMode,
    handleLoadedData,
    handleVideoError,
    videoListensLoaded,
    videoSpeaksLoaded,
  } = useVideoState(mediaSrc, isVideo, isTalking);

  if (!isVideo) {
    return (
      <img
        {...commonAttrs}
        src={mediaSrc || ""}
        alt={canonicalName}
        className="rounded-full w-full"
      />
    );
  }

  const placeholderSrc = getPlaceholderFromVideoUrl(videoListensSrc || mediaSrc);

  // Determine video display logic based on new layering requirements
  const hasBothVideos =
    videoListensSrc && videoSpeaksSrc && videoListensLoaded && videoSpeaksLoaded;
  const hasOnlySpeakingVideo =
    videoSpeaksSrc && videoSpeaksLoaded && (!videoListensSrc || !videoListensLoaded);
  const currentlyTalking = isTalking !== undefined ? isTalking : !isListeningMode;

  let showListensVideo = false;
  let showSpeaksVideo = false;

  if (hasBothVideos) {
    // Both videos available - image underneath, speaking covers listening
    showListensVideo = !currentlyTalking;
    showSpeaksVideo = currentlyTalking;
  } else if (hasOnlySpeakingVideo) {
    // Only speaking video - image acts as listening state
    // Show speaking video only when talking, otherwise image shows through
    showSpeaksVideo = currentlyTalking;
    showListensVideo = false; // image handles the listening role
  } else {
    // Only listening video or fallback to original logic
    showListensVideo = videoListensLoaded && !currentlyTalking;
    showSpeaksVideo = false;
  }

  return (
    <div className="relative w-full h-full">
      {placeholderSrc && (
        <img
          src={placeholderSrc}
          alt={canonicalName}
          loading="eager"
          decoding="async"
          className="absolute top-0 left-0 w-full h-full object-cover rounded-full"
        />
      )}
      <VideoPlayer
        state="listens"
        src={videoListensSrc}
        isActive={showListensVideo}
        commonAttrs={commonAttrs}
        onLoaded={handleLoadedData}
        onError={handleVideoError}
        isTalking={isTalking}
      />
      <VideoPlayer
        state="speaks"
        src={videoSpeaksSrc}
        isActive={showSpeaksVideo}
        commonAttrs={commonAttrs}
        onLoaded={handleLoadedData}
        onError={handleVideoError}
        isTalking={isTalking}
      />
    </div>
  );
};

export default CharacterMedia;
