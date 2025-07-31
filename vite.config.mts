import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createHtmlPlugin } from "vite-plugin-html";
import { viteStaticCopy, type Target } from "vite-plugin-static-copy";

interface BookBuildData {
  name: string;
  slug: string;
  staticAssetSourceDir: string;
  staticAssetDestDir: string;
}

const VITE_BOOK_DIR = process.env.VITE_BOOK_DIR;
if (!VITE_BOOK_DIR) {
  console.error("❌ Missing required environment variable:");
  console.error("  - VITE_BOOK_DIR is not set");
  console.error("\nPlease set this environment variable before building:");
  console.error("Example: VITE_BOOK_DIR='./public_books/Krolowa-Sniegu' pnpm build");
  process.exit(1);
}

async function getBookConfig() {
  const bookDirName = path.basename(VITE_BOOK_DIR!);
  const bookDataPath = path.join(process.cwd(), "src", "books", bookDirName, "bookData.ts");

  try {
    // Check if the generated bookData.ts file exists
    if (!fs.existsSync(bookDataPath)) {
      throw new Error(`Generated book data file not found at ${bookDataPath}. Make sure to run the book generation first.`);
    }

    // Read the generated bookData.ts file to get the book information
    const fileUrl = pathToFileURL(bookDataPath).href;
    const bookModule = await import(fileUrl);
    const bookData = bookModule.bookData;

    if (!bookData || !bookData.slug || !bookData.metadata || !bookData.metadata.title) {
      throw new Error(`Invalid data structure in imported bookData from ${bookDataPath}`);
    }

    // Use the absolute path passed via environment variable for assets
    const assetsPath = path.join(VITE_BOOK_DIR!, "assets");

    return {
      slug: bookData.slug,
      title: bookData.metadata.title,
      author: bookData.metadata.author,
      language: bookData.metadata.language,
      assetsPath: assetsPath,
      bookDir: VITE_BOOK_DIR, // Include the full book directory path
    };
  } catch (error) {
    console.error(`❌ Error reading book data from ${bookDataPath}:`, error);
    console.error("Make sure the book has been generated with 'pnpm start <book_directory>' first");
    console.error(`Book directory provided: ${VITE_BOOK_DIR}`);
    process.exit(1);
  }
}

const bookDataPlugin = (slug: string) => {
  // Configuration for file transformations
  const transformConfigs = {
    getBookData: {
      types: `import type { BookData } from "@/types/book";`,
      import: `import { bookData as bookDataInput } from "@/books/${slug}/bookData";`,
      export: `export function getBookData(): BookData {
  return bookDataInput;
}`,
    },
    getBackgroundsForBook: {
      types: `import type { BackgroundForBook } from "@/types/book";`,
      import: `import { getBackgroundsForBook as getBackgroundsForBookInput } from "@/books/${slug}/getBackgroundsForBook";`,
      export: `export const getBackgroundsForBook: BackgroundsForBook = getBackgroundsForBookInput;`,
    },
    getBackgroundSongsForBook: {
      types: `import type { BackgroundSongForBook } from "@/types/book";`,
      import: `import { getBackgroundSongsForBook as getBackgroundSongsForBookInput } from "@/books/${slug}/getBackgroundSongsForBook";`,
      export: `export const getBackgroundSongsForBook = (): BackgroundSongSection[] => {
  return getBackgroundSongsForBookInput();
};`,
    },
    getCutScenesForBook: {
      types: `import type { CutSceneForBook } from "@/types/book";`,
      import: `import { getCutScenesForBook as getCutScenesForBookInput } from "@/books/${slug}/getCutScenesForBook";`,
      export: `export const getCutScenesForBook = (): CutScene[] => {
  return getCutScenesForBookInput();
};`,
    },
    getKnownVideoFiles: {
      types: ``,
      import: `import { getKnownVideoFiles as getKnownVideoFilesInput } from "@/books/${slug}/getKnownVideoFiles";`,
      export: `export const getKnownVideoFiles = (): string[] => {
  return getKnownVideoFilesInput();
};`,
    },
    getCharactersData: {
      types: ``,
      import: `import { getCharactersData as getCharactersDataInput } from "@/books/${slug}/getCharactersData";`,
      export: `export const getCharactersData = (): CharacterData[] => {
  return getCharactersDataInput();
};`,
    },
    getBookStringified: {
      types: ``,
      import: `import { getBookStringified as getBookStringifiedInput } from "@/books/${slug}/getBookStringified";`,
      export: `export const getBookStringified = (): string => {
  return getBookStringifiedInput();
};`,
    },
    getAudiobookTracksForBook: {
      types: `import type { AudiobookTracksSection } from "@/types/book";`,
      import: `import { getAudiobookTracksForBook as getAudiobookTracksForBookInput } from "@/books/${slug}/getAudiobookTracksForBook";`,
      export: `export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  return getAudiobookTracksForBookInput();
};`,
    },
    getAllVariants: {
      types: ``,
      import: `import { getAllVariants as getAllVariantsInput } from "@/books/${slug}/getAllVariants";`,
      export: `export const getAllVariants = () => {
  return getAllVariantsInput();
};`,
    },
    getQuizQuestions: {
      types: `import type { QuizOutput } from "@/types/book";`,
      import: `import { getQuizQuestions as getQuizQuestionsInput } from "@/books/${slug}/getQuizQuestions";`,
      export: `export const getQuizQuestions = (): QuizOutput[] => {
  return getQuizQuestionsInput();
};`,
    },
  };

  return {
    name: "book-data-replacer",
    enforce: "pre" as const,
    async transform(_code: string, id: string) {
      // Skip node_modules and book-specific directories
      if (id.includes("node_modules") || id.includes("src/books/")) {
        return;
      }

      const matchingKey = Object.keys(transformConfigs).find((key) => id.includes(key));

      if (matchingKey) {
        const config = transformConfigs[matchingKey as keyof typeof transformConfigs];
        const code = [config.types, config.import, config.export].filter(Boolean).join("\n\n");

        return { code, map: null };
      }
    },
  };
};

