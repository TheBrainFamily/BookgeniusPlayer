import { loadBookData } from "@player/genericBookDataGetters/getBookData";
import { loadAllVariants } from "@player/genericBookDataGetters/getAllVariants";
import { loadNotes } from "@player/genericBookDataGetters/getNotes";
import { loadAudiobookTracksForBook } from "@player/genericBookDataGetters/getAudiobookTracksForBook";
import { loadBackgroundSongsForBook } from "@player/genericBookDataGetters/getBackgroundSongsForBook";
import { loadBackgroundsForBook } from "@player/genericBookDataGetters/getBackgroundsForBook";
import { loadBookStringified } from "@player/genericBookDataGetters/getBookStringified";
import { loadCharactersData } from "@player/genericBookDataGetters/getCharactersData";
import { loadCutScenesForBook } from "@player/genericBookDataGetters/getCutScenesForBook";
import { loadKnownVideoFiles } from "@player/genericBookDataGetters/getKnownVideoFiles";
import { loadBookColorsCSS } from "@player/utils/loadBookColors";

export async function preloadAllBookData(): Promise<void> {
  console.log("Preloading book data...");

  try {
    // Load all book data in parallel
    await Promise.all([
      loadBookData(),
      loadAllVariants(),
      loadNotes(),
      loadAudiobookTracksForBook(),
      loadBackgroundSongsForBook(),
      loadBackgroundsForBook(),
      loadBookStringified(),
      loadCharactersData(),
      loadCutScenesForBook(),
      loadKnownVideoFiles(),
      loadBookColorsCSS(),
    ]);

    console.log("Book data preloaded successfully");
  } catch (error) {
    console.error("Failed to preload book data:", error);
    throw error;
  }
}
