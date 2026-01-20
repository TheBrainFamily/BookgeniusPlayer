import EventSource from "react-native-sse";

import { PIPELINE_URL } from "@/lib/pipeline";

export type PageQuestionEvent =
  | { type: "session"; sessionId: string }
  | { type: "chunk"; delta: string }
  | { type: "done"; fullResponse: string }
  | { type: "error"; message: string };

interface StreamHandlers {
  onEvent: (event: PageQuestionEvent) => void;
  onError: (error: unknown) => void;
}

export function startPageQuestionStream(options: {
  bookSlug: string;
  chapterNumber: number;
  imageUri: string;
  mimeType?: string;
  handlers: StreamHandlers;
}) {
  const { bookSlug, chapterNumber, imageUri, mimeType, handlers } = options;
  const formData = new FormData();
  formData.append("bookSlug", bookSlug);
  formData.append("chapterNumber", String(chapterNumber));
  formData.append("image", {
    uri: imageUri,
    name: "page.jpg",
    type: mimeType ?? "image/jpeg",
  } as unknown as Blob);

  const es = new EventSource(`${PIPELINE_URL}/api/page-question/start`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
    },
    body: formData,
  });

  es.addEventListener("session", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.sessionId) {
        handlers.onEvent({ type: "session", sessionId: data.sessionId });
      }
    } catch (error) {
      handlers.onError(error);
    }
  });

  es.addEventListener("chunk", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (typeof data.delta === "string") {
        handlers.onEvent({ type: "chunk", delta: data.delta });
      }
    } catch (error) {
      handlers.onError(error);
    }
  });

  es.addEventListener("done", (event) => {
    try {
      const data = JSON.parse(event.data);
      handlers.onEvent({ type: "done", fullResponse: data.fullResponse ?? "" });
    } catch (error) {
      handlers.onError(error);
    } finally {
      es.close();
    }
  });

  es.addEventListener("error", (event) => {
    handlers.onEvent({ type: "error", message: "Request failed" });
    handlers.onError(event);
    es.close();
  });

  return es;
}

export function followUpPageQuestionStream(options: {
  sessionId: string;
  message: string;
  handlers: StreamHandlers;
}) {
  const { sessionId, message, handlers } = options;
  const es = new EventSource(`${PIPELINE_URL}/api/page-question/follow-up`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, message }),
  });

  es.addEventListener("chunk", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (typeof data.delta === "string") {
        handlers.onEvent({ type: "chunk", delta: data.delta });
      }
    } catch (error) {
      handlers.onError(error);
    }
  });

  es.addEventListener("done", (event) => {
    try {
      const data = JSON.parse(event.data);
      handlers.onEvent({ type: "done", fullResponse: data.fullResponse ?? "" });
    } catch (error) {
      handlers.onError(error);
    } finally {
      es.close();
    }
  });

  es.addEventListener("error", (event) => {
    handlers.onEvent({ type: "error", message: "Request failed" });
    handlers.onError(event);
    es.close();
  });

  return es;
}
