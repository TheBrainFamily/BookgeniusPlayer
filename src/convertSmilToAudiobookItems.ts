import { DOMParser, Element } from "@xmldom/xmldom"; // Using @xmldom/xmldom
import fs from "fs";

// Interface for the desired output object
interface OutputItem {
  chapter: number;
  paragraph: number;
  smile_id: string;
  file: string;
  "clip-begin": number;
  "clip-end": number;
}

/**
 * Parses an NPT (Normal Play Time) string (e.g., "npt=123.45s" or "npt=123s")
 * and returns the time in seconds as a number.
 * Returns NaN if parsing fails.
 * @param nptString The NPT string to parse.
 */
function parseNptTime(nptString: string | null): number {
  if (!nptString) {
    return NaN;
  }
  const match = nptString.match(/npt=([\d.]+s?)/i);
  if (match && match[1]) {
    return parseFloat(match[1].replace(/s$/i, ""));
  }
  const directFloat = parseFloat(nptString);
  if (!isNaN(directFloat)) {
    return directFloat;
  }
  console.warn(`Could not parse NPT time: "${nptString}"`);
  return NaN;
}

/**
 * Parses a SMIL XML string using @xmldom/xmldom and converts its paragraph elements
 * into a structured array.
 * @param xmlString The SMIL XML content as a string.
 * @returns An array of OutputItem objects.
 */
export function convertSmilToAudiobookItems(xmlString: string): OutputItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  const parseErrors = doc.getElementsByTagName("parsererror");
  if (parseErrors.length > 0) {
    const errorElement = parseErrors[0];
    const errorDetails = errorElement.textContent || "Unknown XML parsing error";
    console.error("XML Parsing Error:", errorDetails.trim());
    throw new Error("Failed to parse SMIL XML: " + errorDetails.trim());
  }

  const outputItems: OutputItem[] = [];

  const smilElements = doc.getElementsByTagName("smil");
  if (!smilElements || smilElements.length === 0) {
    console.warn("SMIL XML structure missing <smil> tag.");
    return [];
  }
  const bodyElements = smilElements[0].getElementsByTagName("body");
  if (!bodyElements || bodyElements.length === 0) {
    console.warn("SMIL XML structure missing <body> tag inside <smil>.");
    return [];
  }
  const seqElements = bodyElements[0].getElementsByTagName("seq");
  if (!seqElements || seqElements.length === 0) {
    console.warn("SMIL XML structure missing <seq> tag inside <body>.");
    return [];
  }

  const parNodeList = seqElements[0].getElementsByTagName("par");
  const parElements: Element[] = Array.from(parNodeList);

  parElements.forEach((parElement, index) => {
    // Removed index as it's no longer primary for paragraph num
    const parId = parElement.getAttribute("id");

    const textElement = parElement.getElementsByTagName("text")[0] as Element | undefined;
    const audioElement = parElement.getElementsByTagName("audio")[0] as Element | undefined;

    if (!textElement) {
      console.warn(`Skipping <par> element (ID: ${parId || "N/A"}) due to missing <text> child.`);
      return;
    }
    if (!audioElement) {
      console.warn(`Skipping <par> element (ID: ${parId || "N/A"}) due to missing <audio> child.`);
      return;
    }

    const textSrc = textElement.getAttribute("src");
    const audioSrcAttr = audioElement.getAttribute("src");
    const clipBeginStr = audioElement.getAttribute("clip-begin");
    const clipEndStr = audioElement.getAttribute("clip-end");

    if (!parId) {
      console.warn(`Skipping <par> element with missing 'id' attribute. Cannot determine paragraph number.`);
      return;
    }
    if (!textSrc) {
      console.warn(`Skipping <par> (ID: ${parId}) due to missing 'src' attribute on <text>.`);
      return;
    }
    if (!audioSrcAttr || !clipBeginStr || !clipEndStr) {
      console.warn(`Skipping <par> (ID: ${parId}) due to missing attributes on <audio> (expected src, clip-begin, clip-end).`);
      return;
    }

    // 1. Determine Chapter Number
    const bookMatch = textSrc.match(/book(\d+)\.html/i);
    let chapter: number;
    if (bookMatch && bookMatch[1]) {
      chapter = parseInt(bookMatch[1], 10) + 1;
    } else {
      const dolMatch = textSrc.match(/#dol_1_(\d+)_/i);
      if (dolMatch && dolMatch[1]) {
        chapter = parseInt(dolMatch[1], 10) - 1;
      } else {
        // If both bookMatch and dolMatch fail, then warn and skip.
        console.warn(`Could not determine chapter number from text src: "${textSrc}" for <par> (ID: ${parId}). Tried bookN.html and #dol_1_N_ patterns. Skipping.`);
        return;
      }
    }

    // 2. Determine Paragraph Number from parId
    let paragraph: number;
    const parIdMatch = parId.match(/^par(\d+)$/i); // Matches "par" followed by digits
    if (parIdMatch && parIdMatch[1]) {
      paragraph = parseInt(parIdMatch[1], 10);
    } else {
      paragraph = index + 1;
      console.warn(`Could not parse paragraph number from id: "${parId}". Using index: ${index}.`);
    }

    // 3. Determine smile_id
    const smileIdMatch = textSrc.match(/#(.+)$/);
    let smile_id: string;
    if (smileIdMatch && smileIdMatch[1]) {
      smile_id = smileIdMatch[1];
    } else {
      console.warn(`Could not determine smile_id from text src: "${textSrc}" for <par> (ID: ${parId}). Skipping.`);
      return;
    }

    // 4. Determine File Path for audio
    const file = `audiobook_data/${audioSrcAttr}`;

    // 5. Determine Clip Begin and End times
    const clipBeginTime = parseNptTime(clipBeginStr);
    const clipEndTime = parseNptTime(clipEndStr);

    if (isNaN(clipBeginTime) || isNaN(clipEndTime)) {
      console.warn(`Invalid NPT time(s) for <par> with smile_id "${smile_id}" (ID: ${parId}, clip-begin: "${clipBeginStr}", clip-end: "${clipEndStr}"). Skipping.`);
      return;
    }

    const item: OutputItem = { chapter, paragraph: paragraph - 1, smile_id, file, "clip-begin": clipBeginTime, "clip-end": clipEndTime };
    outputItems.push(item);
  });

  return outputItems;
}

if (require.main === module) {
  const allItems: OutputItem[] = [];
  Array.from(Array(8).keys()).forEach((i) => {
    const contentFilePath = `/Users/tomaszgierczynski/projects/bookgenius-frontend/public_books/Krolowa-Sniegu/audiobook_data/xtkq000${i + 1}.smil`;
    console.log(`Processing ${contentFilePath}`);
    const content = fs.readFileSync(contentFilePath, "utf8");
    const items = convertSmilToAudiobookItems(content);
    allItems.push(...items);
  });

  console.log(allItems);

  fs.writeFileSync("krolowa-sniegu_audiobook_items.json", JSON.stringify(allItems, null, 2));
}
