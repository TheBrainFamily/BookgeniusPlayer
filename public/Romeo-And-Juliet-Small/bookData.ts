import type { BookData } from "@/types/book";

export const bookData: BookData = {
  slug: "Romeo-And-Juliet-Small",
  metadata: { title: "Romeo and Juliet", author: "William Shakespeare", language: "english", bookForm: "play" },
  chapters: [
    { id: "1", title: "ACT I, Prologue" },
    { id: "2", title: "ACT I, SCENE I. Verona. A public place." },
  ],
  themeColors: { primaryColor: "#E3F2FD", secondaryColor: "#1976D2", tertiaryColor: "#90CAF9", quaternaryColor: "#0D47A1", simplifiedIconColor: "#893200" },
  hasAudiobook: false,
};
