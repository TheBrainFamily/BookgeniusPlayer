import type { BookData } from "@/books/types";
import { getBookStringified } from "@/books/Krolowa-Sniegu-v2/getBookStringified";
  export const bookData: BookData = {
    slug: "Krolowa-Sniegu-v2",
    metadata: { title: "KrolowaSnieguv2" },
    chapters: 7,
    themeColors: { primaryColor: "#E3F2FD", secondaryColor: "#1976D2", tertiaryColor: "#90CAF9", quaternaryColor: "#0D47A1" },
    hasAudiobook: false,
    bookStringified: getBookStringified(),
    audioPrompt: "",
  };