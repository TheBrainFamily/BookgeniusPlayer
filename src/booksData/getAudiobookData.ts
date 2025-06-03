import { CURRENT_BOOK } from "@/consts";
import type { AudiobookTracksSection } from "@/getAudiobookTracksForBook";

export async function getAudiobookData(): Promise<AudiobookTracksSection[]> {
  console.log("PINGWING: 6 `./audiobooks/${CURRENT_BOOK.toLowerCase()}AudiobookData.ts`", `./audiobooks/${CURRENT_BOOK.toLowerCase()}AudiobookData.ts`);

  const module = await import(`./audiobooks/${CURRENT_BOOK.toLowerCase()}AudiobookData.ts`);
  return module.AudiobookTracksDefined;
}
