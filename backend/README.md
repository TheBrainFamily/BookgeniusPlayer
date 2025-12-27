# Book Viewer with Enhanced Metadata


1. **Clone the repository:**

```bash
git clone <repository-url>
cd <repository-directory>
```

2. **Install dependencies:**

```bash
pnpm install
```

4. **Scripts and tools:**

We expect to have a books-data directory with books inside. We start by creating a directory for a new book, then we create input, output and temporary-output dirs inside.

Example:
```bash
/repo-root
  /books-data
    /<BOOK_FOLDER_NAME>
      /input
      /output
      /temporary-output
```
## How to make a book from scratch

1.  Download **fb2** – it's a CLI tool that creates the necessary folders and more.

    ```bash
    pnpm run generate-new-book
    ```
    alternatively you can run 
    ```bash
    tsx src/tools/fb2-converter/index.ts bookTitle 1
    ```
    where 1 is a starting chapter

2.  After downloading fb2, you should see a folder named after your book in the `books-data` directory (e.g., `krolowa-sniegu`). Inside, the structure will look like this:

    ```
    .
    └── books-data/
        └── krolowa-sniegu/
            ├── input/
            │   ├── krolowa-sniegu.fb2
            │   ├── rich.xml
            │   ├── bookChapters.xml
            │   └── bookText.html
            ├── output/
            │   └── EMPTY
            └── temporary-output/
                └── EMPTY
    ```

3.  The file you'll run is `character-metadata-simple.ts`. It contains commented-out functions; start by generating `getReferenceCardsForWholeBook`. `ROOT_PATH_BOOK` would be, for instance, `books-data/krolowa-sniegu`.

    ```bash
    tsx src/tools/new-tooling/character-metadata-simple.ts ROOT_PATH_BOOK
    ```

4.  The result will be the `output/single-summary-per-person.json` file.

5.  The next step is to uncomment the `identifyCharactersAndRewriteParagraphs` function. Running it should generate several files. The ones you're interested in are `rewritten-paragraphs-for-chapter-N`, where 'N' is the chapter number. There will be one file for each chapter in the book.

6.  In this step, you need to review all the aforementioned files and ensure that character tags, indicating when they are speaking, have been added correctly, like `<Gerda talking="true" />`. If not, you'll need to adjust the `RewriteParagraphsPrompt.md` prompt.

7.  The next step involves character images, specifically running `generatePicturesForEntities`. Inside the function, locate `generalPrompt` and replace it with the specific prompt for your book. After running, you should get `generatedPrompts.json` and `.png` files. If images aren't generated, run the code again.

8.  Next, run `makeRollingChapterSummaries` and `turnChapterSummariesIntoBulletPointsMappedToParagraphs` – do not run them in parallel, but you can have both of them uncommented and run one after another as one script execution.

9.  The next step covers backgrounds; run `generateBackgrounds`. For this, you'll need the `visualStyleConfig.json` file:

    ```json
    {
      "backgroundStyle": "",
      "periodStyle": ""
    }
    ```

10. Use the prompts you have for the given book to generate images. The results should appear in the `output` directory.

11. You can immediately convert these images into video. To do this, place all the images you want to animate into `output/images` (you might need to create the `images` folder manually). Then, run:

    ```bash
    tsx src/tools/experiments/auto-image-to-video.ts
    ```

    **IMPORTANT**: After the videos are generated and downloaded (this happens automatically), a Python script will launch to loop the video. If any error occurs, **do not** run `auto-image-to-video` again. Instead, run:

    ```bash
    tsx .scripts/run-boomerang.ts books-data/BOOK_NAME/video-outputs
    ```

12. Run `generateIntroSummary` to generate a brief introduction for each character. This script will automatically generate the required `all-chapters.xml` and `characters-master-summaries.xml` files, so you can skip step 13 and proceed directly to the 'Move to Frontend' section.

13. The final two functions to run are `generateCharactersMaster` and `pullTogetherChapters`.

---

## Moving the Book and Assets to the Frontend

1. To move the book to the frontend repository, you need to run this script:

    ```bash
    tsx .scripts/move-to-frontend.ts books-data/krolowa-sniegu ~/your/path/to/bookgenius-frontend     
    ```

2. Once its moved, you can run the frontend:

    ```bash
    pnpm start public_books/Krolowa-Sniegu
    ```
   
## Generating rich.xml from chapters.xml from frontend repo

1. To generate rich.xml from chapters.xml files, use this:
    ```bash
      tsx .scripts/generateRichXml.ts books-data/Macbeth ~/your/path/to/bookgenius-frontend
    ```
