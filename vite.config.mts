import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { viteStaticCopy, type Target } from "vite-plugin-static-copy";
import path from "path";
import fs from "fs";

// Workaround to remove unnecessary books chunks from the build
// ToDo: Do not create them in the first place
// const removeChunksPlugin = () => {
//   return {
//     name: "remove-specified-chunks",
//     apply: "build" as const,
//     closeBundle() {
//       console.log(`Removing chunks for books other than: ${currentBookSlug}`); // Use the resolved currentBookSlug
//       const distDir = path.resolve(__dirname, "dist/assets");
//       const toRemove = Object.values(BOOK_SLUGS)
//         .filter((slug) => slug !== currentBookSlug) // Use the resolved currentBookSlug
//         .map((slug) => `${slug.toLowerCase()}`);

//       console.log(`Removing chunks for books: ${toRemove.join(", ")}`);

//       toRemove.forEach((base) =>
//         fs
//           .readdirSync(distDir)
//           .filter((f) => f.toLowerCase().includes(`${base}audiobookdata`) || f.toLowerCase().includes(`${base}bookdata`))
//           .forEach((f) => fs.unlinkSync(path.join(distDir, f))),
//       );
//     },
//   };
// };

interface BookBuildData {
  name: string;
  short_name: string;
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

function getBookConfig() {
  const bookDirName = path.basename(VITE_BOOK_DIR);
  const bookDataPath = path.join("src", "books", bookDirName, "bookData.ts");

  try {
    // Check if the generated bookData.ts file exists
    if (!fs.existsSync(bookDataPath)) {
      throw new Error(`Generated book data file not found at ${bookDataPath}. Make sure to run the book generation first.`);
    }

    // Read the generated bookData.ts file to get the book information
    const bookDataContent = fs.readFileSync(bookDataPath, "utf-8");
    const slugMatch = bookDataContent.match(/slug:\s*["']([^"']+)["']/);
    const titleMatch = bookDataContent.match(/title:\s*["']([^"']+)["']/);

    if (!slugMatch || !titleMatch) {
      throw new Error(`Could not extract slug or title from ${bookDataPath}`);
    }

    // Use the absolute path passed via environment variable for assets
    const assetsPath = path.join(VITE_BOOK_DIR, "assets");

    return {
      slug: slugMatch[1],
      title: titleMatch[1],
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

const bookConfig = getBookConfig();

const activeBookConfig: BookBuildData = { name: bookConfig.title, short_name: bookConfig.slug, staticAssetSourceDir: bookConfig.assetsPath, staticAssetDestDir: bookConfig.slug };
// Prepare targets for vite-plugin-static-copy
const staticCopyTargets: Target[] = [];
if (activeBookConfig.staticAssetSourceDir && activeBookConfig.staticAssetDestDir) {
  staticCopyTargets.push({ src: path.join(activeBookConfig.staticAssetSourceDir, "*"), dest: activeBookConfig.staticAssetDestDir });
}

const bookDataPlugin = () => {
  const selectedAlias = activeBookConfig.short_name;

  // Configuration for file transformations
  const transformConfigs = {
    getBookData: {
      types: `import type { BookData } from "@/books/types";`,
      import: `import { bookData as bookDataInput } from "@/books/${selectedAlias}/bookData";`,
      export: `export function getBookData(): BookData {
  return bookDataInput;
}`,
    },
    getBackgroundsForBook: {
      types: `export type BackgroundsForBook = { chapter: number; file: string; startParagraph?: number }[];`,
      import: `import { getBackgroundsForBook as getBackgroundsForBookInput } from "@/books/${selectedAlias}/getBackgroundsForBook";`,
      export: `export const getBackgroundsForBook: BackgroundsForBook = getBackgroundsForBookInput;`,
    },
    getBackgroundSongsForBook: {
      types: `export type BackgroundSongSection = { chapter: number; paragraph: number; files: string[] };`,
      import: `import { getBackgroundSongsForBook as getBackgroundSongsForBookInput } from "@/books/${selectedAlias}/getBackgroundSongsForBook";`,
      export: `export const getBackgroundSongsForBook = (): BackgroundSongSection[] => {
  return getBackgroundSongsForBookInput();
};`,
    },
    getCutScenesForBook: {
      types: `export type CutScene = { chapter: number; paragraph: number; file: string };`,
      import: `import { getCutScenesForBook as getCutScenesForBookInput } from "@/books/${selectedAlias}/getCutScenesForBook";`,
      export: `export const getCutScenesForBook = (): CutScene[] => {
  return getCutScenesForBookInput();
};`,
    },
    getKnownVideoFiles: {
      types: ``,
      import: `import { getKnownVideoFiles as getKnownVideoFilesInput } from "@/books/${selectedAlias}/getKnownVideoFiles";`,
      export: `export const getKnownVideoFiles = (): string[] => {
  return getKnownVideoFilesInput();
};`,
    },
    getCharactersData: {
      types: ``,
      import: `import { getCharactersData as getCharactersDataInput } from "@/books/${selectedAlias}/getCharactersData";`,
      export: `export const getCharactersData = (): CharacterData[] => {
  return getCharactersDataInput();
};`,
    },
    getBookStringified: {
      types: ``,
      import: `import { getBookStringified as getBookStringifiedInput } from "@/books/${selectedAlias}/getBookStringified";`,
      export: `export const getBookStringified = (): string => {
  return getBookStringifiedInput();
};`,
    },
    getAudiobookTracksForBook: {
      types: `export type WordPosition = [string | number];
export type AudiobookTracksSection = { chapter: number; paragraph: number; file: string; smile_id?: string; "clip-begin": number; "clip-end": number; words?: WordPosition[] };`,
      import: `import { getAudiobookTracksForBook as getAudiobookTracksForBookInput } from "@/books/${selectedAlias}/getAudiobookTracksForBook";`,
      export: `export const getAudiobookTracksForBook = (): AudiobookTracksSection[] => {
  return getAudiobookTracksForBookInput();
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

export default defineConfig({
  // This define will replace all instances of __SELECTED_BOOK_SLUG__ in your client code
  // with the actual string value of currentBookSlug.
  define: {
    __SELECTED_BOOK_SLUG__: JSON.stringify(activeBookConfig.short_name), // Important: JSON.stringify to make it a string literal
  },
  optimizeDeps: { include: ["workbox-core", "workbox-precaching", "workbox-routing", "workbox-strategies", "workbox-range-requests"] },
  plugins: [
    bookDataPlugin(), // Add this before other plugins
    react(),
    viteStaticCopy({ targets: staticCopyTargets }),
    VitePWA({
      srcDir: "src",
      filename: "sw.ts",
      strategies: "injectManifest",
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png,webp}"], maximumFileSizeToCacheInBytes: 30000000 },
      manifest: {
        name: activeBookConfig.name,
        short_name: activeBookConfig.short_name,
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
    watch: {
      ignored: [
        "**/src/data/*.xml",
        "src/genericBookDataGetters/getBookStringified.ts",
        "src/books/Krolowa-Sniegu/getBookStringified.ts",
        "**/public_books/**",
        "**/src/data/tools/Text-Editor/*.xml",
        "**/.vscode/**",
        "**/.cursor/**",
      ],
    },
  },
});
