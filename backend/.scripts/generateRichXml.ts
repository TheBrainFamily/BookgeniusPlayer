import { configureBookPaths } from "../src/helpers/configureBookPaths";
import fs from "fs";
import path from "path";
import { getBookContent } from "../src/helpers/getBookContent";
import { getActs } from "../src/helpers/getActs";
import { DOMParser, Element } from "@xmldom/xmldom";
import { formatWithPrettier } from "../src/helpers/formatWithPrettier";
import { removeSpansFromChapterXml } from "../src/helpers/removeSpansFromChapterXml";

export const generateRichXml = async () => {
  let bookContent: string;
  const richXmlInit = `<?xml version="1.0" encoding="UTF-8"?>
<main>
<body>
{{CHAPTERS}}
</body>
</main>
`;

  const { frontendBookPath, serverBookPath } = configureBookPaths();

  const { bookXml, chapters } = getBookContent(frontendBookPath);

  // const chaptersWithoutSimplifiedSpans = Array.from(chapters.values()).map((chapter) =>
  //   removeSpansFromChapterXml(chapter),
  // );
  // console.log(chaptersWithoutSimplifiedSpans);

  const { hasActs, actsMap } = getActs(bookXml);

  const parser = new DOMParser();
  const chapterElements = Array.from(chapters.values()).map((chapter) => {
    const chapterString = parser.parseFromString(chapter, "text/xml");
    return chapterString.getElementsByTagName("Chapter")[0];
  });

  chapterElements.forEach((chapter) => {
    Array.from(chapter.getElementsByTagName("span")).forEach((span) => {
      if (span.getAttribute("id")?.startsWith("ch")) {
        // Unwrap the <span>: move its children to its parent, then remove the span
        const parent = span.parentNode;
        if (parent) {
          while (span.firstChild) {
            parent.insertBefore(span.firstChild, span);
          }
          parent.removeChild(span);
        }
      }
    });
  });

  if (hasActs) {
    bookContent = generateRichXmlWithActs(chapterElements, actsMap);
  } else {
    bookContent = handleChapters(chapterElements, false).join(" ");
  }

  const richXml = richXmlInit.replace("{{CHAPTERS}}", bookContent);
  const beautifyRichXml = await formatWithPrettier(richXml);
  fs.writeFileSync(path.join(serverBookPath, "input", "current-rich.xml"), beautifyRichXml, "utf-8");
};

const generateRichXmlWithActs = (chapters: Element[], actsMap: Map<string, Element[]>) => {
  groupChaptersByAct(chapters, actsMap);

  const entireBook: string[] = [];

  for (const [act, chapters] of actsMap) {
    const actContent = handleChapters(chapters, true);

    entireBook.push(`<section><h3>${act}</h3>${actContent.join("")}</section>`);
  }

  return entireBook.join(" ");
};

const groupChaptersByAct = (chapters: Element[], actsMap: Map<string, Element[]>) => {
  let currentAct: string = "";

  for (const chapter of chapters) {
    const actElements = chapter.getElementsByTagName("h3").length > 0 ? chapter.getElementsByTagName("h3") : chapter.getElementsByTagName("Act");

    if (actElements[0]?.textContent) {
      currentAct = actElements[0]?.textContent;
    }

    actsMap.get(currentAct)?.push(chapter);
  }
};

const getInnerHTML = (element: Element): string => {
  return Array.from(element.childNodes)
    .map((node) => node.toString())
    .join("");
};

const handleChapters = (chapters: Element[], hasActs: boolean) => {
  return chapters.map((chapter) => {
    const chapterId = chapter.getAttribute("id");
    const chapterNodes = Array.from(chapter.childNodes).filter((node) => node.nodeType === 1);

    const chapterContent: string[] = [];

    let dataIndex = 1;
    chapterNodes.forEach((node) => {
      const element = node as Element;

      switch (element.tagName) {
        case "Act":
        case "h3":
          chapterContent.push(`<h3>${getInnerHTML(element)}</h3>`);
          break;
        case "Title":
        case "h4":
          chapterContent.push(`<h4>${getInnerHTML(element)}</h4>`);
          break;
        case "Subtitle":
        case "h5":
          chapterContent.push(`<h5>${getInnerHTML(element)}</h5>`);
          break;
        case "p":
        case "span":
          chapterContent.push(`<p>${getInnerHTML(element)}</p>`);
          break;
        case "blockquote":
          chapterContent.push(`<blockquote class="cite">${getInnerHTML(element)}</blockquote>`);
          break;
        default:
          console.warn("!!!!!!WARNING!!!!!");
          console.warn(`---Not allowed tag occurred. Take a look at the source to not omit any paragraph!---`);
          console.warn(`Helpful data to debug`, { tagName: element.tagName, paragraph: element.toString(), chapterId, dataIndex });
      }
    });

    return `<section data-chapter="${chapterId}">${chapterContent.join(" ")}</section>`;
  });
};

if (require.main === module) {
  (async () => {
    await generateRichXml();
  })();
}
