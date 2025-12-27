import fs from "fs";
import path from "path";
import { getLanguageName } from "../src/tools/getLanguageName";
import { franc } from "franc";

const createBookDirectory = (frontendBookPath: string) => {
  if (!fs.existsSync(frontendBookPath)) {
    fs.mkdirSync(frontendBookPath, { recursive: true });
    console.log(`${frontendBookPath} has been created successfully!`);
  }
};

const createBookAssetsDirectory = (frontendBookPath: string) => {
  const assetsPath = path.join(frontendBookPath, "assets");
  if (!fs.existsSync(assetsPath)) {
    fs.mkdirSync(assetsPath, { recursive: true });
    console.log(`${assetsPath} has been created successfully!`);
  }
};

const detectBookLanguage = (serverBookPath: string) => {
  const allChaptersPath = path.join(serverBookPath, "output", "all-chapters.xml");
  if (!fs.existsSync(allChaptersPath)) {
    console.log(`Warning: ${allChaptersPath} does not exist. Skipping chapter creation.`);
    return;
  }
  const allChaptersContent = fs.readFileSync(allChaptersPath, "utf-8");
  return getLanguageName(franc(allChaptersContent));
};

const createChapters = (serverBookPath: string, frontendBookPath: string) => {
  // Create booksContent directory if it doesn't exist
  const booksContentPath = path.join(frontendBookPath, "booksContent");
  if (!fs.existsSync(booksContentPath)) {
    fs.mkdirSync(booksContentPath, { recursive: true });
    console.log(`${booksContentPath} has been created successfully!`);
  }

  // Read the all-chapters.xml file
  const allChaptersPath = path.join(serverBookPath, "output", "all-chapters.xml");
  if (!fs.existsSync(allChaptersPath)) {
    console.log(`Warning: ${allChaptersPath} does not exist. Skipping chapter creation.`);
    return;
  }

  const allChaptersContent = fs.readFileSync(allChaptersPath, "utf-8");

  // Extract individual chapters using regex to find <Chapter> tags
  const chapterRegex = /<Chapter[^>]*>[\s\S]*?<\/Chapter>/g;
  const chapters = allChaptersContent.match(chapterRegex);

  if (!chapters || chapters.length === 0) {
    console.log("Warning: No chapters found in all-chapters.xml");
    return;
  }

  // Save each chapter as a separate file
  chapters.forEach((chapter, index) => {
    const chapterNumber = index + 1;
    const chapterFileName = `chapter${chapterNumber}.xml`;
    const chapterFilePath = path.join(booksContentPath, chapterFileName);

    fs.writeFileSync(chapterFilePath, chapter, "utf-8");
    console.log(`${chapterFilePath} has been created successfully!`);
  });

  console.log(`Created ${chapters.length} chapter files in ${booksContentPath}`);
};

const createMetadataXml = (serverBookPath: string, frontendBookPath: string, bookTitle: string) => {
  // Get the booksContent path
  const booksContentPath = path.join(frontendBookPath, "booksContent");

  // Read the characters-master-summaries.xml file
  const charactersMasterPath = path.join(serverBookPath, "output", "characters-master-summaries.xml");
  if (!fs.existsSync(charactersMasterPath)) {
    console.log(`Warning: ${charactersMasterPath} does not exist. Skipping metadata creation.`);
    return;
  }

  const charactersMaster = fs.readFileSync(charactersMasterPath, "utf-8");

  // Create book slug from title (convert to lowercase, replace spaces with hyphens)
  const bookSlug = bookTitle.toLowerCase().replace(/\s+/g, "-");

  const bookLanguage = detectBookLanguage(serverBookPath) || "English";

  // Create the metadata XML content
  const metadataXml = `<?xml version="1.0" encoding="UTF-8" ?>
<ebook id="demo-single-source" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xi="http://www.w3.org/2001/XInclude" xsi:noNamespaceSchemaLocation="ebook.xsd">

    ${charactersMaster}

    <BookMetadata>
        <Slug>${bookSlug}</Slug>
        <Title>${bookTitle}</Title> 
        <Author>William Shakespeare</Author>
        <Language>${bookLanguage}</Language>
    </BookMetadata>

</ebook>`;

  // Write the metadata.xml file
  const metadataPath = path.join(booksContentPath, "metadata.xml");
  fs.writeFileSync(metadataPath, metadataXml, "utf-8");
  console.log(`${metadataPath} has been created successfully!`);
};

// const createBookXml = (
//   serverBookPath: string,
//   frontendBookPath: string,
//   bookTitle: string,
//   lang: string = "English"
// ) => {
//   const charactersMasters = fs.readFileSync(
//     path.join(serverBookPath, "output", "characters-master-summaries.xml"),
//     "utf-8"
//   );
// const chapters = fs.readFileSync(path.join(serverBookPath, "output", "all-chapters.xml"), "utf-8");
// const bookSlug = `<BookSlug>${bookTitle}</BookSlug>`;
// const bookLanguage = `<BookLanguage>${lang}</BookLanguage>`;

