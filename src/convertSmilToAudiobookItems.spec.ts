import { test, expect, describe } from "@jest/globals";
import { convertSmilToAudiobookItems } from "./convertSmilToAudiobookItems";
// Note: In a real Jest setup, you might need to configure Jest to handle ES modules
// or ensure your tsconfig.json output is CommonJS if Jest expects that.
// For this example, we're assuming the import works in the execution environment.

// Corrected and completed exampleData for the test
const exampleData = `
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
// Jest tests
describe("convertSmilToAudiobookItems", () => {
  test("should parse audiobook tracks and extract paragraph from ID", () => {
    const result = convertSmilToAudiobookItems(exampleData);

    // Check if result has enough items before accessing by index
    expect(result.length).toBeGreaterThanOrEqual(2);

    // Corrected assertions
    expect(result[0]).toEqual({
      chapter: 1,
      paragraph: 6, // Extracted from par000007
      smile_id: "sec8",
      file: "audiobook_data/book0.mp3",
      "clip-begin": 140.84,
      "clip-end": 142.92,
    });
    expect(result[1]).toEqual({
      chapter: 1,
      paragraph: 7, // Extracted from par000008
      smile_id: "sec9",
      file: "audiobook_data/book0.mp3",
      "clip-begin": 142.92,
      "clip-end": 163.84,
    });
    expect(result[2]).toEqual({
      chapter: 2, // from book1.html
      paragraph: 14, // from par000015
      smile_id: "sectionAlpha",
      file: "audiobook_data/book1_audio.mp3",
      "clip-begin": 5.5,
      "clip-end": 10.0,
    });
  });

  test("should return empty array for empty SMIL content", () => {
    const emptySmil = `<smil><body><seq></seq></body></smil>`;
    const result = convertSmilToAudiobookItems(emptySmil);
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
    const result = convertSmilToAudiobookItems(xmlMissingChildren);
    expect(result.length).toBe(1);
    expect(result[0].paragraph).toBe(2);
  });
});

const anotherExample = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE smil PUBLIC "-//W3C//DTD SMIL 1.0//EN" "SMIL10.dtd">
<smil>
	<head>
		<meta name="dc:format" content="Daisy 2.02"/>
		<meta name="ncc:timeInThisSmil" content="00:03:15.282"/>
		<meta name="ncc:totalElapsedTime" content="00:00:06.141"/>
		<layout>
			<region id="txt-view"/>
		</layout>
		<meta name="ncc:generator" content="EasePublisher 2.11 Build 134 # 044FS2211168612"/>
    <meta name="title" content="I. Czarodziejskie zwierciadło"/>
    <meta name="dc:title" content="Królowa śniegu"/>
    <meta name="dc:identifier" content="Unknown"/>
  </head>
	<body>
		<seq dur="195.282s">
			<par endsync="last" id="wsst_0003">
				<text src="królowa śniegu.html#dol_1_2_2_wsst_0003" id="wsst_0033"/>
				<seq>
					<audio src="2_I__Czarodziejskie_.mp3" clip-begin="npt=0.000s" clip-end="npt=4.957s" id="audio_0001"/>
				</seq>
			</par>
			<par endsync="last" id="wsst_0051" system-required="pagenumber-on">
				<text src="królowa śniegu.html#dol_1_2_2_wsst_0004" id="wsst_0034"/>
				<seq>
					<audio src="2_I__Czarodziejskie_.mp3" clip-begin="npt=4.957s" clip-end="npt=8.165s" id="audio_0002"/>
				</seq>
			</par>
			<par endsync="last" id="wsst_0005">
				<text src="królowa śniegu.html#dol_1_2_2_wsst_0005" id="wsst_0035"/>
				<seq>
					<audio src="2_I__Czarodziejskie_.mp3" clip-begin="npt=8.165s" clip-end="npt=17.875s" id="audio_0003"/>
				</seq>
			</par>
			<par endsync="last" id="wsst_0006">
				<text src="królowa śniegu.html#dol_1_2_2_wsst_0006" id="wsst_0036"/>
				<seq>
					<audio src="2_I__Czarodziejskie_.mp3" clip-begin="npt=17.875s" clip-end="npt=34.841s" id="audio_0004"/>
				</seq>
			</par>
      </seq>
	</body>
</smil>`;

test("different id format", () => {
  const result = convertSmilToAudiobookItems(anotherExample);
  expect(result.length).toBe(4);
  expect(result[0].paragraph).toBe(0);
  expect(result[1].paragraph).toBe(1);
  expect(result[2].paragraph).toBe(2);
  expect(result[3].paragraph).toBe(3);
});
