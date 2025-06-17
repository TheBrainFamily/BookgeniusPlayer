import { CURRENT_BOOK } from "@/consts";
import type { AudiobookTracksSection } from "@/getAudiobookTracksForBook";

export async function getAudiobookData(): Promise<AudiobookTracksSection[]> {
  const module = await import(`./audiobooks/${CURRENT_BOOK.toLowerCase()}AudiobookData.ts`);
  return module.AudiobookTracksDefined;
}
