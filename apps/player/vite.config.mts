import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createHtmlPlugin } from "vite-plugin-html";

export default defineConfig(async () => {
  // Determine environment from command line args or env var
  const isDocker = process.argv.includes("--docker") || process.env.BUILD_ENV === "docker";

  // Load environment configuration
  const envConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "env.config.json"), "utf-8"));
  const currentEnv = isDocker ? "docker" : "development";
  console.log("currentEnv", currentEnv);
  const config = envConfig[currentEnv];
  console.log("config", config);
  // For now, hardcode default values for the HTML template
  // Later this can be made dynamic when generating book-specific HTML files
  const defaultBookConfig = { title: "BookGenius", author: "Books reimagined", language: "english", slug: "Romeo-And-Juliet-Small", bookForm: "play" };

  const getSplashScreenTexts = (bookLang: string, bookSlug: string) => {
    const langCodeMap: { [key: string]: string } = { polish: "pl", english: "en" };
    const langCode = langCodeMap[bookLang.toLowerCase()] || bookLang;

    const langFilePath = path.resolve(__dirname, `public/locales/${langCode}/translation.json`);
    const langFileContent = JSON.parse(fs.readFileSync(langFilePath, "utf-8"));

    const bookSpecificPhrases = langFileContent.books?.[bookSlug]?.loading_phrases;
    const loadingPhrases = bookSpecificPhrases || langFileContent.loading_phrases;

    return { splashSubtitle: langFileContent.splash_subtitle, startButtonText: langFileContent.start_button, loadingPhrases: JSON.stringify(loadingPhrases) };
  };

  return {
    base: config.base || undefined,
    optimizeDeps: { include: ["workbox-core", "workbox-precaching", "workbox-routing", "workbox-strategies", "workbox-range-requests"] },
    plugins: [
      createHtmlPlugin({
        inject: {
          data: {
            lang: defaultBookConfig.language,
            title: defaultBookConfig.title,
            subtitle: defaultBookConfig.author,
            // This will need to be dynamic based on the book being loaded
            loaderVideoSrc: `/Romeo-And-Juliet-Small/assets/loader.mp4`,
            ...getSplashScreenTexts(defaultBookConfig.language, defaultBookConfig.slug),
            bookForm: defaultBookConfig.bookForm,
          },
        },
      }),
      react(),
      VitePWA({
        srcDir: "src",
        filename: "sw.ts",
        strategies: "injectManifest",
        injectManifest: { globPatterns: ["**/*.{js,css,svg,png,webp}"], maximumFileSizeToCacheInBytes: 30000000 },
        manifest: {
          name: defaultBookConfig.title,
          short_name: defaultBookConfig.slug,
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
      watch: { ignored: ["**/src/data/*.xml", "**/public_books/**", "**/src/data/tools/Text-Editor/*.xml", "**/.vscode/**", "**/.cursor/**", "**/public/**"] },
    },
  };
});
