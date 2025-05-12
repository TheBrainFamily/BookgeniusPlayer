import React, { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type CharacterMediaProps = {
  mediaSrc: string;
  commonAttrs: { "data-original-src": string; "data-character-name": string; "data-summary": string; className: string };
  isVideo: boolean;
  canonicalName: string;
};

const CharacterMedia: React.FC<CharacterMediaProps> = ({ mediaSrc, commonAttrs, isVideo, canonicalName }) => {
  const [videoA_Src, setVideoA_Src] = useState<string | null>(null);
  const [videoB_Src, setVideoB_Src] = useState<string | null>(null);
  const [videoA_Loaded, setVideoA_Loaded] = useState<boolean>(false);
  const [videoB_Loaded, setVideoB_Loaded] = useState<boolean>(false);
  const [isA_Current, setIsA_Current] = useState<boolean>(true);

  useEffect(() => {
    if (isVideo && videoA_Src === null && videoB_Src === null && mediaSrc !== "") {
      setVideoA_Loaded(false);
      setVideoA_Src(mediaSrc);
      setIsA_Current(true);
    } else if (!isVideo && mediaSrc) {
      setVideoA_Src(mediaSrc);
      setVideoA_Loaded(true);
      setVideoB_Src(null);
      setVideoB_Loaded(false);
      setIsA_Current(true);
    }
  }, [mediaSrc, isVideo]);

  useEffect(() => {
    if (!isVideo) {
      if (videoA_Src !== mediaSrc) setVideoA_Src(mediaSrc);
      if (!isA_Current) setIsA_Current(true);
      setVideoA_Loaded(true);
      if (videoB_Src !== null) setVideoB_Src(null);
      setVideoB_Loaded(false);
      return;
    }

    const currentVideoPlayerSrc = isA_Current ? videoA_Src : videoB_Src;
    const currentVideoPlayerLoaded = isA_Current ? videoA_Loaded : videoB_Loaded;

    if (currentVideoPlayerSrc === mediaSrc && currentVideoPlayerLoaded) {
      return;
    }

    if (videoA_Src === mediaSrc && videoA_Loaded && !isA_Current) {
      setIsA_Current(true);
      return;
    }
    if (videoB_Src === mediaSrc && videoB_Loaded && isA_Current) {
      setIsA_Current(false);
      return;
    }

    if (isA_Current) {
      if (videoB_Src !== mediaSrc) {
        setVideoB_Loaded(false);
        setVideoB_Src(mediaSrc);
      }
    } else {
      if (videoA_Src !== mediaSrc) {
        setVideoA_Loaded(false);
        setVideoA_Src(mediaSrc);
      }
    }
  }, [mediaSrc, isVideo, isA_Current, videoA_Src, videoB_Src, videoA_Loaded, videoB_Loaded]);

  const handleLoadedData = (videoIdentity: "A" | "B") => {
    if (videoIdentity === "A") {
      setVideoA_Loaded(true);
      if (videoA_Src === mediaSrc && !isA_Current) {
        setIsA_Current(true);
      }
    } else if (videoIdentity === "B") {
      setVideoB_Loaded(true);
      if (videoB_Src === mediaSrc && isA_Current) {
        setIsA_Current(false);
      }
    }
  };

  if (!isVideo) {
    return <img {...commonAttrs} src={mediaSrc || videoA_Src || ""} alt={canonicalName} />;
  }

  return (
    <div className="relative w-full h-full">
      <video
        key="videoA"
        {...commonAttrs}
        src={videoA_Src || null}
        className={cn(
          "absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out",
          isA_Current ? "opacity-100" : "opacity-0",
          videoA_Loaded && "opacity-100",
        )}
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={() => videoA_Src && handleLoadedData("A")}
        onError={() => {
          console.error(`Error loading video A: ${videoA_Src}`);
          setVideoA_Loaded(false);
        }}
      />
      <video
        key="videoB"
        {...commonAttrs}
        src={videoB_Src || null}
        className={cn(
          "absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out",
          !isA_Current ? "opacity-100" : "opacity-0",
          videoB_Loaded && "opacity-100",
        )}
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={() => videoB_Src && handleLoadedData("B")}
        onError={() => {
          console.error(`Error loading video B: ${videoB_Src}`);
          setVideoB_Loaded(false);
        }}
      />
    </div>
  );
};

export default CharacterMedia;
