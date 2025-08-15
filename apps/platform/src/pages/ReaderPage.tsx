import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useRouteTransition } from "@platform/providers/RouteTransitionProvider";

const ReaderPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const { finishTransition } = useRouteTransition();

  const playerUrl = `/player/?book=${slug}`;
  const playerOrigin = window.location.origin;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== playerOrigin) return;
      if (event.data === "player-is-ready-for-showtime") {
        setIsPlayerReady(true);
        // Fade out the overlay (enforces min duration internally)
        finishTransition();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [playerOrigin, finishTransition]);

  return (
    <div className="relative w-full h-screen">
      <iframe
        src={playerUrl}
        title={`Book Player - ${slug}`}
        className={`w-full h-full border-0 transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}
      />
    </div>
  );
};

export default ReaderPage;
