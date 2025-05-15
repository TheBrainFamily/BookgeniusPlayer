import { test, expect } from "@jest/globals";
import { DOMParser, Element } from "@xmldom/xmldom"; // Using @xmldom/xmldom
// Note: In a real Jest setup, you might need to configure Jest to handle ES modules
// or ensure your tsconfig.json output is CommonJS if Jest expects that.
// For this example, we're assuming the import works in the execution environment.

// Corrected and completed exampleData for the test
const exampleData = `
<?xml version='1.0' encoding='ASCII'?>
<!DOCTYPE smil PUBLIC "-//W3C//DTD SMIL 1.0//EN" "SMIL10.dtd">
<smil>
  <head>
    <meta name="dc:format" content="Daisy 2.02" />
    <meta name="ncc:totalElapsedTime" content="00:40:52.741" />
    <layout>
      <region id="txt-view" />
    </layout>
  </head>
  <body>
    <seq>
      <par id="par000007" endsync="last">
        <text src="book0.html#sec8" />
        <audio src="book0.mp3" clip-begin="npt=140.840s" clip-end="npt=142.920s" />
      </par>
      <par id="par000008" endsync="last">
        <text src="book0.html#sec9" />
        <audio src="book0.mp3" clip-begin="npt=142.920s" clip-end="npt=163.840s" />
      </par>
      <par id="par000015" endsync="last">
        <text src="book1.html#sectionAlpha" />
        <audio src="book1_audio.mp3" clip-begin="npt=5.5s" clip-end="npt=10.0s" />
      </par>
    </seq>
  </body>
</smil>
`;

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
export function parseSmilXml(xmlString: string): OutputItem[] {
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

  parElements.forEach((parElement) => {
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
      console.warn(`Could not determine chapter number from text src: "${textSrc}" for <par> (ID: ${parId}). Skipping.`);
      return;
    }

    // 2. Determine Paragraph Number from parId
    let paragraph: number;
    const parIdMatch = parId.match(/^par(\d+)$/i); // Matches "par" followed by digits
    if (parIdMatch && parIdMatch[1]) {
      paragraph = parseInt(parIdMatch[1], 10);
    } else {
      console.warn(`Could not parse paragraph number from id: "${parId}". Skipping.`);
      return;
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

    const item: OutputItem = { chapter, paragraph, smile_id, file, "clip-begin": clipBeginTime, "clip-end": clipEndTime };
    outputItems.push(item);
  });

  return outputItems;
}

// --- Example Usage (Optional - for direct execution if not running tests) ---
function runExample() {
  const exampleXmlInputForRun = `
  
<smil>
  <body>
    <seq>
      <par id="par000007" endsync="last">
        <text src="book0.html#sec8" />
        <audio src="book0.mp3" clip-begin="npt=140.840s" clip-end="npt=142.920s" />
      </par>
      <par id="par000008" endsync="last">
        <text src="book0.html#sec9" />
        <audio src="book0.mp3" clip-begin="npt=142.920s" clip-end="npt=163.840s" />
      </par>
      <par id="par000015" endsync="last">
        <text src="book1.html#sectionAlpha" />
        <audio src="book1_audio.mp3" clip-begin="npt=5.5s" clip-end="npt=10.0s" />
      </par>
      <par id="par000010" endsync="last">
        <text src="book0.html#sec10_malformed_time" />
        <audio src="book0.mp3" clip-begin="npt=badtime" clip-end="npt=170s" />
      </par>
      <par id="par000011" endsync="last">
        <text src="bookNoNum.html#sec11" /> <audio src="book_unknown.mp3" clip-begin="npt=1.0s" clip-end="npt=2.0s" />
      </par>
      <par id="parNoNum"> <text src="book0.html#secValid"/> <audio src="book0.mp3" clip-begin="npt=1.0s" clip-end="npt=2.0s" />
      </par>
    </seq>
  </body>
</smil>
  `;

  try {
    console.log("Parsing SMIL XML (Example Run)...");
    const parsedItems = parseSmilXml(exampleXmlInputForRun);
    console.log("\nParsed Items from valid structure (Example Run):");
    console.log(JSON.stringify(parsedItems, null, 2));
  } catch (err: any) {
    console.error("\nError during example run:", err.message);
  }
}

// Jest tests
describe("parseSmilXml", () => {
  test("should parse audiobook tracks and extract paragraph from ID", () => {
    const result = parseSmilXml(exampleData);

    // Check if result has enough items before accessing by index
    expect(result.length).toBeGreaterThanOrEqual(2);

    // Corrected assertions
    expect(result[0]).toEqual({
      chapter: 1,
      paragraph: 7, // Extracted from par000007
      smile_id: "sec8",
      file: "audiobook_data/book0.mp3",
      "clip-begin": 140.84,
      "clip-end": 142.92,
    });
    expect(result[1]).toEqual({
      chapter: 1,
      paragraph: 8, // Extracted from par000008
      smile_id: "sec9",
      file: "audiobook_data/book0.mp3",
      "clip-begin": 142.92,
      "clip-end": 163.84,
    });
    expect(result[2]).toEqual({
      chapter: 2, // from book1.html
      paragraph: 15, // from par000015
      smile_id: "sectionAlpha",
      file: "audiobook_data/book1_audio.mp3",
      "clip-begin": 5.5,
      "clip-end": 10.0,
    });
  });

  test("should handle missing or malformed par IDs gracefully", () => {
    const xmlWithBadIds = `
    <smil><body><seq>
      <par id="parABC"> <text src="book0.html#sec1" /><audio src="a.mp3" clip-begin="npt=1s" clip-end="npt=2s" />
      </par>
      <par> <text src="book0.html#sec2" /><audio src="b.mp3" clip-begin="npt=3s" clip-end="npt=4s" />
      </par>
      <par id="par001">
         <text src="book0.html#secValid" /><audio src="c.mp3" clip-begin="npt=5s" clip-end="npt=6s" />
      </par>
    </seq></body></smil>`;
    const result = parseSmilXml(xmlWithBadIds);
    // Expect only the valid item to be parsed
    expect(result.length).toBe(1);
    expect(result[0].paragraph).toBe(1);
    expect(result[0].smile_id).toBe("secValid");
  });

  test("should return empty array for empty SMIL content", () => {
    const emptySmil = `<smil><body><seq></seq></body></smil>`;
    const result = parseSmilXml(emptySmil);
    expect(result).toEqual([]);
  });

  test("should skip par elements with missing text or audio children", () => {
    const xmlMissingChildren = `
    <smil><body><seq>
      <par id="par001">
        <audio src="a.mp3" clip-begin="npt=1s" clip-end="npt=2s" />
      </par>
      <par id="par002">
        <text src="book0.html#sec2" />
        </par>
      <par id="par003">
        <text src="book0.html#secValid" /><audio src="c.mp3" clip-begin="npt=5s" clip-end="npt=6s" />
      </par>
    </seq></body></smil>`;
    const result = parseSmilXml(xmlMissingChildren);
    expect(result.length).toBe(1);
    expect(result[0].paragraph).toBe(3);
  });
});

// To run the example directly (if not using Jest runner):
// if (require.main === module) {
//   runExample();
// }
// To run tests: npx jest your_file_name.test.ts (or however your Jest is configured)