// const xmlString = `<?xml version="1.0" encoding="UTF-8" ?>\n<ebook id="demo-single-source" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xi="http://www.w3.org/2001/XInclude" xsi:noNamespaceSchemaLocation="ebook.xsd">\n\n${charactersMasters}\n\n${bookSlug}\n${bookLanguage}\n\n${chapters}\n</ebook>`;

// fs.writeFileSync(path.join(frontendBookPath, "book.xml"), xmlString, "utf-8");
// console.log(`${frontendBookPath}/book.xml has been created successfully!`);
// };

const createEmptyFiles = (frontendBookPath: string) => {
  const emptyFiles = [
    {
      name: "getCutScenesForBook.ts",
      content:
        'import type { CutSceneForBook } from "@player/types/book";\n' + "\n" + "export const getCutScenesForBook = (): CutSceneForBook[] => {\n" + "  return [];\n" + "};\n",
    },
    {
      name: "getBackgroundSongsForBook.ts",
      content: 'import type { BackgroundSongForBook } from "@player/types/book";\n' + "\n" + "export const getBackgroundSongsForBook = (): BackgroundSongForBook[] => [];\n",
    },
  ];

  emptyFiles.forEach(({ name, content }) => {
    const filePath = path.join(frontendBookPath, name);
    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`${filePath} has been created successfully!`);
  });
};

const createBackgroundsForBookFile = (serverBookPath: string, frontendBookPath: string) => {
  const videoOutputsPath = path.join(serverBookPath, "video-outputs");
  const imageOutputsPath = path.join(serverBookPath, "output", "backgrounds");
  const getBackgroundsForBookFilePath = path.join(frontendBookPath, "getBackgroundsForBook.ts");

  if (fs.existsSync(videoOutputsPath)) {
    const videoOutputs = fs.readdirSync(videoOutputsPath);

    console.log("145: videoOutputs BANG!", videoOutputs);

    const mp4Files = videoOutputs.filter((file) => file.endsWith(".mp4"));

    const videoOutputsFiles = [...mp4Files].sort((a, b) => {
      const getFileNumber = (path: string) => parseInt(path.split("-")[2], 10);
      return getFileNumber(a) - getFileNumber(b);
    });

    const videos = videoOutputsFiles.map((video) => {
      const filenamePattern = /^.+-.+-\d+-\d+\.mp4$/;
      if (!filenamePattern.test(video)) {
        throw new Error(`Invalid video filename "${video}". Expected format "<prefix>-<scope>-<chapter>-<paragraph>.mp4".`);
      }
      const chapterNumber = parseInt(video.split("-")[2], 10);
      const paragraphNumber = parseInt(video.split("-")[3], 10);

      return { chapter: chapterNumber, paragraph: paragraphNumber === 1 ? 0 : paragraphNumber, file: video };
    });

    const content =
      'import type { BackgroundForBook } from "@player/types/book";\n' +
      "\n" +
      `export const getBackgroundsForBook = (): BackgroundForBook[] => ${JSON.stringify(videos, null, 2)};
  `;

    fs.writeFileSync(getBackgroundsForBookFilePath, content, "utf-8");
    console.log(`${getBackgroundsForBookFilePath} has been created successfully!`);
  } else if (fs.existsSync(imageOutputsPath)) {
    const imageOutputs = fs.readdirSync(imageOutputsPath);
    const pngFiles = imageOutputs.filter((file) => file.endsWith(".png"));
    const imageOutputsFiles = [...pngFiles].sort((a, b) => {
      const getFileNumber = (path: string) => parseInt(path.split("-")[2], 10);
      return getFileNumber(a) - getFileNumber(b);
    });

    const images = imageOutputsFiles.map((image) => {
      const filenamePattern = /^.+-.+-\d+-\d+\.png$/;
      if (!filenamePattern.test(image)) {
        throw new Error(`Invalid image filename "${image}". Expected format "<prefix>-<scope>-<chapter>-<paragraph>.png".`);
      }
      const chapterNumber = parseInt(image.split("-")[2], 10);
      const paragraphNumber = parseInt(image.split("-")[3], 10);

      return { chapter: chapterNumber, paragraph: paragraphNumber === 1 ? 0 : paragraphNumber, file: image };
    });

    const content =
      'import type { BackgroundForBook } from "@player/types/book";\n' +
      "\n" +
      `export const getBackgroundsForBook = (): BackgroundForBook[] => ${JSON.stringify(images, null, 2)};
  `;

    fs.writeFileSync(getBackgroundsForBookFilePath, content, "utf-8");
    console.log(`${getBackgroundsForBookFilePath} has been created successfully!`);
  } else {
    const content =
      'import type { BackgroundForBook } from "@player/types/book";\n' +
      "\n" +
      `export const getBackgroundsForBook = (): BackgroundForBook[] => [];
  `;

    fs.writeFileSync(getBackgroundsForBookFilePath, content, "utf-8");
    console.log(`${getBackgroundsForBookFilePath} has been created successfully!`);
  }
};

