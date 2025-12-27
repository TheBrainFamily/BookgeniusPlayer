import logUpdate from "log-update";

export interface Book {
  kind: string;
  full_sort_key: string;
  title: string;
  url: string;
  cover_color: string;
  author: string;
  cover: string;
  epoch: string;
  href: string;
  has_audio: boolean;
  genre: string;
  simple_thumb: string;
  slug: string;
  cover_thumb: string;
  liked: null;
}

export interface DetailedBookData {
  title: string;
  url: string;
  language: string;
  epochs: { url: string; href: string; name: string; slug: string }[];
  genres: { url: string; href: string; name: string; slug: string }[];
  kinds: { url: string; href: string; name: string; slug: string }[];
  authors: { url: string; href: string; name: string; slug: string }[];
  translators: { name: string }[];
  fragment_data: { title: string; html: string };
  children: Book[];
  parent: null | unknown;
  preview: boolean;
  epub: string;
  mobi: string;
  pdf: string;
  html: string;
  txt: string;
  fb2: string;
  xml: string;
  media: { url: string; director: string; type: string; name: string; artist: string }[];
  audio_length: string;
  cover_color: string;
  simple_cover: string;
  cover_thumb: string;
  cover: string;
  simple_thumb: string;
  isbn_pdf: string;
  isbn_epub: string;
  isbn_mobi: string;
  slug: string;
}

export const booksIcon = ["📚", "📕", "📓", "📘", "📔", "📖"];

export const bookName = (book: Book) => `${book.title}, ${book.author}`;

export const removeDuplicateSubstrings = (input: string): string => {
  const parts = input.split(", ");
  const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index);
  const result = uniqueParts.join(" ");
  return result.replace(/\s+/g, "-");
};

export type LoadingStatus = Record<string, "downloading" | "done">;

export const createLoadingAnimation = () => {
  const loadingStatus: LoadingStatus = {};
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;

  const loadingInterval = setInterval(() => {
    const frame = frames[(i = ++i % frames.length)];
    const statusLines = Object.entries(loadingStatus)
      .map(([name, status]) => `${status === "done" ? "✅" : frame} ${name}: ${status}`)
      .join("\n");
    logUpdate(statusLines);
  }, 80);

  return {
    addItem: (name: string) => {
      loadingStatus[name] = "downloading";
    },
    updateStatus: (name: string, status: "downloading" | "done") => {
      loadingStatus[name] = status;
    },
    complete: () => {
      // Make sure all status indicators show as completed before clearing
      Object.keys(loadingStatus).forEach((key) => {
        loadingStatus[key] = "done";
      });

      // Render one final time to ensure all items show the green checkmark
      const finalStatusLines = Object.entries(loadingStatus)
        .map(([name, status]) => `✅ ${name}: ${status}`)
        .join("\n");
      logUpdate(finalStatusLines);

      clearInterval(loadingInterval);
      logUpdate.done();
    },
  };
};
