import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { BookLoader } from "@/components/BookLoader";
import { books } from "@/books";

const ReaderPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const playerUrl = `/player/?book=${slug}`;
  const playerOrigin = window.location.origin;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log("[Platform] Message received:", event);
      // Security check: ensure the message is from our own domain
      if (event.origin !== playerOrigin) {
        return;
      }

      // Listen for the one and only signal we care about
      if (event.data === "player-is-ready-for-showtime") {
        console.log("[Platform] Showtime signal received! Revealing player.");
        setIsPlayerReady(true);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [playerOrigin]);

  return (
    <div className="relative w-full h-screen">
      <BookLoader
        title={books.find((book) => book.slug === slug)?.title || "BookGenius"}
        subtitle="Loading..."
        loadingPhrases={books.find((book) => book.slug === slug)?.phrases || ["Loading...", "Creating the story...", "Waking up the director...", "Warming up the speakers..."]}
        isLoaded={!!isPlayerReady}
      />

      <iframe
        src={playerUrl}
        title={`Book Player - ${slug}`}
        className={`w-full h-full border-0 transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}
      />
    </div>
  );
};

export default ReaderPage;
