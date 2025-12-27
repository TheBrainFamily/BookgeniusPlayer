import { JSDOM } from "jsdom";
export const convertHtmlToXml = (html: string) => {
  const dom = new JSDOM(html);

  const document = dom.window.document;

  const mainSection = findMainSection(document);

  // console.log("replying notes and brs again", mainSection);
  const result = mainSection
    .replace(/<note id="(\d+)">\[\d+\]<\/note>/g, '<note id="$1"></note>')
    .replace(/<br\s*\/?>/g, "<br/>");
  return wrapMainSectionByXmlTags(result);
};

const findMainSection = (document: Document) => {
  const sections = document.querySelectorAll("body");

  return sections[0].outerHTML;
};

const wrapMainSectionByXmlTags = (mainSection: string) => {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<main>\n${mainSection}\n</main>`;
};