const copyCharacters = (serverBookPath: string, frontendBookPath: string) => {
  const charactersPath = path.join(serverBookPath, "output", "characters");
  const characters = fs.readdirSync(charactersPath);
  characters.forEach((character) => {
    const characterPath = path.join(charactersPath, character);
    if (character.endsWith(".png")) {
      const filePath = path.join(frontendBookPath, "assets", character);
      fs.copyFileSync(characterPath, filePath);
      console.log(`${filePath} has been copied successfully!`);
    }
  });
};

const copyVideoBackgrounds = (serverBookPath: string, frontendBookPath: string) => {
  const videoBackgroundsPath = path.join(serverBookPath, "video-outputs");
  const videoBackgrounds = fs.readdirSync(videoBackgroundsPath);
  videoBackgrounds.forEach((videoBackground) => {
    const videoBackgroundPath = path.join(videoBackgroundsPath, videoBackground);
    if (videoBackground.endsWith(".mp4")) {
      const filePath = path.join(frontendBookPath, "assets", videoBackground);
      fs.copyFileSync(videoBackgroundPath, filePath);
      console.log(`${filePath} has been copied successfully!`);
    }
  });
};

const copyImageBackgrounds = (serverBookPath: string, frontendBookPath: string) => {
  const candidateDirs = [path.join(serverBookPath, "output", "images"), path.join(serverBookPath, "output", "backgrounds")];
  const copied = new Set<string>();
  for (const dir of candidateDirs) {
    try {
      const entries = fs.readdirSync(dir);
      entries.forEach((entry) => {
        if (!entry.endsWith(".png")) return;
        if (copied.has(entry)) return;
        const src = path.join(dir, entry);
        const dest = path.join(frontendBookPath, "assets", entry);
        fs.copyFileSync(src, dest);
        copied.add(entry);
        console.log(`${dest} has been copied successfully!`);
      });
    } catch (_) {
      // Directory not found; skip
    }
  }
};

const copyAssets = (serverBookPath: string, frontendBookPath: string) => {
  copyCharacters(serverBookPath, frontendBookPath);
  // Attempt both; functions are idempotent and guard missing dirs
  try {
    copyVideoBackgrounds(serverBookPath, frontendBookPath);
  } catch (e) {
    console.log("no video backgrounds");
  }
  copyImageBackgrounds(serverBookPath, frontendBookPath);
};

const copyBookImages = (serverBookPath: string, frontendBookPath: string) => {
  const bookImagesPath = path.join(serverBookPath, "input", "assets");
  try {
    const bookImages = fs.readdirSync(bookImagesPath);
    bookImages.forEach((bookImage) => {
      const bookImagePath = path.join(bookImagesPath, bookImage);
      const filePath = path.join(frontendBookPath, "assets", bookImage);
      fs.copyFileSync(bookImagePath, filePath);
    });
  } catch {
    console.log("No book images");
  }
};

const doIt = () => {
  const bookPath = process.argv[2];
  const frontendRepoPath = process.argv[3]; // Absolute Path To Frontend Repo

  if (!bookPath || !frontendRepoPath) {
    console.log("Missing required arguments $BOOK_PATH $ABSOLUTE_PATH_FRONTEND_REPO");
    process.exit(0);
  }

  if (!bookPath.startsWith("books-data")) {
    console.log("$BOOK_PATH should look like books-data/krolowa-sniegu");
    process.exit(0);
  }

  const bookTitle = bookPath.replace("books-data/", "");

  const formattedBookTitle = bookTitle
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("-");

  const frontendBookPath = path.join(frontendRepoPath, "apps", "player", "public_books", formattedBookTitle);
  const serverBookPath = bookPath;

  createBookDirectory(frontendBookPath);
  createBookAssetsDirectory(frontendBookPath);
  // createBookXml(serverBookPath, frontendBookPath, formattedBookTitle);
  createEmptyFiles(frontendBookPath);
  createChapters(serverBookPath, frontendBookPath);
  createMetadataXml(serverBookPath, frontendBookPath, formattedBookTitle);
  createBackgroundsForBookFile(serverBookPath, frontendBookPath);
  copyAssets(serverBookPath, frontendBookPath);
  copyBookImages(serverBookPath, frontendBookPath);
  console.log("All the book's data has been moved successfully!");
};

if (require.main === module) {
  doIt();
}
