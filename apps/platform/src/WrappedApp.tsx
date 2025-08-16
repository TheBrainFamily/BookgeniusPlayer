import "./player.css";
import Player from "../../player/src/App";
import "../../player/src/i18n";

import { createPortal } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

import { useRouteTransition } from "./providers/RouteTransitionProvider";
import { bookDataLoader } from "../../player/src/services/bookDataLoader";

export const WrappedApp = () => {
  const [searchParams] = useSearchParams();
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const { finishTransition } = useRouteTransition();
  const lastBookRef = useRef<string | null>(null);

  useEffect(() => {
    const handleMessage = () => {
      setIsPlayerReady(true);
      finishTransition();
      window.dispatchEvent(new CustomEvent("splashHidden"));
    };
    window.addEventListener("appReady", handleMessage);
    return () => window.removeEventListener("appReady", handleMessage);
  }, [finishTransition]);

  useEffect(() => {
    const bookFromQuery = searchParams.get("book");
    if (bookFromQuery !== lastBookRef.current) {
      lastBookRef.current = bookFromQuery;
      bookDataLoader.resetCurrentBook();
    }
  }, [searchParams]);

  useEffect(() => {
    document.body.classList.add("is-reader");
    return () => document.body.classList.remove("is-reader");
  }, []);

  const mountNode = typeof document !== "undefined" ? document.getElementById("root-player") : null;
  if (!mountNode) return null;

  const ui = (
    <div className={`w-full h-full transition-opacity duration-500 ${!isPlayerReady ? "opacity-0" : "opacity-100"}`}>
      <Player />
    </div>
  );

  return createPortal(ui, mountNode);
};
