import { JSDOM } from "jsdom";
export const convertHtmlToXml = (html: string) => {
  const dom = new JSDOM(html);

  const document = dom.window.document;

  const mainSection = findMainSection(document);

  const result = mainSection
    .replace(/<note id="(\d+)">\[(\d+)\]<\/note>/g, '<a data-note="$1">[$2]</a>')
    .replace(/<br\s*\/?>/g, "<br/>")
    .replace(/<hr\s*\/?>/g, "<hr/>")
    .replace(/<img([^>]*[^/])>/g, "<img$1/>")
    .replace(/&nbsp;/g, "&#160;");
  return wrapMainSectionByXmlTags(result);
};

const findMainSection = (document: Document) => {
  const sections = document.querySelectorAll("body");

  return sections[0].outerHTML;
};

const wrapMainSectionByXmlTags = (mainSection: string) => {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<main>\n${mainSection}\n</main>`;
};
