import { getBookStringified } from "@player/genericBookDataGetters/getBookStringified";
import { getSavedLocation } from "@player/helpers/paragraphsNavigation";
import { useBookContentStore } from "@player/stores/bookContent.store";

class TextCacheManager {
  private static instance: TextCacheManager;
  private inMemoryDoc: Document | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): TextCacheManager {
    if (!TextCacheManager.instance) {
      TextCacheManager.instance = new TextCacheManager();
    }
    return TextCacheManager.instance;
  }

  public initialize() {
    if (this.isInitialized) return;

    try {
      const bookHtmlString = getBookStringified();
      const parser = new DOMParser();
      this.inMemoryDoc = parser.parseFromString(bookHtmlString, "text/html");
      this.isInitialized = true;
      useBookContentStore.getState().setInitialized();
      console.log("TextCacheManager initialized.");

      // Populate cache based on the furthest read location on initial load
      const furthestLocation = getSavedLocation();
      if (furthestLocation) {
        console.log("Populating text cache based on furthest read location:", furthestLocation);
        this.ensureCacheUpto(furthestLocation.currentChapter, furthestLocation.currentParagraph);
      }
    } catch (error) {
      console.error("Failed to parse book HTML for caching", error);
    }
  }

  public ensureCacheUpto(chapterId: number, paragraphId: number) {
    if (!this.isInitialized || !this.inMemoryDoc) return;

    const { textCache, addParagraphsToCache } = useBookContentStore.getState();

    for (let c = 1; c <= chapterId; c++) {
      const paragraphsToCache: { [key: number]: string } = {};
      let newParagraphsFound = false;

      const chapterNode = this.inMemoryDoc.querySelector(`section[data-chapter="${c}"]`);
      if (!chapterNode) continue;

      const lastParagraphToCache = c < chapterId ? Infinity : paragraphId;

      const paragraphNodes = chapterNode.querySelectorAll("[data-index]");
      paragraphNodes.forEach((pNode) => {
        const pIndex = parseInt(pNode.getAttribute("data-index")!, 10);
        if (pIndex <= lastParagraphToCache) {
          if (!textCache[c]?.[pIndex]) {
            paragraphsToCache[pIndex] = pNode.textContent?.replace(/\s+/g, " ").trim() || "";
            newParagraphsFound = true;
          }
        }
      });

      if (newParagraphsFound) {
        addParagraphsToCache(c, paragraphsToCache);
      }
    }
  }
}

export const textCacheManager = TextCacheManager.getInstance();
