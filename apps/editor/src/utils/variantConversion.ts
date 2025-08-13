import type { Variant } from "../types.ts";

export const convertXmlToVariant = (xml: string): Variant => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const variantsElement = doc.querySelector("Variants");

  if (!variantsElement) {
    throw new Error("Invalid XML: no Variants element found");
  }

  const id = variantsElement.getAttribute("id");

  if (!id) {
    throw new Error("Invalid XML: no Variants id found");
  }

  const spans = variantsElement.querySelectorAll("span");
  const simplifications = Array.from(spans).map((span) => {
    const scoreAttr = span.getAttribute("score");
    const score = scoreAttr ? parseInt(scoreAttr, 10) : 0;
    const sentences = [span.textContent || ""];

    return { score, sentences };
  });

  return { id, simplifications };
};

export const convertVariantToXml = (variant: Variant): string => {
  const lines = [`<Variants id="${variant.id}">`];

  variant.simplifications.forEach((simplification) => {
    const sentence = simplification.sentences[0] || "";
    lines.push(`  <span score="${simplification.score}">${sentence}</span>`);
  });

  lines.push("</Variants>");

  return lines.join("\n");
};
