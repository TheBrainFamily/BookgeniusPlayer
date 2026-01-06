import { type Location } from "./state/LocationContext";
import { type Filter } from "./types/book";
import { getSurroundingText } from "@player/utils/getSurroundingText";
import { getBookSlug } from "./state/bookDataStore";
import { ANSWERS_SERVER_URL } from "./lib/consts";

type Handlers = {
  onMeta?: (needMore: boolean) => void;
  onChunk?: (delta: string) => void;
  onDone?: (final: { text?: string; needMore: boolean }) => void;
  onError?: (err: unknown) => void;
};

export function askStream(query: string, location: Location, handlers: Handlers) {
  const slug = getBookSlug();
  if (!slug) throw new Error("[askStream] Book slug not available");

  const filter: Filter = {
    chapterFrom: 1,
    chapterTo: location.endChapter,
    paragraphTo: location.endParagraph,
    bookSlug: slug,
  };

  const surroundingText = getSurroundingText(location);

  const compiledSearchQuery = `<userQuery>${query}</userQuery>\n\nThe user is looking at the following text:\n<VisibleText>${surroundingText}</VisibleText>`;

  const params = new URLSearchParams({
    question: compiledSearchQuery,
    filter: JSON.stringify(filter),
  });
  const url = `${ANSWERS_SERVER_URL}/ask/stream?${params.toString()}`;

  const es = new EventSource(url);

  es.addEventListener("meta", (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      handlers.onMeta?.(!!data.needMore);
    } catch (e) {
      // ignore JSON errors
    }
  });

  es.addEventListener("chunk", (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      if (typeof data.delta === "string") handlers.onChunk?.(data.delta);
    } catch (e) {
      // ignore JSON errors
    }
  });

  es.addEventListener("done", (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      handlers.onDone?.(data);
    } catch (e) {
      handlers.onDone?.({ needMore: false });
    }
    es.close();
  });

  es.addEventListener("error", (ev: Event) => {
    handlers.onError?.(ev);
    es.close();
  });

  return es;
}
