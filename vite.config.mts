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

// Validate environment variables
const VITE_BOOK = process.env.VITE_BOOK;
const VITE_BOOK_NAME = process.env.VITE_BOOK_NAME;
const VITE_BOOK_PATH = process.env.VITE_BOOK_PATH;

if (!VITE_BOOK || !VITE_BOOK_NAME || !VITE_BOOK_PATH) {
  console.error("❌ Missing required environment variables:");
  if (!VITE_BOOK) console.error("  - VITE_BOOK is not set");
  if (!VITE_BOOK_NAME) console.error("  - VITE_BOOK_NAME is not set");
  if (!VITE_BOOK_PATH) console.error("  - VITE_BOOK_PATH is not set");
  console.error("\nPlease set these environment variables before building:");
  console.error("Example: VITE_BOOK='Snow-Queen' VITE_BOOK_NAME='Snow Queen' VITE_BOOK_PATH='./public_books/Snow-Queen' pnpm build");
  process.exit(1);
}

const activeBookConfig: BookBuildData = {
  name: VITE_BOOK_NAME,
  short_name: VITE_BOOK,
  staticAssetSourceDir: `${VITE_BOOK_PATH}/assets`,
  staticAssetDestDir: VITE_BOOK,
};
// Prepare targets for vite-plugin-static-copy
const staticCopyTargets: Target[] = [];
if (activeBookConfig.staticAssetSourceDir && activeBookConfig.staticAssetDestDir) {
  staticCopyTargets.push({ src: path.join(activeBookConfig.staticAssetSourceDir, "*"), dest: activeBookConfig.staticAssetDestDir });
}
const bookDataPlugin = () => {
  return {
    name: "book-data-replacer",
    enforce: "pre" as const,
    async transform(code: string, id: string) {
      // Only transform the getBookData file
      const selectedAlias = activeBookConfig.short_name;
      if (!id.includes("node_modules") && !id.includes("src/books/")) {
        if (id.includes("getBookData")) {
          const finalCode = `
                import type { BookData } from "@/books/types";
                import { bookData as bookDataInput } from "@/books/${selectedAlias}/bookData";
                export function getBookData(): BookData {
                  return bookDataInput;
        }`;

          return { code: finalCode, map: null };
        }

        if (id.includes("backgroundsForBook")) {
          return {
            code: `
                    export type BackgroundsForBook = { chapter: number; file: string; startParagraph?: number }[];

        import { backgroundsForBook as backgroundsForBookInput } from "@/books/${selectedAlias}/backgroundsForBook";

        export const backgroundsForBook: BackgroundsForBook = backgroundsForBookInput;
        `,
            map: null,
          };
        }
        if (id.includes("getBackgroundSongsForBook")) {
          return {
            code: `
        export type BackgroundSongSection = { chapter: number; paragraph: number; files: string[] };

        import { getBackgroundSongsForBook as getBackgroundSongsForBookInput } from "@/books/${selectedAlias}/getBackgroundSongsForBook";

        export const getBackgroundSongsForBook = (): BackgroundSongSection[] => {
  return getBackgroundSongsForBookInput();
};
        `,
            map: null,
          };
        }
        if (id.includes("getCutScenesForBook")) {
          return {
            code: `
            export type CutScene = { chapter: number; paragraph: number; file: string };
            import { getCutScenesForBook as getCutScenesForBookInput } from "@/books/${selectedAlias}/getCutScenesForBook";

        export const getCutScenesForBook = (): CutScene[] => {
  return getCutScenesForBookInput();
};
`,
            map: null,
          };
        }
        if (id.includes("getKnownVideoFiles")) {
          return {
            code: `
            import { getKnownVideoFiles as getKnownVideoFilesInput } from "@/books/${selectedAlias}/getKnownVideoFiles";
            export const getKnownVideoFiles = (): string[] => {
              return getKnownVideoFilesInput();
            }; 
            `,
            map: null,
          };
        }
        if (id.includes("getCharactersData")) {
          return {
            code: `
            import { getCharactersData as getCharactersDataInput } from "@/books/${selectedAlias}/getCharactersData";
            export const getCharactersData = (): CharacterData[] => {
              return getCharactersDataInput();
            }; 
            `,
            map: null,
          };
        }
        if (id.includes("getBookStringified")) {
          return {
            code: `
            import { getBookStringified as getBookStringifiedInput } from "@/books/${selectedAlias}/getBookStringified";
            export const getBookStringified = (): string => {
              return getBookStringifiedInput();
            }; 
            `,
            map: null,
          };
        }
        if (id.includes("getKnownVideoFiles")) {
          return {
            code: `           
            import { getKnownVideoFiles as getKnownVideoFilesInput } from "@/books/${selectedAlias}/getKnownVideoFiles.ts";
            export const getKnownVideoFiles = (): string[] => {
              if (getKnownVideoFilesInput) {
                return getKnownVideoFilesInput();
              }        
              throw new Error("getKnownVideoFiles should never be called at runtime");
            };
            `,
            map: null,
          };
        }
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
