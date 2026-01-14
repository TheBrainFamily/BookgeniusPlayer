import { useEffect } from "react";
import { useBookConvex } from "@player/context/BookConvexContext";
import { ANSWERS_SERVER_URL } from "@player/lib/consts";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useEmbeddingsHeartbeat() {
  const { bookData } = useBookConvex();
  const bookSlug = bookData?.slug;

  useEffect(() => {
    if (!bookSlug) return;

    const sendHeartbeat = async () => {
      try {
        const url = `${ANSWERS_SERVER_URL}/heartbeat?bookSlug=${encodeURIComponent(bookSlug)}`;
        await fetch(url, { method: "GET" });
      } catch {}
    };

    // Send immediately when bookSlug changes, then continue on interval
    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [bookSlug]);
}
