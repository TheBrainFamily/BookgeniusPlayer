import { configureBookPaths } from "../src/helpers/configureBookPaths";
import { getBookContent } from "../src/helpers/getBookContent";
import { removeSpansFromChapterXml } from "../src/helpers/removeSpansFromChapterXml";
import path from "path";
import fs from "fs";

if (require.main === module) {
  (async () => {
    const { frontendBookPath } = configureBookPaths();

    const { chapters } = getBookContent(frontendBookPath);

    for (const [fileName, chapter] of chapters) {
      fs.writeFileSync(path.join(frontendBookPath, "booksContent", fileName), removeSpansFromChapterXml(chapter), "utf-8");
    }
  })();
}