const getSplashScreenTexts = (bookLang: string, bookSlug: string) => {
  const langCodeMap: { [key: string]: string } = { polish: "pl", english: "en" };
  const langCode = langCodeMap[bookLang.toLowerCase()] || bookLang;

  const langFilePath = path.resolve(__dirname, `public/locales/${langCode}/translation.json`);
  const langFileContent = JSON.parse(fs.readFileSync(langFilePath, "utf-8"));

  const bookSpecificPhrases = langFileContent.books?.[bookSlug]?.loading_phrases;
  const loadingPhrases = bookSpecificPhrases || langFileContent.loading_phrases;

  return { splashSubtitle: langFileContent.splash_subtitle, startButtonText: langFileContent.start_button, loadingPhrases: JSON.stringify(loadingPhrases) };
};

export default defineConfig(async () => {
  const bookConfig = await getBookConfig();

  const activeBookConfig: BookBuildData = { name: bookConfig.title, slug: bookConfig.slug, staticAssetSourceDir: bookConfig.assetsPath, staticAssetDestDir: bookConfig.slug };

  const staticCopyTargets: Target[] = [];
  if (activeBookConfig.staticAssetSourceDir && activeBookConfig.staticAssetDestDir) {
    staticCopyTargets.push({ src: path.join(activeBookConfig.staticAssetSourceDir, "*"), dest: activeBookConfig.staticAssetDestDir });
  }

  return {
    // This define will replace all instances of __SELECTED_BOOK_SLUG__ in your client code
    // with the actual string value of currentBookSlug.
    define: {
      __SELECTED_BOOK_SLUG__: JSON.stringify(activeBookConfig.slug), // Important: JSON.stringify to make it a string literal
    },
    optimizeDeps: { include: ["workbox-core", "workbox-precaching", "workbox-routing", "workbox-strategies", "workbox-range-requests"] },
    plugins: [
      bookDataPlugin(bookConfig.slug),
      createHtmlPlugin({
        inject: {
          data: {
            lang: bookConfig.language,
            title: bookConfig.title || "BookGenius",
            subtitle: bookConfig.author || "Books reimagined",
            loaderVideoSrc: `/public_books/${activeBookConfig.slug}/assets/loader.mp4`,
            ...getSplashScreenTexts(bookConfig.language, bookConfig.slug),
          },
        },
      }),
      react(),
      viteStaticCopy({ targets: staticCopyTargets }),
      VitePWA({
        srcDir: "src",
        filename: "sw.ts",
        strategies: "injectManifest",
        injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,webp}"], maximumFileSizeToCacheInBytes: 30000000 },
        manifest: {
          name: activeBookConfig.name,
          short_name: activeBookConfig.slug,
          start_url: "/",
          display: "standalone",
          background_color: "#333333",
          theme_color: "#333333",
          orientation: "landscape",
          icons: [
            { src: "icons/icon-192x192.png", type: "image/png", sizes: "192x192", purpose: "any maskable" },
            { src: "icons/icon-512x512.png", type: "image/png", sizes: "512x512", purpose: "any maskable" },
          ],
        },
        devOptions: { enabled: true },
      }),
    ],
    root: "./",
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    build: { outDir: "dist", sourcemap: true, emptyOutDir: true },
    server: {
      port: 5173,
      open: false,
      proxy: { "/api": "http://localhost:3000" },
      watch: { ignored: ["**/src/data/*.xml", "**/public_books/**", "**/src/data/tools/Text-Editor/*.xml", "**/.vscode/**", "**/.cursor/**"] },
    },
  };
});
