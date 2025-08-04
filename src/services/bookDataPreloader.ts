import { loadBookData } from "@/genericBookDataGetters/getBookData";
import { loadAllVariants } from "@/genericBookDataGetters/getAllVariants";
import { loadAudiobookTracksForBook } from "@/genericBookDataGetters/getAudiobookTracksForBook";
import { loadBackgroundSongsForBook } from "@/genericBookDataGetters/getBackgroundSongsForBook";
import { loadBackgroundsForBook } from "@/genericBookDataGetters/getBackgroundsForBook";
import { loadBookStringified } from "@/genericBookDataGetters/getBookStringified";
import { loadCharactersData } from "@/genericBookDataGetters/getCharactersData";
import { loadCutScenesForBook } from "@/genericBookDataGetters/getCutScenesForBook";
import { loadKnownVideoFiles } from "@/genericBookDataGetters/getKnownVideoFiles";
import { loadQuizQuestions } from "@/genericBookDataGetters/getQuizQuestions";

export async function preloadAllBookData(): Promise<void> {
  console.log("Preloading book data...");

  try {
    // Load all book data in parallel
    await Promise.all([
      loadBookData(),
      loadAllVariants(),
      loadAudiobookTracksForBook(),
      loadBackgroundSongsForBook(),
      loadBackgroundsForBook(),
      loadBookStringified(),
      loadCharactersData(),
      loadCutScenesForBook(),
      loadKnownVideoFiles(),
      loadQuizQuestions(),
    ]);

    console.log("Book data preloaded successfully");
  } catch (error) {
    console.error("Failed to preload book data:", error);
    throw error;
  }
}
