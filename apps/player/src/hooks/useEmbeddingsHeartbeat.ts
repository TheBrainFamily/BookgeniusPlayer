import { useEffect, useRef } from "react";
import { useBookConvex } from "@player/context/BookConvexContext";
import { ANSWERS_SERVER_URL } from "@player/lib/consts";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useEmbeddingsHeartbeat() {
  const { bookData } = useBookConvex();
  const bookSlug = bookData?.slug;
  const sentInitial = useRef(false);

  useEffect(() => {
    if (!bookSlug) return;

    const sendHeartbeat = async () => {
      try {
        const url = `${ANSWERS_SERVER_URL}/heartbeat?bookSlug=${encodeURIComponent(bookSlug)}`;
        await fetch(url, { method: "GET" });
      } catch {}
    };

    if (!sentInitial.current) {
      sendHeartbeat();
      sentInitial.current = true;
    }

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [bookSlug]);
}
